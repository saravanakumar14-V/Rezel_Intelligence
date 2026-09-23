import { planStateMachine } from '../PlanStateMachine';
import type { Plan, PlanStep } from '../types';
import { ResourceLockManager } from './ResourceLockManager';

export class SchedulerImpl {
  private activeExecutions = new Set<string>();
  private capabilityConcurrency = new Map<string, number>();
  private readonly DEFAULT_GLOBAL_CONCURRENCY = 10;
  private readonly DEFAULT_CAPABILITY_CONCURRENCY = 3;

  async executePlan(plan: Plan, executeStepFn: (plan: Plan, step: PlanStep, getLocks: () => Promise<void>, releaseLocks: () => void) => Promise<void>): Promise<void> {
    const stepMap = new Map(plan.steps.map(s => [s.id, s]));
    
    for (const step of plan.steps) {
      if (step.status === 'PENDING') {
        planStateMachine.emitStepQueued(plan, step, 'Step queued for scheduling.');
      }
    }

    return new Promise((resolve) => {
      const checkLoop = async () => {
        if (plan.status === 'CANCELLED') {
          if (this.activeExecutions.size === 0) {
            if (plan.workflowId) {
              ResourceLockManager.releaseWorkflowLocks(plan.workflowId);
            }
            return resolve();
          } else {
            // Wait for active executions (and lock wait promises) to settle and release their own locks
            setTimeout(checkLoop, 100);
            return;
          }
        }

        while (plan.status === 'PAUSED') {
          setTimeout(checkLoop, 1000);
          return;
        }

        let allDone = true;
        let didSpawn = false;

        for (const step of plan.steps) {
          if (step.status !== 'COMPLETED' && step.status !== 'FAILED' && step.status !== 'SKIPPED' && step.status !== 'CANCELLED') {
            allDone = false;
          }

          if ((step.status === 'PENDING' || step.status === 'WAITING') && !this.activeExecutions.has(step.id)) {
            if (this.canSchedule(step, stepMap)) {
              if (this.activeExecutions.size < this.DEFAULT_GLOBAL_CONCURRENCY) {
                const toolName = step.toolName || 'unknown';
                const currentToolCount = this.capabilityConcurrency.get(toolName) || 0;
                
                // We don't have direct access to capability registry here without importing it.
                // We'll pass the responsibility of getting limits to the caller, or just import it.
                // Let's import it here.
                const { CapabilityRegistry } = await import('../capabilities/CapabilityRegistry');
                const capability = toolName !== 'unknown' ? CapabilityRegistry.get(toolName) : undefined;
                
                const toolLimit = capability?.concurrencyPolicy?.maxConcurrent ?? this.DEFAULT_CAPABILITY_CONCURRENCY;

                if (currentToolCount < toolLimit) {
                  this.activeExecutions.add(step.id);
                  this.capabilityConcurrency.set(toolName, currentToolCount + 1);
                  didSpawn = true;
                  
                  if (step.status === 'PENDING') {
                     planStateMachine.emitStepReady(plan, step, 'Dependencies resolved.');
                  }

                  const getLocks = async () => {
                    const reqs = (capability && capability.getRequiredLocks) ? await capability.getRequiredLocks(step.toolArgs ?? {}, {
                      workflowId: plan.workflowId!,
                      executionId: step.executionId || 'unknown',
                      scopes: [],
                      metadata: {}
                    }) : [];
                    
                    if (reqs.length > 0) {
                      planStateMachine.emitStepLockWait(plan, step, 'Waiting for resource locks.');
                      await ResourceLockManager.acquireLocks(plan.workflowId!, step.id, reqs);
                      planStateMachine.emitStepLockAcquired(plan, step, 'Resource locks acquired.');
                    }
                  };

                  const releaseLocks = () => {
                    if (plan.workflowId) {
                      ResourceLockManager.releaseLocks(plan.workflowId, step.id);
                      planStateMachine.emitStepLockReleased(plan, step, 'Resource locks released.');
                    }
                  };
                  
                  executeStepFn(plan, step, getLocks, releaseLocks).finally(() => {
                    this.activeExecutions.delete(step.id);
                    this.capabilityConcurrency.set(toolName, (this.capabilityConcurrency.get(toolName) || 1) - 1);
                    checkLoop();
                  });
                }
              }
            } else if (this.isBlocked(step, stepMap)) {
               if (step.status === 'PENDING' || step.status === 'WAITING') {
                 planStateMachine.emitStepBlocked(plan, step, 'Blocked by failed or skipped dependencies.');
                 planStateMachine.skipStep(plan, step, 'Skipped: dependency failed or skipped');
                 didSpawn = true;
               }
            }
          }
        }

        if (allDone) {
          return resolve();
        }

        if (didSpawn) {
          setTimeout(checkLoop, 0);
        }
      };

      checkLoop();
    });
  }

  /**
   * Returns list of steps whose dependencies are currently resolved and ready to schedule.
   */
  getReadySteps(plan: Plan): PlanStep[] {
    const stepMap = new Map(plan.steps.map(s => [s.id, s]));
    return plan.steps.filter(step => {
      if (step.status !== 'PENDING' && step.status !== 'WAITING') return false;
      return this.canSchedule(step, stepMap);
    });
  }

  private canSchedule(step: PlanStep, stepMap: Map<string, PlanStep>): boolean {
    if (!step.dependsOn || step.dependsOn.length === 0) return true;
    return step.dependsOn.every(depId => {
      const dep = stepMap.get(depId);
      return dep?.status === 'COMPLETED';
    });
  }

  private isBlocked(step: PlanStep, stepMap: Map<string, PlanStep>): boolean {
    if (!step.dependsOn || step.dependsOn.length === 0) return false;
    return step.dependsOn.some(depId => {
      const dep = stepMap.get(depId);
      return dep?.status === 'FAILED' || dep?.status === 'SKIPPED' || dep?.status === 'CANCELLED';
    });
  }
}

export const Scheduler = new SchedulerImpl();
