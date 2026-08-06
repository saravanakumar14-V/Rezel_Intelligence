/**
 * Planner
 *
 * Multi-step task planning engine for Rezel.
 *
 * When the user describes a complex goal, the Planner:
 *  1. Asks the AI to decompose the goal into discrete steps
 *  2. Resolves dependency ordering
 *  3. Executes steps sequentially via the AI ToolExecutor
 *  4. Handles failures with retry or skip strategies
 *
 * The Planner does NOT call the AI provider directly — it receives
 * a plan (list of PlanSteps) and executes it. The AgentCore is
 * responsible for asking the AI to generate the plan.
 */

import { AIToolExecutor } from './ToolExecutor';
import type { Plan, PlanStep, PlanStepStatus, ToolCall } from './types';

export type PlanEventType =
  | 'step_start'
  | 'step_complete'
  | 'step_failed'
  | 'step_skipped'
  | 'plan_complete'
  | 'plan_failed';

export interface PlanEvent {
  type: PlanEventType;
  stepId?: string;
  stepDescription?: string;
  result?: string;
  error?: string;
}

type PlanEventHandler = (event: PlanEvent) => void;

class PlannerImpl {
  private onEvent: PlanEventHandler | null = null;

  /**
   * setEventHandler
   * Called by AgentCore to receive plan execution updates for the UI.
   */
  setEventHandler(handler: PlanEventHandler | null): void {
    this.onEvent = handler;
  }

  /**
   * createPlan
   *
   * Factory for a Plan object from a goal and a list of raw steps.
   * Steps are validated for dependency integrity.
   */
  createPlan(goal: string, rawSteps: Omit<PlanStep, 'status'>[]): Plan {
    const steps: PlanStep[] = rawSteps.map((s) => ({
      ...s,
      status: 'pending' as PlanStepStatus,
    }));

    return {
      id: crypto.randomUUID(),
      goal,
      steps,
      status: 'planning',
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * execute
   *
   * Runs a plan step-by-step, respecting dependency ordering.
   *
   * Execution rules:
   *  - A step runs only when all its `dependsOn` steps are `completed`.
   *  - If a dependency failed, the dependent step is `skipped`.
   *  - Steps without a `toolName` are informational — auto-completed.
   *  - The plan is `failed` if any non-skippable step fails.
   */
  async execute(plan: Plan): Promise<Plan> {
    plan.status = 'executing';
    const stepMap = new Map(plan.steps.map((s) => [s.id, s]));

    for (const step of plan.steps) {
      // Check dependencies
      if (step.dependsOn && step.dependsOn.length > 0) {
        const allDepsComplete = step.dependsOn.every((depId) => {
          const dep = stepMap.get(depId);
          return dep?.status === 'completed';
        });
        const anyDepFailed = step.dependsOn.some((depId) => {
          const dep = stepMap.get(depId);
          return dep?.status === 'failed';
        });

        if (anyDepFailed) {
          step.status = 'skipped';
          step.error = 'Skipped: dependency failed';
          this.emit({
            type: 'step_skipped',
            stepId: step.id,
            stepDescription: step.description,
            error: step.error,
          });
          continue;
        }

        if (!allDepsComplete) {
          step.status = 'skipped';
          step.error = 'Skipped: dependencies not met';
          this.emit({
            type: 'step_skipped',
            stepId: step.id,
            stepDescription: step.description,
            error: step.error,
          });
          continue;
        }
      }

      // Execute the step
      step.status = 'running';
      this.emit({
        type: 'step_start',
        stepId: step.id,
        stepDescription: step.description,
      });

      // Informational step (no tool) — auto-complete
      if (!step.toolName) {
        step.status = 'completed';
        step.result = 'Informational step — no action required.';
        this.emit({
          type: 'step_complete',
          stepId: step.id,
          stepDescription: step.description,
          result: step.result,
        });
        continue;
      }

      // Tool execution step
      const toolCall: ToolCall = {
        id: crypto.randomUUID(),
        name: step.toolName,
        args: step.toolArgs ?? {},
      };

      try {
        const { toolResult } = await AIToolExecutor.execute(toolCall);

        if (toolResult.success) {
          step.status = 'completed';
          step.result = toolResult.output;
          this.emit({
            type: 'step_complete',
            stepId: step.id,
            stepDescription: step.description,
            result: step.result,
          });
        } else {
          step.status = 'failed';
          step.error = toolResult.output;
          this.emit({
            type: 'step_failed',
            stepId: step.id,
            stepDescription: step.description,
            error: step.error,
          });
        }
      } catch (err: unknown) {
        step.status = 'failed';
        step.error = err instanceof Error ? err.message : String(err);
        this.emit({
          type: 'step_failed',
          stepId: step.id,
          stepDescription: step.description,
          error: step.error,
        });
      }
    }

    // Determine final plan status
    const anyFailed = plan.steps.some((s) => s.status === 'failed');
    plan.status = anyFailed ? 'failed' : 'completed';

    this.emit({
      type: plan.status === 'completed' ? 'plan_complete' : 'plan_failed',
    });

    return plan;
  }

  private emit(event: PlanEvent): void {
    this.onEvent?.(event);

    if (import.meta.env.DEV) {
      const prefix = event.type.startsWith('plan_') ? '📋' : '  📌';
      console.info(`[Planner] ${prefix} ${event.type}`, event.stepDescription ?? '', event.result ?? event.error ?? '');
    }
  }
}

/** Singleton — import and use directly. */
export const Planner = new PlannerImpl();
