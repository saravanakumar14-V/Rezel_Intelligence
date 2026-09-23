/**
 * REZEL PHASE 16 — WORKFLOW CONDITION EVALUATOR
 *
 * Evaluates the closed deterministic condition DSL:
 * - artifact_exists
 * - state_equals
 * - step_successful
 *
 * Invariants:
 * - Strictly NO eval(), NO Function(), NO dynamic scripting.
 * - Closed DSL only.
 */

import { ApplicationObserver } from '../../verification/ApplicationObserver';
import { WorkflowArtifactManager } from '../WorkflowArtifactManager';
import type {
  WorkflowCondition,
  WorkflowExecution,
  WorkflowStep,
} from '../types';

export interface ConditionEvaluationResult {
  readonly passed: boolean;
  readonly reason?: string;
  readonly condition: WorkflowCondition;
}

export class WorkflowConditionEvaluator {
  /**
   * Evaluates a list of conditions for a step against the current execution state.
   */
  static async evaluateStepConditions(
    step: WorkflowStep | { conditions?: WorkflowCondition[] },
    execution: WorkflowExecution
  ): Promise<ConditionEvaluationResult[]> {
    const conditions = (step as any).conditions as WorkflowCondition[] | undefined;
    if (!conditions || conditions.length === 0) {
      return [];
    }

    const results: ConditionEvaluationResult[] = [];

    for (const cond of conditions) {
      const res = await this.evaluateCondition(cond, execution);
      results.push(res);
      if (!res.passed) {
        break; // Short-circuit on first failure
      }
    }

    return results;
  }

  /**
   * Evaluates a single deterministic condition.
   */
  static async evaluateCondition(
    condition: WorkflowCondition,
    execution: WorkflowExecution
  ): Promise<ConditionEvaluationResult> {
    switch (condition.type) {
      case 'artifact_exists': {
        const art = execution.artifacts[condition.artifactName] ||
          WorkflowArtifactManager.getArtifact(execution.workflowId, condition.artifactName);
        if (art && art.verified) {
          return {
            passed: true,
            condition,
          };
        }
        return {
          passed: false,
          reason: `Artifact '${condition.artifactName}' does not exist or is unverified`,
          condition,
        };
      }

      case 'step_successful': {
        const stepRes = execution.stepResults[condition.stepId];
        if (stepRes && stepRes.status === 'COMPLETED') {
          return {
            passed: true,
            condition,
          };
        }
        return {
          passed: false,
          reason: `Required step '${condition.stepId}' status is '${stepRes?.status || 'PENDING'}', expected 'COMPLETED'`,
          condition,
        };
      }

      case 'state_equals': {
        const appId = condition.applicationId || 'blender';
        const obs = await ApplicationObserver.observe(appId, {
          workflowId: execution.workflowId,
          executionId: `cond_eval_${Date.now()}`,
        });

        if (obs === 'UNKNOWN' || obs.status === 'ERROR') {
          return {
            passed: false,
            reason: `Application '${appId}' observation returned UNKNOWN/ERROR`,
            condition,
          };
        }

        // Safe deterministic path traversal (no eval)
        const actualValue = this.resolveJsonPath(obs, condition.path);
        const matches = this.safeEquals(actualValue, condition.expectedValue);

        if (matches) {
          return {
            passed: true,
            condition,
          };
        }
        return {
          passed: false,
          reason: `State path '${condition.path}' value '${JSON.stringify(actualValue)}' does not equal expected '${JSON.stringify(condition.expectedValue)}'`,
          condition,
        };
      }

      default: {
        const unknownCond = condition as any;
        return {
          passed: false,
          reason: `Unsupported condition type: '${unknownCond?.type}'`,
          condition,
        };
      }
    }
  }

  /**
   * Resolves a simple dotted path on an object safely without eval.
   */
  private static resolveJsonPath(obj: any, path: string): unknown {
    if (!obj || typeof obj !== 'object' || !path) return undefined;
    const parts = path.split('.');
    let curr: any = obj;
    for (const part of parts) {
      if (curr === null || curr === undefined) return undefined;
      curr = curr[part];
    }
    return curr;
  }

  /**
   * Safe deep equality comparison for JSON-serializable primitives and objects.
   */
  private static safeEquals(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || b === null || a === undefined || b === undefined) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a === 'object') {
      return JSON.stringify(a) === JSON.stringify(b);
    }
    return false;
  }
}
