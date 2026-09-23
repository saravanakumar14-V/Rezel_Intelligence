import { WorkflowStore } from './WorkflowStore';
import type { Workflow } from '../types';
// planStateMachine intentionally not required here; removed unused import to satisfy linter

class WorkflowRecoveryManagerImpl {
  async recoverWorkflows(): Promise<Workflow[]> {
    await WorkflowStore.load();
    const workflows = WorkflowStore.listWorkflows();
    const recovered: Workflow[] = [];

    for (const workflow of workflows) {
      if (this.needsRecovery(workflow)) {
        this.applyRecovery(workflow);
        WorkflowStore.saveWorkflow(workflow);
      }
      recovered.push(workflow);
    }

    return recovered;
  }

  private needsRecovery(workflow: Workflow): boolean {
    const s = workflow.status;
    return s === 'RUNNING' || s === 'PAUSED' || s === 'WAITING_FOR_USER';
  }

  private applyRecovery(workflow: Workflow): void {
    const isWaitingForUser = workflow.status === 'WAITING_FOR_USER';
    
    if (isWaitingForUser) {
      // WAITING_FOR_USER is a safe state, we keep it as is, but we ensure no steps claim to be RUNNING.
      // If a step was WAITING_FOR_USER, it is preserved.
    } else {
      // All other non-terminal states require recovery explicitly.
      workflow.status = 'RECOVERY_REQUIRED';
      workflow.plan.status = 'RECOVERY_REQUIRED';
    }

    // Clean up interrupted steps
    for (const step of workflow.plan.steps) {
      if (step.status === 'RUNNING' || step.status === 'WAITING') {
        if (isWaitingForUser && step.waitingReason === 'USER_CONFIRMATION') {
           // Preserve the waiting for user state on the step
           continue; 
        }

        step.status = 'FAILED';
        step.error = 'Workflow was interrupted and requires recovery.';
        step.failureReason = 'EXECUTION_FAILED';
        if (!step.executionOutcome) {
           // Crucially, never assume an interrupted external operation failed
           step.executionOutcome = 'UNKNOWN'; 
        }
      }
    }
  }

  canSafelyResume(workflow: Workflow): boolean {
    if (workflow.status !== 'RECOVERY_REQUIRED' && workflow.status !== 'WAITING_FOR_USER') {
      return false;
    }
    
    // Unresolved UNKNOWN mutations prevent safe continuation
    const hasUnknown = workflow.plan.steps.some(step => step.executionOutcome === 'UNKNOWN');
    if (hasUnknown) {
      return false;
    }

    return true;
  }
}

export const WorkflowRecoveryManager = new WorkflowRecoveryManagerImpl();
