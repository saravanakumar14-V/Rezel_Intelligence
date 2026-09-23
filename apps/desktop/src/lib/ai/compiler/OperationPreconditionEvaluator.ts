/**
 * Rezel 13.2.3 — Operation Precondition Evaluator
 *
 * Asserts that the live ApplicationRuntimeState satisfies all required
 * preconditions before operation compilation can proceed.
 *
 * Strict Tri-State Semantics:
 *   TRUE    -> Precondition satisfied
 *   FALSE   -> PRECONDITION_FAILED
 *   UNKNOWN -> PRECONDITION_FAILED (never assume truth on incomplete evidence)
 */

import type { ApplicationRuntimeState } from '../inference/types';

export interface PreconditionEvaluationResult {
  readonly satisfied: boolean;
  readonly failureCode?: 'PRECONDITION_FAILED';
  readonly failedPrecondition?: string;
  readonly reason?: string;
}

export class OperationPreconditionEvaluator {
  /**
   * Evaluates an operation's declared preconditions against the live ApplicationRuntimeState.
   */
  static evaluate(
    preconditions: readonly string[] = [],
    runtimeState?: ApplicationRuntimeState
  ): PreconditionEvaluationResult {
    if (preconditions.length === 0) {
      return { satisfied: true };
    }

    if (!runtimeState) {
      return {
        satisfied: false,
        failureCode: 'PRECONDITION_FAILED',
        reason: 'Application runtime state is unavailable for precondition evaluation',
      };
    }

    for (const stateId of preconditions) {
      const stateObj = runtimeState.activeStates[stateId];

      if (!stateObj) {
        return {
          satisfied: false,
          failureCode: 'PRECONDITION_FAILED',
          failedPrecondition: stateId,
          reason: `Required precondition '${stateId}' was not evaluated or is absent from runtime state`,
        };
      }

      if (stateObj.isTrue === 'FALSE') {
        const evidenceDesc = stateObj.evidence?.[0]?.description || 'predicate not satisfied';
        return {
          satisfied: false,
          failureCode: 'PRECONDITION_FAILED',
          failedPrecondition: stateId,
          reason: `Precondition '${stateId}' is FALSE (${evidenceDesc})`,
        };
      }

      if (stateObj.isTrue === 'UNKNOWN') {
        const evidenceDesc = stateObj.evidence?.[0]?.description || 'insufficient evidence';
        return {
          satisfied: false,
          failureCode: 'PRECONDITION_FAILED',
          failedPrecondition: stateId,
          reason: `Precondition '${stateId}' is UNKNOWN (${evidenceDesc}). Operations cannot proceed on ambiguous state.`,
        };
      }
    }

    return { satisfied: true };
  }
}
