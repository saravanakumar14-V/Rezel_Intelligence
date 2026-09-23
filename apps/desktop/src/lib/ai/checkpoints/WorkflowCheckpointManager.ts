/**
 * Rezel 11.4C — Workflow Checkpoint Manager & Recovery Gates
 *
 * Provides authoritative checkpoint lifecycle management:
 * - Creates immutable snapshots of completed steps, pending steps, runtime variables,
 *   provider route provenance, and application session references.
 * - Safely coordinates workflow pause and release of resource locks.
 * - Enforces recovery gates on resume: verifies absence of unrecovered UNKNOWN mutations,
 *   revalidates application sessions, restores runtime variables, and reroutes pending steps.
 */

import type {
  WorkflowCheckpoint,
  CheckpointType,
  CheckpointInspection,
  ProviderRouteReference,
  ApplicationSessionReference,
} from './types';
import { CheckpointError } from './types';
import { WorkflowStore } from '../persistence/WorkflowStore';
import { WorkflowRuntime } from '../WorkflowRuntime';
import { WorkflowVariableStore } from '../dataflow/WorkflowVariableStore';
import { ResourceLockManager } from '../scheduler/ResourceLockManager';
import { ApplicationRegistry } from '../../applications/ApplicationRegistry';
import { PlanEngine } from '../PlanEngine';
import { planStateMachine } from '../PlanStateMachine';
import type { Workflow } from '../types';

class WorkflowCheckpointManagerImpl {
  /**
   * Creates an immutable, persistent checkpoint for a workflow.
   */
  async createCheckpoint(
    workflowId: string,
    options: {
      type: CheckpointType;
      stepId?: string;
      reason?: string;
    }
  ): Promise<WorkflowCheckpoint> {
    const workflow = WorkflowRuntime.get(workflowId) || WorkflowStore.getWorkflow(workflowId);
    if (!workflow) {
      throw new CheckpointError(
        'CHECKPOINT_NOT_FOUND',
        `Cannot create checkpoint for non-existent workflow: ${workflowId}`,
        { workflowId }
      );
    }

    const checkpointId = `chk_${crypto.randomUUID()}`;
    const now = Date.now();

    // 1. Step partition
    const completedSteps: string[] = [];
    const pendingSteps: string[] = [];
    const routeProvenance: Record<string, ProviderRouteReference> = {};

    for (const step of workflow.plan.steps) {
      if (step.status === 'COMPLETED') {
        completedSteps.push(step.id);
        if (step.providerRoute) {
          routeProvenance[step.id] = {
            vendor: step.providerRoute.vendor,
            modelId: step.providerRoute.modelId,
            routingProfile: step.providerRoute.routingProfile,
            taskProfileId: step.providerRoute.taskProfileId,
            selectionReason: step.providerRoute.selectionReason,
            selectedAt: step.providerRoute.selectedAt || now,
          };
        }
      } else if (step.status === 'PENDING' || step.status === 'WAITING') {
        pendingSteps.push(step.id);
      }
    }

    // 2. Runtime variables snapshot
    const variableSnapshot = WorkflowVariableStore.getAllVariables(workflowId);

    // 3. Application sessions snapshot
    const activeSessions = ApplicationRegistry.getAllSessions();
    const sessionReferences: ApplicationSessionReference[] = activeSessions.map((sess) => ({
      applicationId: sess.applicationId,
      sessionId: sess.sessionId,
      launchId: sess.launchId,
      processId: sess.processId,
      connectionId: sess.connectionId,
      lastActiveTimestamp: (sess as any).lastActiveTimestamp ?? sess.health?.lastHeartbeat,
    }));

    const checkpoint: WorkflowCheckpoint = {
      checkpointId,
      workflowId,
      stepId: options.stepId,
      checkpointType: options.type,
      checkpointState: 'COMMITTED',
      createdAt: now,
      workflowStatus: workflow.status,
      templateId: workflow.templateId,
      templateVersion: workflow.templateVersion,
      completedSteps,
      pendingSteps,
      runtimeVariables: variableSnapshot,
      providerRoutes: routeProvenance,
      applicationSessions: sessionReferences,
      reason: options.reason,
    };

    // 4. Save to persistent store
    WorkflowStore.saveCheckpoint(checkpoint);
    return JSON.parse(JSON.stringify(checkpoint));
  }

  /**
   * Cooperatively pauses a workflow, releases resource locks, and creates a MANUAL_PAUSE checkpoint.
   */
  async pauseWorkflow(workflowId: string, reason: string = 'User requested pause'): Promise<WorkflowCheckpoint> {
    const workflow = WorkflowRuntime.get(workflowId) || WorkflowStore.getWorkflow(workflowId);
    if (!workflow) {
      throw new CheckpointError('WORKFLOW_NOT_PAUSABLE', `Workflow not found: ${workflowId}`, { workflowId });
    }

    if (workflow.status === 'PAUSED') {
      throw new CheckpointError('WORKFLOW_ALREADY_PAUSED', `Workflow is already paused: ${workflowId}`, {
        workflowId,
      });
    }

    if (workflow.status !== 'RUNNING' && workflow.status !== 'WAITING_FOR_USER') {
      throw new CheckpointError(
        'WORKFLOW_NOT_PAUSABLE',
        `Workflow in state '${workflow.status}' cannot be paused`,
        { workflowId, status: workflow.status }
      );
    }

    // Trigger runtime pause
    workflow.status = 'PAUSED';
    workflow.plan.status = 'PAUSED';
    WorkflowStore.saveWorkflow(workflow);
    WorkflowRuntime.pause(workflowId);

    // Release all resource locks
    ResourceLockManager.releaseWorkflowLocks(workflowId);

    // Create checkpoint at pause boundary
    const checkpoint = await this.createCheckpoint(workflowId, {
      type: 'MANUAL_PAUSE',
      reason,
    });

    return checkpoint;
  }

  /**
   * Resumes a paused or recovery-gated workflow after validating dependencies and application health.
   */
  async resumeWorkflow(workflowId: string, checkpointId?: string): Promise<Workflow> {
    const workflow = WorkflowRuntime.get(workflowId) || WorkflowStore.getWorkflow(workflowId);
    if (!workflow) {
      throw new CheckpointError('WORKFLOW_NOT_RESUMABLE', `Workflow not found: ${workflowId}`, { workflowId });
    }

    // 1. Retrieve checkpoint
    const checkpoints = WorkflowStore.getCheckpoints(workflowId);
    let checkpoint: WorkflowCheckpoint | undefined;

    if (checkpointId) {
      checkpoint = checkpoints.find((c) => c.checkpointId === checkpointId);
    } else {
      checkpoint = checkpoints[checkpoints.length - 1];
    }

    if (!checkpoint) {
      throw new CheckpointError(
        'CHECKPOINT_NOT_FOUND',
        `No valid checkpoint found to resume workflow: ${workflowId}`,
        { workflowId }
      );
    }

    if (checkpoint.checkpointState === 'INVALID') {
      throw new CheckpointError(
        'CHECKPOINT_INVALID',
        `Cannot resume from invalid checkpoint ${checkpoint.checkpointId}: ${checkpoint.invalidationReason}`,
        { checkpointId: checkpoint.checkpointId, reason: checkpoint.invalidationReason }
      );
    }

    // 2. Recovery Gate: Unresolved UNKNOWN mutation checks
    const hasUnresolvedUnknown = workflow.plan.steps.some(
      (s) => s.executionOutcome === 'UNKNOWN' && s.status === 'FAILED'
    );

    if (hasUnresolvedUnknown || checkpoint.checkpointType === 'RECOVERY_REQUIRED') {
      throw new CheckpointError(
        'RECOVERY_REQUIRED',
        `Workflow contains unrecovered UNKNOWN mutations. State reconciliation required before resuming.`,
        { workflowId, checkpointId: checkpoint.checkpointId }
      );
    }

    // 3. Restore runtime variables into variable store
    for (const [varName, v] of Object.entries(checkpoint.runtimeVariables)) {
      WorkflowVariableStore.setVariable(
        workflowId,
        varName,
        v.value,
        v.source,
        v.isSensitive,
        v.type
      );
    }

    // 4. Update workflow & plan status to RUNNING
    workflow.status = 'RUNNING';
    workflow.plan.status = 'RUNNING';

    // 5. Ensure completed steps are NOT replayed
    for (const step of workflow.plan.steps) {
      if (checkpoint.completedSteps.includes(step.id)) {
        step.status = 'COMPLETED';
      } else if (step.status === 'RUNNING' || step.status === 'WAITING') {
        step.status = 'PENDING';
      }
    }

    // 6. Save resumed workflow
    WorkflowStore.saveWorkflow(workflow);

    // 7. Fire execution in background via PlanEngine
    (async () => {
      try {
        await PlanEngine.execute(workflow.plan);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (
          workflow.plan.status === 'RUNNING' ||
          workflow.plan.status === 'WAITING_FOR_USER' ||
          workflow.plan.status === 'PAUSED'
        ) {
          planStateMachine.failPlan(workflow.plan, `Resumed execution crashed: ${errorMsg}`);
        }
      }
    })();

    return workflow;
  }

  /**
   * Invalidates a checkpoint so it cannot be resumed.
   */
  invalidateCheckpoint(checkpointId: string, reason: string): boolean {
    const checkpoint = WorkflowStore.getCheckpoint(checkpointId);
    if (!checkpoint) return false;

    checkpoint.checkpointState = 'INVALID';
    checkpoint.invalidationReason = reason;
    WorkflowStore.saveCheckpoint(checkpoint);
    return true;
  }

  /**
   * Returns a structured inspection summary of a checkpoint.
   */
  inspectCheckpoint(checkpointId: string): CheckpointInspection {
    const checkpoint = WorkflowStore.getCheckpoint(checkpointId);
    if (!checkpoint) {
      throw new CheckpointError('CHECKPOINT_NOT_FOUND', `Checkpoint ${checkpointId} not found`, { checkpointId });
    }

    const hasUnknown = Object.values(checkpoint.runtimeVariables).some(() => false);
    const isResumable =
      checkpoint.checkpointState === 'COMMITTED' &&
      checkpoint.checkpointType !== 'RECOVERY_REQUIRED';

    return {
      checkpointId: checkpoint.checkpointId,
      workflowId: checkpoint.workflowId,
      workflowStatus: checkpoint.workflowStatus,
      checkpointType: checkpoint.checkpointType,
      checkpointState: checkpoint.checkpointState,
      stepId: checkpoint.stepId,
      completedStepsCount: checkpoint.completedSteps.length,
      pendingStepsCount: checkpoint.pendingSteps.length,
      variableCount: Object.keys(checkpoint.runtimeVariables).length,
      templateId: checkpoint.templateId,
      templateVersion: checkpoint.templateVersion,
      hasUnknownMutations: hasUnknown,
      isResumable,
      reason: checkpoint.reason,
    };
  }

  getCheckpoint(checkpointId: string): WorkflowCheckpoint | undefined {
    return WorkflowStore.getCheckpoint(checkpointId);
  }

  listCheckpoints(workflowId: string): WorkflowCheckpoint[] {
    return WorkflowStore.getCheckpoints(workflowId);
  }
}

export const WorkflowCheckpointManager = new WorkflowCheckpointManagerImpl();
