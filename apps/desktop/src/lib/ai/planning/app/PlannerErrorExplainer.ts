/**
 * Rezel 13.2.4 — Planner Error Explainer
 *
 * Translates low-level planner, compiler, and precondition failures into
 * actionable, non-cryptic user-facing explanations.
 *
 * Security Guarantee: Never exposes raw secrets, internal memory handles, or raw tokens.
 */

import type { PlannerFailureCode } from './types';

export interface ExplanationContext {
  readonly failureCode: PlannerFailureCode;
  readonly reason: string;
  readonly appId?: string;
  readonly appName?: string;
  readonly operationId?: string;
  readonly operationName?: string;
  readonly failedPrecondition?: string;
  readonly candidateAppIds?: readonly string[];
  readonly candidateOperationIds?: readonly string[];
}

export class PlannerErrorExplainer {
  /**
   * Generates a clear, user-facing explanation from a failure context.
   */
  static explain(context: ExplanationContext): string {
    const appLabel = context.appName || context.appId || 'the target application';
    const opLabel = context.operationName || context.operationId || 'this action';

    switch (context.failureCode) {
      case 'OPERATION_UNAVAILABLE':
        return `This action is not available for ${appLabel} yet.`;

      case 'UNKNOWN_APPLICATION_STATE':
        return `Rezel cannot safely determine whether ${appLabel} is ready for ${opLabel}.`;

      case 'PRECONDITION_FAILED':
        if (context.failedPrecondition === 'DOCUMENT_OPEN') {
          return `${opLabel} requires an open document. No document is currently open in ${appLabel}.`;
        }
        if (context.failedPrecondition === 'APP_READY') {
          return `${appLabel} window is not open or ready for input.`;
        }
        return `${opLabel} requires ${context.failedPrecondition || 'a specific prerequisite'} to be satisfied first in ${appLabel}.`;

      case 'AMBIGUOUS_APPLICATION':
        if (context.candidateAppIds && context.candidateAppIds.length > 0) {
          return `Which application should I use? Multiple applications are open: ${context.candidateAppIds.join(', ')}.`;
        }
        return 'Which application should I use? Please specify the target application.';

      case 'AMBIGUOUS_OPERATION':
        if (context.candidateOperationIds && context.candidateOperationIds.length > 0) {
          return `Multiple actions match your request in ${appLabel}: [${context.candidateOperationIds.join(', ')}]. Please clarify.`;
        }
        return `Multiple actions match your request in ${appLabel}. Please clarify.`;

      case 'APPLICATION_NOT_FOUND':
        return `The application '${appLabel}' is not currently running or registered with Rezel.`;

      case 'INVALID_PARAMETERS':
        return `Missing or invalid information needed to execute ${opLabel} in ${appLabel}.`;

      case 'COMPILATION_FAILED':
        return `Unable to prepare ${opLabel} in ${appLabel}: ${context.reason}.`;

      case 'POLICY_DENIED':
        return `This action was blocked by security policy for ${appLabel}.`;

      case 'EXECUTION_FAILED':
        return `Execution of ${opLabel} failed in ${appLabel}.`;

      case 'VERIFICATION_FAILED':
        return `Action completed in ${appLabel}, but post-action verification did not succeed.`;

      case 'UNKNOWN':
      default:
        return `An unexpected error occurred while planning ${opLabel} for ${appLabel}.`;
    }
  }
}
