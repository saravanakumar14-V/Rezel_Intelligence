import type { Workflow } from '../ai/types';
import type {
  CycleResult,
  AgentAction,
  RejectedAction,
  SanitizedErrorContext,
  UnknownMutationRecord,
} from './types';
import { ActionValidator } from './ActionValidator';
import { ErrorContextBuilder } from './ErrorContextBuilder';

export class ResultCollector {
  /**
   * Transforms an executed Workflow object into a bounded, sanitized CycleResult.
   *
   * DOES NOT copy the entire Workflow object or raw tool outputs into cycle results.
   */
  static collect(options: {
    cycleIndex: number;
    acceptedActions: AgentAction[];
    rejectedActionSummaries: RejectedAction[];
    workflow?: Workflow | null;
    tokenUsage?: { input: number; output: number };
    durationMs: number;
    projectId?: string;
  }): CycleResult {
    const {
      cycleIndex,
      acceptedActions,
      rejectedActionSummaries,
      workflow,
      tokenUsage = { input: 0, output: 0 },
      durationMs,
      projectId,
    } = options;

    let workflowOutcome: CycleResult['workflowOutcome'] = undefined;
    let verificationSummary: string | undefined = undefined;
    const errors: SanitizedErrorContext[] = [];
    const unknownMutations: UnknownMutationRecord[] = [];

    if (workflow) {
      // Map workflow status to workflowOutcome
      if (workflow.status === 'SUCCEEDED') workflowOutcome = 'SUCCEEDED';
      else if (workflow.status === 'FAILED') workflowOutcome = 'FAILED';
      else if (workflow.status === 'PARTIALLY_SUCCEEDED') workflowOutcome = 'PARTIALLY_SUCCEEDED';
      else if (workflow.status === 'CANCELLED') workflowOutcome = 'CANCELLED';
      else workflowOutcome = 'FAILED';

      const steps = workflow.plan.steps || [];
      const verifiedSteps = steps.filter((s) => s.verificationResult === 'VERIFIED');
      const notVerifiedSteps = steps.filter((s) => s.verificationResult === 'NOT_VERIFIED');
      const unknownSteps = steps.filter(
        (s) => s.executionOutcome === 'UNKNOWN' || s.verificationResult === 'UNKNOWN'
      );

      if (unknownSteps.length > 0) {
        verificationSummary = 'UNKNOWN';
      } else if (verifiedSteps.length > 0 || notVerifiedSteps.length > 0) {
        verificationSummary = `${verifiedSteps.length}/${steps.length} VERIFIED${
          notVerifiedSteps.length > 0 ? ` (${notVerifiedSteps.length} NOT_VERIFIED)` : ''
        }`;
      } else {
        verificationSummary = 'UNVERIFIED';
      }

      // Collect sanitized error contexts and UNKNOWN mutation records from steps
      steps.forEach((step) => {
        if (step.executionOutcome === 'UNKNOWN' || step.verificationResult === 'UNKNOWN') {
          const fingerprint = ActionValidator.createFingerprint(
            step.toolName || 'unknown',
            step.toolArgs || {},
            projectId || workflow.projectId
          );
          unknownMutations.push({
            fingerprint,
            workflowId: workflow.id,
            cycleIndex,
            timestamp: step.completedAt || new Date().toISOString(),
            reason: step.error || 'Ambiguous external mutation outcome',
          });
        }

        if (step.status === 'FAILED' || step.error) {
          const actionMatch = acceptedActions.find((a) => a.id === step.id);
          const sanitizedErr = ErrorContextBuilder.build({
            actionId: step.id,
            actionType: actionMatch?.type ?? 'RUN_COMMAND',
            capabilityId: step.toolName || 'unknown',
            rawError: step.error || 'Execution failed',
            failureReason: step.failureReason,
            projectRootPath: projectId || workflow.projectId,
            verificationResult: step.verificationResult,
          });
          errors.push(sanitizedErr);
        }
      });
    }

    return {
      cycleIndex,
      acceptedActions,
      rejectedActionSummaries,
      workflowOutcome,
      verificationSummary,
      errors: errors.length > 0 ? errors : undefined,
      unknownMutations: unknownMutations.length > 0 ? unknownMutations : undefined,
      tokenUsage,
      durationMs,
    };
  }
}
