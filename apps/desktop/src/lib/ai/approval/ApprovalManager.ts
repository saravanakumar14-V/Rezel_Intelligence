/**
 * Rezel 11.4D — Human-in-the-Loop (HITL) Approval Manager
 *
 * Manages the lifecycle of human approval requests:
 * - Creates pre-mutation approval requests with BEFORE_MUTATION checkpoints
 * - Enforces immutable audit logging for all approval decisions
 * - Revalidates PolicyEngine and application health before resuming approved workflows
 * - Enforces strict no-bypass: PolicyEngine retains absolute authority even over approved requests
 */

import type {
  ApprovalRequest,
  ApprovalAuditRecord,
} from './types';
import { ApprovalError } from './types';
import { WorkflowStore } from '../persistence/WorkflowStore';
import { WorkflowRuntime } from '../WorkflowRuntime';
import { WorkflowCheckpointManager } from '../checkpoints/WorkflowCheckpointManager';
import { PolicyEngine } from '../../security/policy/PolicyEngine';
import { ApplicationRegistry } from '../../applications/ApplicationRegistry';
import { planStateMachine } from '../PlanStateMachine';
import type { RiskLevel } from '../../security/PermissionManager';
import type { Workflow } from '../types';

export class ApprovalManagerImpl {
  /**
   * Creates an approval request and pauses workflow at a BEFORE_MUTATION checkpoint.
   */
  async createApprovalRequest(
    workflowId: string,
    stepId: string,
    options: {
      riskLevel: RiskLevel;
      reason: string;
      summary: string;
      requestedCapabilities?: string[];
      affectedResources?: string[];
      applicationId?: string;
      applicationSessionId?: string;
      provider?: string;
      modelId?: string;
      estimatedCost?: number;
      mutatesExternalState?: boolean;
      expiresInMs?: number;
    }
  ): Promise<ApprovalRequest> {
    const workflow = WorkflowRuntime.get(workflowId) || WorkflowStore.getWorkflow(workflowId);
    if (!workflow) {
      throw new ApprovalError('APPROVAL_NOT_FOUND', `Workflow not found: ${workflowId}`, { workflowId });
    }

    const step = workflow.plan.steps.find((s) => s.id === stepId);
    if (!step) {
      throw new ApprovalError('APPROVAL_NOT_FOUND', `Step ${stepId} not found in workflow ${workflowId}`, {
        workflowId,
        stepId,
      });
    }

    // 1. Create a BEFORE_MUTATION checkpoint
    const checkpoint = await WorkflowCheckpointManager.createCheckpoint(workflowId, {
      type: 'BEFORE_MUTATION',
      stepId,
      reason: `Approval required for ${options.riskLevel} risk step: ${options.reason}`,
    });

    // 2. Set step status to WAITING with USER_CONFIRMATION
    step.status = 'WAITING';
    step.waitingReason = 'USER_CONFIRMATION';
    workflow.status = 'WAITING_FOR_USER';
    workflow.plan.status = 'WAITING_FOR_USER';
    WorkflowStore.saveWorkflow(workflow);

    const now = Date.now();
    const approvalId = `appr_${crypto.randomUUID()}`;
    const expiresAt = options.expiresInMs ? now + options.expiresInMs : undefined;

    const request: ApprovalRequest = {
      approvalId,
      workflowId,
      stepId,
      checkpointId: checkpoint.checkpointId,
      riskLevel: options.riskLevel,
      reason: options.reason,
      summary: options.summary,
      requestedCapabilities: options.requestedCapabilities || (step.toolName ? [step.toolName] : []),
      affectedResources: options.affectedResources || [],
      applicationId: options.applicationId,
      applicationSessionId: options.applicationSessionId,
      provider: options.provider || step.providerRoute?.vendor,
      modelId: options.modelId || step.providerRoute?.modelId,
      estimatedCost: options.estimatedCost,
      mutatesExternalState: options.mutatesExternalState ?? true,
      createdAt: now,
      expiresAt,
      state: 'PENDING',
    };

    // 3. Persist approval request
    WorkflowStore.saveApproval(request);

    // 4. Record audit entry
    this.recordAudit({
      auditId: `audit_${crypto.randomUUID()}`,
      approvalId,
      workflowId,
      stepId,
      riskLevel: options.riskLevel,
      action: step.toolName || 'workflow_step',
      decision: 'PENDING',
      timestamp: now,
      reason: options.reason,
    });

    return request;
  }

  /**
   * Approves a pending request and resumes workflow after strict PolicyEngine & session revalidation.
   */
  async approveRequest(
    approvalId: string,
    actor: string = 'operator',
    reason: string = 'User approved operation'
  ): Promise<{ success: boolean; resumedWorkflow: Workflow }> {
    const request = WorkflowStore.getApproval(approvalId);
    if (!request) {
      throw new ApprovalError('APPROVAL_NOT_FOUND', `Approval request ${approvalId} not found`, { approvalId });
    }

    if (request.state !== 'PENDING') {
      throw new ApprovalError(
        'APPROVAL_ALREADY_DECIDED',
        `Approval ${approvalId} is already in state ${request.state}`,
        { approvalId, state: request.state }
      );
    }

    const now = Date.now();
    if (request.expiresAt && now > request.expiresAt) {
      request.state = 'EXPIRED';
      WorkflowStore.saveApproval(request);
      this.recordAudit({
        auditId: `audit_${crypto.randomUUID()}`,
        approvalId,
        workflowId: request.workflowId,
        stepId: request.stepId,
        riskLevel: request.riskLevel,
        action: 'expire',
        decision: 'EXPIRED',
        timestamp: now,
        reason: 'Approval expired before decision was made',
      });
      throw new ApprovalError('APPROVAL_EXPIRED', `Approval ${approvalId} has expired`, { approvalId });
    }

    // 1. Mark approved
    request.state = 'APPROVED';
    request.decisionTimestamp = now;
    request.decisionReason = reason;
    request.decisionBy = actor;
    WorkflowStore.saveApproval(request);

    // 2. Record audit
    this.recordAudit({
      auditId: `audit_${crypto.randomUUID()}`,
      approvalId,
      workflowId: request.workflowId,
      stepId: request.stepId,
      riskLevel: request.riskLevel,
      action: 'approve',
      decision: 'APPROVED',
      timestamp: now,
      reason,
      actor,
    });

    // 3. HARD INVARIANT: PolicyEngine Revalidation (Approval NEVER bypasses PolicyEngine)
    const workflow = WorkflowRuntime.get(request.workflowId) || WorkflowStore.getWorkflow(request.workflowId)!;
    const step = workflow.plan.steps.find((s) => s.id === request.stepId)!;

    if (step.toolName) {
      const toolGroup = step.toolName.startsWith('fs.') ? 'fs' : (step.toolName.includes('.') ? step.toolName.split('.')[0] : 'system');
      const policyDecision = await PolicyEngine.evaluate({
        capabilityId: step.toolName,
        toolGroup,
        args: (step.toolArgs as Record<string, unknown>) || {},
        activeScopes: [],
      });

      if (policyDecision.decision === 'DENY') {
        throw new ApprovalError(
          'POLICY_REJECTED_AFTER_APPROVAL',
          `PolicyEngine denied approved action '${step.toolName}': ${policyDecision.reason}`,
          { tool: step.toolName, reason: policyDecision.reason }
        );
      }
    }

    // 4. Revalidate application session if targeting an application
    if (request.applicationId) {
      const health = ApplicationRegistry.getHealth(request.applicationId, request.applicationSessionId);
      if (health.state === 'DISCONNECTED') {
        throw new ApprovalError(
          'SESSION_STALE_AFTER_APPROVAL',
          `Application '${request.applicationId}' is disconnected; cannot execute approved step`,
          { applicationId: request.applicationId }
        );
      }
    }

    // 5. Resume workflow execution
    step.status = 'PENDING';
    step.waitingReason = undefined;
    workflow.status = 'RUNNING';
    workflow.plan.status = 'RUNNING';
    WorkflowStore.saveWorkflow(workflow);

    const resumedWorkflow = await WorkflowCheckpointManager.resumeWorkflow(
      request.workflowId,
      request.checkpointId
    );

    return { success: true, resumedWorkflow };
  }

  /**
   * Rejects a pending approval request.
   */
  async rejectRequest(
    approvalId: string,
    actor: string = 'operator',
    reason: string = 'User rejected operation'
  ): Promise<ApprovalRequest> {
    const request = WorkflowStore.getApproval(approvalId);
    if (!request) {
      throw new ApprovalError('APPROVAL_NOT_FOUND', `Approval request ${approvalId} not found`, { approvalId });
    }

    if (request.state !== 'PENDING') {
      throw new ApprovalError(
        'APPROVAL_ALREADY_DECIDED',
        `Approval ${approvalId} is already in state ${request.state}`,
        { approvalId, state: request.state }
      );
    }

    const now = Date.now();
    request.state = 'REJECTED';
    request.decisionTimestamp = now;
    request.decisionReason = reason;
    request.decisionBy = actor;
    WorkflowStore.saveApproval(request);

    // Record audit
    this.recordAudit({
      auditId: `audit_${crypto.randomUUID()}`,
      approvalId,
      workflowId: request.workflowId,
      stepId: request.stepId,
      riskLevel: request.riskLevel,
      action: 'reject',
      decision: 'REJECTED',
      timestamp: now,
      reason,
      actor,
    });

    // Mark step as FAILED in workflow
    const workflow = WorkflowRuntime.get(request.workflowId) || WorkflowStore.getWorkflow(request.workflowId);
    if (workflow) {
      const step = workflow.plan.steps.find((s) => s.id === request.stepId);
      if (step) {
        planStateMachine.failStep(workflow.plan, step, `Operation rejected by user: ${reason}`, 'SECURITY_BLOCKED', 'FAILED');
      }
      workflow.status = 'FAILED';
      WorkflowStore.saveWorkflow(workflow);
    }

    return request;
  }

  /**
   * Cancels a pending approval request (e.g. when workflow is cancelled).
   */
  async cancelRequest(approvalId: string, reason: string = 'Workflow cancelled'): Promise<ApprovalRequest> {
    const request = WorkflowStore.getApproval(approvalId);
    if (!request) {
      throw new ApprovalError('APPROVAL_NOT_FOUND', `Approval request ${approvalId} not found`, { approvalId });
    }

    if (request.state === 'PENDING') {
      request.state = 'CANCELLED';
      request.decisionTimestamp = Date.now();
      request.decisionReason = reason;
      WorkflowStore.saveApproval(request);

      this.recordAudit({
        auditId: `audit_${crypto.randomUUID()}`,
        approvalId,
        workflowId: request.workflowId,
        stepId: request.stepId,
        riskLevel: request.riskLevel,
        action: 'cancel',
        decision: 'CANCELLED',
        timestamp: Date.now(),
        reason,
      });
    }

    return request;
  }

  /**
   * Expires an approval request.
   */
  async expireRequest(approvalId: string): Promise<ApprovalRequest> {
    const request = WorkflowStore.getApproval(approvalId);
    if (!request) {
      throw new ApprovalError('APPROVAL_NOT_FOUND', `Approval request ${approvalId} not found`, { approvalId });
    }

    if (request.state === 'PENDING') {
      request.state = 'EXPIRED';
      request.decisionTimestamp = Date.now();
      request.decisionReason = 'Approval expired';
      WorkflowStore.saveApproval(request);

      this.recordAudit({
        auditId: `audit_${crypto.randomUUID()}`,
        approvalId,
        workflowId: request.workflowId,
        stepId: request.stepId,
        riskLevel: request.riskLevel,
        action: 'expire',
        decision: 'EXPIRED',
        timestamp: Date.now(),
        reason: 'Approval duration expired',
      });
    }

    return request;
  }

  getApprovalRequest(approvalId: string): ApprovalRequest | undefined {
    return WorkflowStore.getApproval(approvalId);
  }

  listPendingApprovals(workflowId?: string): ApprovalRequest[] {
    const all = WorkflowStore.getApprovals(workflowId);
    return all.filter((a) => a.state === 'PENDING');
  }

  getAuditTrail(workflowId?: string): ApprovalAuditRecord[] {
    return WorkflowStore.getApprovalAudits(workflowId);
  }

  private recordAudit(record: ApprovalAuditRecord): void {
    WorkflowStore.saveApprovalAudit(record);
  }
}

export const ApprovalManager = new ApprovalManagerImpl();
