import { PlanEngine } from './PlanEngine.js';
import { planStateMachine } from './PlanStateMachine.js';
import type { PlanEvent } from './PlanStateMachine.js';
import type { Plan, Workflow } from './types.js';
import { WorkflowStore } from './persistence/WorkflowStore.js';
import { WorkflowRecoveryManager } from './persistence/WorkflowRecoveryManager.js';

const MAX_RECENT_WORKFLOWS = 50;

type WorkflowEventHandler = (event: PlanEvent) => void;

class WorkflowRuntimeImpl {
  private activeWorkflows = new Map<string, Workflow>();
  private recentWorkflows = new Map<string, Workflow>();
  private listeners = new Set<WorkflowEventHandler>();
  private pauseRequests = new Set<string>();

  constructor() {
    planStateMachine.setEventHandler((event) => {
      this.handlePlanEvent(event);
    });
  }

  async initialize(): Promise<void> {
    const recovered = await WorkflowRecoveryManager.recoverWorkflows();
    
    for (const workflow of recovered) {
      if (
        workflow.status === 'SUCCEEDED' ||
        workflow.status === 'FAILED' ||
        workflow.status === 'PARTIALLY_SUCCEEDED' ||
        workflow.status === 'CANCELLED'
      ) {
        this.recentWorkflows.set(workflow.id, workflow);
      } else {
        this.activeWorkflows.set(workflow.id, workflow);
      }
    }
  }

  addEventHandler(handler: WorkflowEventHandler): void {
    this.listeners.add(handler);
  }

  removeEventHandler(handler: WorkflowEventHandler): void {
    this.listeners.delete(handler);
  }

  private emit(event: PlanEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private handlePlanEvent(event: PlanEvent): void {
    if (!event.workflowId) return;

    // Check if the workflow is in active map
    const workflow = this.activeWorkflows.get(event.workflowId);
    
    if (workflow) {
      // Sync workflow status with plan status
      workflow.status = workflow.plan.status;
      workflow.updatedAt = new Date().toISOString();

      // If terminal state, move to recent
      if (
        workflow.status === 'SUCCEEDED' ||
        workflow.status === 'FAILED' ||
        workflow.status === 'PARTIALLY_SUCCEEDED' ||
        workflow.status === 'CANCELLED'
      ) {
        this.activeWorkflows.delete(workflow.id);
        this.recentWorkflows.set(workflow.id, workflow);
        this.pauseRequests.delete(workflow.id);
        
        // Evict oldest if exceeding max history
        if (this.recentWorkflows.size > MAX_RECENT_WORKFLOWS) {
          const firstKey = this.recentWorkflows.keys().next().value;
          if (firstKey) this.recentWorkflows.delete(firstKey);
        }
      }

      WorkflowStore.saveWorkflow(workflow);
    }

    WorkflowStore.appendEvent(event);
    this.emit(event);
  }

  start(plan: Plan): Workflow {
    // 1. Give the plan a workflowId
    const workflowId = `wf_${crypto.randomUUID()}`;
    plan.workflowId = workflowId;
    
    // 2. Create the workflow object
    const workflow: Workflow = {
      id: workflowId,
      projectId: plan.projectId,
      plan,
      status: plan.status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    // 3. Store active
    this.activeWorkflows.set(workflowId, workflow);
    WorkflowStore.saveWorkflow(workflow);
    
    // 4. Start execution in background (fire and forget)
    // CRITICAL: We wrap this in an async IIFE to prevent unhandled rejections
    // and isolate execution state.
    (async () => {
      try {
        await PlanEngine.execute(plan);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        // If the executor threw an error without transitioning state, we must transition to FAILED
        if (plan.status === 'RUNNING' || plan.status === 'WAITING_FOR_USER' || plan.status === 'PAUSED') {
          planStateMachine.failPlan(plan, `Background execution crashed: ${errorMsg}`);
        }
      }
    })();
    
    return workflow;
  }

  /**
   * Instantiates and starts a workflow from a reusable WorkflowTemplate.
   */
  async instantiateTemplate(
    options: import('./templates/types').WorkflowTemplateInstantiationOptions
  ): Promise<Workflow> {
    const { WorkflowTemplateRegistry } = await import('./templates/WorkflowTemplateRegistry');
    const { plan, workflowMetadata } = await WorkflowTemplateRegistry.instantiate(options);

    const workflowId = plan.workflowId || `wf_${crypto.randomUUID()}`;
    plan.workflowId = workflowId;

    const workflow: Workflow = {
      id: workflowId,
      projectId: plan.projectId,
      plan,
      status: plan.status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      templateId: workflowMetadata.templateId,
      templateVersion: workflowMetadata.templateVersion,
      resolvedParameters: workflowMetadata.resolvedParameters,
    };

    this.activeWorkflows.set(workflowId, workflow);
    WorkflowStore.saveWorkflow(workflow);

    (async () => {
      try {
        await PlanEngine.execute(plan);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (
          plan.status === 'RUNNING' ||
          plan.status === 'WAITING_FOR_USER' ||
          plan.status === 'PAUSED'
        ) {
          planStateMachine.failPlan(plan, `Background execution crashed: ${errorMsg}`);
        }
      }
    })();

    return workflow;
  }

  /**
   * Safely dry-runs a template without mutating external state.
   */
  async dryRunTemplate(
    options: import('./templates/types').WorkflowTemplateInstantiationOptions
  ): Promise<import('./templates/types').DryRunResult> {
    const { WorkflowTemplateRegistry } = await import('./templates/WorkflowTemplateRegistry');
    return WorkflowTemplateRegistry.dryRun(options);
  }

  get(workflowId: string): Workflow | undefined {
    return this.activeWorkflows.get(workflowId) ?? this.recentWorkflows.get(workflowId);
  }

  listActive(): Workflow[] {
    return Array.from(this.activeWorkflows.values());
  }

  listRecent(): Workflow[] {
    return Array.from(this.recentWorkflows.values());
  }

  cancel(workflowId: string): void {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) return; // Already terminal or missing

    // The execution engine handles the actual step cancellations when PlanEngine checks plan.status
    PlanEngine.cancel(workflow.plan);
  }

  pause(workflowId: string): void {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) return;

    // Only pause if we are in a pausable state
    if (workflow.plan.status !== 'RUNNING' && workflow.plan.status !== 'WAITING_FOR_USER') return;

    this.pauseRequests.add(workflowId);
    planStateMachine.pausePlan(workflow.plan);
  }

  resume(workflowId: string): void {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) return;

    this.pauseRequests.delete(workflowId);
    planStateMachine.resumePlan(workflow.plan);
  }

  /**
   * Creates a checkpoint for an active workflow.
   */
  async createCheckpoint(
    workflowId: string,
    options: { type: import('./checkpoints/types').CheckpointType; stepId?: string; reason?: string }
  ): Promise<import('./checkpoints/types').WorkflowCheckpoint> {
    const { WorkflowCheckpointManager } = await import('./checkpoints/WorkflowCheckpointManager');
    return WorkflowCheckpointManager.createCheckpoint(workflowId, options);
  }

  /**
   * Pauses workflow execution and creates a MANUAL_PAUSE checkpoint.
   */
  async pauseWorkflow(
    workflowId: string,
    reason: string = 'User requested pause'
  ): Promise<import('./checkpoints/types').WorkflowCheckpoint> {
    const { WorkflowCheckpointManager } = await import('./checkpoints/WorkflowCheckpointManager');
    return WorkflowCheckpointManager.pauseWorkflow(workflowId, reason);
  }

  /**
   * Resumes workflow execution from a checkpoint.
   */
  async resumeWorkflow(workflowId: string, checkpointId?: string): Promise<Workflow> {
    const { WorkflowCheckpointManager } = await import('./checkpoints/WorkflowCheckpointManager');
    return WorkflowCheckpointManager.resumeWorkflow(workflowId, checkpointId);
  }

  /**
   * Creates an approval request for human-in-the-loop validation.
   */
  async createApprovalRequest(
    workflowId: string,
    stepId: string,
    options: Parameters<import('./approval/ApprovalManager').ApprovalManagerImpl['createApprovalRequest']>[2]
  ): Promise<import('./approval/types').ApprovalRequest> {
    const { ApprovalManager } = await import('./approval/ApprovalManager');
    return ApprovalManager.createApprovalRequest(workflowId, stepId, options);
  }

  /**
   * Approves a pending approval request.
   */
  async approveRequest(
    approvalId: string,
    actor?: string,
    reason?: string
  ): Promise<{ success: boolean; resumedWorkflow: Workflow }> {
    const { ApprovalManager } = await import('./approval/ApprovalManager');
    return ApprovalManager.approveRequest(approvalId, actor, reason);
  }

  /**
   * Rejects a pending approval request.
   */
  async rejectRequest(
    approvalId: string,
    actor?: string,
    reason?: string
  ): Promise<import('./approval/types').ApprovalRequest> {
    const { ApprovalManager } = await import('./approval/ApprovalManager');
    return ApprovalManager.rejectRequest(approvalId, actor, reason);
  }

  /**
   * Lists pending approval requests.
   */
  async listPendingApprovals(workflowId?: string): Promise<import('./approval/types').ApprovalRequest[]> {
    const { ApprovalManager } = await import('./approval/ApprovalManager');
    return ApprovalManager.listPendingApprovals(workflowId);
  }

  resumeRecovered(workflowId: string): void {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) return;
    if (workflow.status !== 'RECOVERY_REQUIRED' && workflow.status !== 'WAITING_FOR_USER') return;

    if (!WorkflowRecoveryManager.canSafelyResume(workflow)) {
      throw new Error("Cannot safely resume this workflow. There may be unresolved UNKNOWN mutations.");
    }

    // WAITING_FOR_USER does not transition to RUNNING here, PlanEngine logic handles it.
    // RECOVERY_REQUIRED transitions to RUNNING.
    if (workflow.status === 'RECOVERY_REQUIRED') {
      planStateMachine.resumePlan(workflow.plan);
      workflow.plan.status = 'RUNNING';
      workflow.status = 'RUNNING';
    }

    (async () => {
      try {
        await PlanEngine.execute(workflow.plan);
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (workflow.plan.status === 'RUNNING' || workflow.plan.status === 'WAITING_FOR_USER' || workflow.plan.status === 'PAUSED') {
          planStateMachine.failPlan(workflow.plan, `Background execution crashed: ${errorMsg}`);
        }
      }
    })();
  }

  isPauseRequested(workflowId: string): boolean {
    return this.pauseRequests.has(workflowId);
  }

  /**
   * REZEL PHASE 14 — Cross-Application Workflow Intelligence Orchestration
   */
  async executeWorkflowDefinition(
    definition: import('./workflow').WorkflowDefinition,
    inputs: Record<string, unknown> = {},
    options: import('./workflow').ExecuteWorkflowOptions = {}
  ): Promise<import('./workflow').WorkflowExecution> {
    const { WorkflowExecutionEngine } = await import('./workflow/WorkflowExecutionEngine');
    return WorkflowExecutionEngine.executeWorkflow(definition, inputs, options);
  }

  async dryRunWorkflowDefinition(
    definition: import('./workflow').WorkflowDefinition,
    inputs: Record<string, unknown> = {}
  ): Promise<import('./workflow').WorkflowDryRunResult> {
    const { WorkflowExecutionEngine } = await import('./workflow/WorkflowExecutionEngine');
    return WorkflowExecutionEngine.dryRun(definition, inputs);
  }

  async resumeWorkflowDefinition(
    execution: import('./workflow').WorkflowExecution,
    options: import('./workflow').ExecuteWorkflowOptions = {}
  ): Promise<import('./workflow').WorkflowExecution> {
    const { WorkflowExecutionEngine } = await import('./workflow/WorkflowExecutionEngine');
    return WorkflowExecutionEngine.resumeWorkflow(execution, options);
  }

  cancelWorkflowDefinition(workflowId: string, reason?: string): void {
    import('./workflow/WorkflowExecutionEngine').then(({ WorkflowExecutionEngine }) => {
      WorkflowExecutionEngine.cancelWorkflow(workflowId, reason);
    });
  }
}

export const WorkflowRuntime = new WorkflowRuntimeImpl();
