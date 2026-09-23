import type { Plan, PlanStep, WaitingReason } from './types';

export type PlanEventType =
  | 'PLAN_CREATED'
  | 'PLAN_VALIDATED'
  | 'PLAN_STARTED'
  | 'STEP_QUEUED'
  | 'STEP_READY'
  | 'STEP_BLOCKED'
  | 'STEP_STARTED'
  | 'STEP_WAITING'
  | 'STEP_LOCK_WAIT'
  | 'STEP_LOCK_ACQUIRED'
  | 'STEP_LOCK_RELEASED'
  | 'STEP_COMPLETED'
  | 'STEP_SUCCEEDED' // kept for backwards compat
  | 'STEP_FAILED'
  | 'STEP_RETRYING'
  | 'ACTION_STARTED'
  | 'ACTION_COMPLETED'
  | 'VERIFICATION_STARTED'
  | 'VERIFICATION_SUCCEEDED'
  | 'VERIFICATION_FAILED'
  | 'PLAN_PARTIALLY_SUCCEEDED'
  | 'PLAN_SUCCEEDED'
  | 'PLAN_FAILED'
  | 'PLAN_CANCELLED'
  | 'PLAN_PAUSED'
  | 'PLAN_RESUMED'
  | 'PLAN_RECOVERY_REQUIRED';

export interface PlanEvent {
  type: PlanEventType;
  planId: string;
  workflowId?: string;
  stepId?: string;
  message?: string;
  error?: string;
}

type PlanEventHandler = (event: PlanEvent) => void;

/**
 * PlanStateMachine
 * 
 * Centralizes all state transitions for Plans and PlanSteps.
 * Prevents illegal state transitions and emits structured events.
 */
export class PlanStateMachine {
  private onEvent: PlanEventHandler | null = null;

  setEventHandler(handler: PlanEventHandler | null): void {
    this.onEvent = handler;
  }

  private emit(event: PlanEvent): void {
    this.onEvent?.(event);
    if ((import.meta as any).env?.DEV) {
      console.info(`[PlanStateMachine] ${event.type}`, event.message ?? '', event.error ?? '');
    }
  }

  // --- Plan Transitions ---

  startPlan(plan: Plan): void {
    if (plan.status !== 'PLANNED') {
      throw new Error(`Cannot start plan from status ${plan.status}`);
    }
    plan.status = 'RUNNING';
    plan.updatedAt = new Date().toISOString();
    this.emit({ type: 'PLAN_STARTED', planId: plan.id, workflowId: plan.workflowId, message: `Started plan: ${plan.goal}` });
  }

  failPlan(plan: Plan, error: string): void {
    if (plan.status === 'CANCELLED' || plan.status === 'SUCCEEDED') return;
    plan.status = 'FAILED';
    plan.updatedAt = new Date().toISOString();
    this.emit({ type: 'PLAN_FAILED', planId: plan.id, workflowId: plan.workflowId, error });
  }

  succeedPlan(plan: Plan): void {
    if (plan.status !== 'RUNNING' && plan.status !== 'WAITING_FOR_USER') return;
    plan.status = 'SUCCEEDED';
    plan.updatedAt = new Date().toISOString();
    this.emit({ type: 'PLAN_SUCCEEDED', planId: plan.id, workflowId: plan.workflowId, message: 'Plan completed successfully' });
  }

  partiallySucceedPlan(plan: Plan): void {
    if (plan.status !== 'RUNNING' && plan.status !== 'WAITING_FOR_USER') return;
    plan.status = 'PARTIALLY_SUCCEEDED';
    plan.updatedAt = new Date().toISOString();
    this.emit({ type: 'PLAN_PARTIALLY_SUCCEEDED', planId: plan.id, workflowId: plan.workflowId, message: 'Plan partially succeeded' });
  }

  partiallyRolledBackPlan(plan: Plan): void {
    if (plan.status !== 'RUNNING' && plan.status !== 'WAITING_FOR_USER') return;
    plan.status = 'PARTIALLY_ROLLED_BACK' as any;
    plan.updatedAt = new Date().toISOString();
    this.emit({ type: 'PLAN_FAILED', planId: plan.id, workflowId: plan.workflowId, message: 'Plan failed and compensation partially failed.' });
  }

  cancelPlan(plan: Plan): void {
    if (plan.status === 'SUCCEEDED' || plan.status === 'FAILED' || plan.status === 'PARTIALLY_SUCCEEDED') return;
    plan.status = 'CANCELLED';
    plan.updatedAt = new Date().toISOString();
    
    // Also cancel all pending/running steps
    for (const step of plan.steps) {
      if (step.status === 'PENDING' || step.status === 'WAITING') {
        step.status = 'CANCELLED';
      } else if (step.status === 'RUNNING') {
        step.status = 'CANCELLED';
        step.completedAt = new Date().toISOString();
        // Honest semantics: The external action might still be running
        if (!step.executionOutcome) {
          step.executionOutcome = 'UNKNOWN';
        }
      }
    }
    this.emit({ type: 'PLAN_CANCELLED', planId: plan.id, workflowId: plan.workflowId, message: 'Plan cancelled. Active external tools may still be running.' });
  }

  pausePlan(plan: Plan): void {
    if (plan.status !== 'RUNNING' && plan.status !== 'WAITING_FOR_USER') return;
    plan.status = 'PAUSED';
    plan.updatedAt = new Date().toISOString();
    this.emit({ type: 'PLAN_PAUSED', planId: plan.id, workflowId: plan.workflowId, message: 'Plan paused.' });
  }

  resumePlan(plan: Plan): void {
    if (plan.status !== 'PAUSED') return;
    plan.status = 'RUNNING';
    plan.updatedAt = new Date().toISOString();
    this.emit({ type: 'PLAN_RESUMED', planId: plan.id, workflowId: plan.workflowId, message: 'Plan resumed.' });
  }

  requireRecoveryPlan(plan: Plan, reason: string): void {
    if (plan.status === 'SUCCEEDED' || plan.status === 'FAILED' || plan.status === 'PARTIALLY_SUCCEEDED' || plan.status === 'CANCELLED') return;
    plan.status = 'RECOVERY_REQUIRED';
    plan.updatedAt = new Date().toISOString();
    this.emit({ type: 'PLAN_RECOVERY_REQUIRED', planId: plan.id, workflowId: plan.workflowId, message: reason });
  }

  // --- Step Transitions ---

  startStep(plan: Plan, step: PlanStep): void {
    if (step.status !== 'PENDING' && step.status !== 'WAITING' && step.status !== 'FAILED') {
      throw new Error(`Cannot start step from status ${step.status}`);
    }
    step.status = 'RUNNING';
    step.startedAt = new Date().toISOString();
    step.attempts += 1;
    step.waitingReason = undefined;
    plan.updatedAt = new Date().toISOString();
    
    this.emit({ type: 'STEP_STARTED', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, message: step.description });
  }

  waitStep(plan: Plan, step: PlanStep, reason: WaitingReason, message: string): void {
    if (step.status !== 'RUNNING' && step.status !== 'FAILED') {
      throw new Error(`Cannot set step to WAITING from status ${step.status}`);
    }
    step.status = 'WAITING';
    step.waitingReason = reason;
    plan.updatedAt = new Date().toISOString();
    
    this.emit({ type: 'STEP_WAITING', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, message });
  }

  succeedStep(plan: Plan, step: PlanStep, result: string): void {
    if (step.status !== 'RUNNING') {
      throw new Error(`Cannot succeed step from status ${step.status}`);
    }
    step.status = 'COMPLETED';
    step.result = result;
    step.executionOutcome = 'SUCCESS';
    step.completedAt = new Date().toISOString();
    plan.updatedAt = new Date().toISOString();
    
    this.emit({ type: 'STEP_SUCCEEDED', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, message: result });
  }

  failStep(plan: Plan, step: PlanStep, error: string, failureReason?: 'TIMEOUT' | 'SECURITY_BLOCKED' | 'EXECUTION_FAILED', outcome?: 'UNKNOWN' | 'FAILED'): void {
    if (step.status !== 'RUNNING' && step.status !== 'WAITING') {
      throw new Error(`Cannot fail step from status ${step.status}`);
    }
    step.status = 'FAILED';
    step.error = error;
    step.failureReason = failureReason ?? 'EXECUTION_FAILED';
    step.executionOutcome = outcome ?? 'FAILED';
    step.completedAt = new Date().toISOString();
    plan.updatedAt = new Date().toISOString();
    
    this.emit({ type: 'STEP_FAILED', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, error });
  }

  retryStep(plan: Plan, step: PlanStep, message: string): void {
    if (step.status !== 'FAILED' && step.status !== 'WAITING') {
      throw new Error(`Cannot retry step from status ${step.status}`);
    }
    this.emit({ type: 'STEP_RETRYING', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, message });
    this.startStep(plan, step);
  }

  skipStep(plan: Plan, step: PlanStep, reason: string): void {
    if (step.status !== 'PENDING' && step.status !== 'WAITING') {
      throw new Error(`Cannot skip step from status ${step.status}`);
    }
    step.status = 'SKIPPED';
    step.error = reason;
    step.completedAt = new Date().toISOString();
    plan.updatedAt = new Date().toISOString();
  }

  // --- Scheduler Lifecycle Events ---
  
  emitStepQueued(plan: Plan, step: PlanStep, message: string): void {
    this.emit({ type: 'STEP_QUEUED', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, message });
  }

  emitStepReady(plan: Plan, step: PlanStep, message: string): void {
    this.emit({ type: 'STEP_READY', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, message });
  }

  emitStepBlocked(plan: Plan, step: PlanStep, message: string): void {
    this.emit({ type: 'STEP_BLOCKED', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, message });
  }

  emitStepLockWait(plan: Plan, step: PlanStep, message: string): void {
    this.emit({ type: 'STEP_LOCK_WAIT', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, message });
  }

  emitStepLockAcquired(plan: Plan, step: PlanStep, message: string): void {
    this.emit({ type: 'STEP_LOCK_ACQUIRED', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, message });
  }

  emitStepLockReleased(plan: Plan, step: PlanStep, message: string): void {
    this.emit({ type: 'STEP_LOCK_RELEASED', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, message });
  }

  emitStepCompleted(plan: Plan, step: PlanStep, message: string): void {
    this.emit({ type: 'STEP_COMPLETED', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, message });
  }

  // --- External Lifecycle Events ---
  
  emitActionStarted(plan: Plan, step: PlanStep, message: string): void {
    this.emit({ type: 'ACTION_STARTED', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, message });
  }

  emitActionCompleted(plan: Plan, step: PlanStep, message: string): void {
    this.emit({ type: 'ACTION_COMPLETED', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, message });
  }

  emitVerificationStarted(plan: Plan, step: PlanStep, message: string): void {
    this.emit({ type: 'VERIFICATION_STARTED', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, message });
  }

  emitVerificationSucceeded(plan: Plan, step: PlanStep, message: string): void {
    this.emit({ type: 'VERIFICATION_SUCCEEDED', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, message });
  }

  emitVerificationFailed(plan: Plan, step: PlanStep, error: string): void {
    this.emit({ type: 'VERIFICATION_FAILED', planId: plan.id, workflowId: plan.workflowId, stepId: step.id, error });
  }
}

export const planStateMachine = new PlanStateMachine();
