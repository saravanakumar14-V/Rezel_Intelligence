import type { AgentAction, ApprovalPolicyLevel } from './types';

const HIGH_RISK_ACTION_TYPES = new Set([
  'WRITE_FILE',
  'DELETE_FILE',
  'RUN_COMMAND',
  'MODIFY_APPLICATION',
]);

export interface ApprovalCheckOptions {
  policyLevel: ApprovalPolicyLevel;
  proposedActions: AgentAction[];
  consecutiveAutoCycles: number;
  maxConsecutiveAutoCycles?: number;
}

export class ApprovalPolicyManager {
  /**
   * Determines whether the reasoning loop should pause for human approval before cycle execution.
   *
   * IMPORTANT INVARIANT:
   * ApprovalPolicy != PolicyEngine.
   * AUTONOMOUS mode controls loop checkpoint frequency ONLY and NEVER disables per-action
   * PolicyEngine, SafetyValidator, or human confirmation gates for individual risky commands.
   */
  static shouldPauseForApproval(options: ApprovalCheckOptions): boolean {
    const { policyLevel, proposedActions, consecutiveAutoCycles, maxConsecutiveAutoCycles } = options;

    if (policyLevel === 'SUPERVISED') {
      // Always pause before every reasoning cycle
      return true;
    }

    if (policyLevel === 'BALANCED') {
      const maxAuto = maxConsecutiveAutoCycles ?? 3;
      if (consecutiveAutoCycles >= maxAuto) {
        return true;
      }
      // Pause if any proposed action is high-risk
      const hasHighRisk = proposedActions.some((action) =>
        HIGH_RISK_ACTION_TYPES.has(action.type)
      );
      if (hasHighRisk) {
        return true;
      }
      return false;
    }

    if (policyLevel === 'AUTONOMOUS') {
      const maxAuto = maxConsecutiveAutoCycles ?? 5;
      // Pause only if max consecutive auto-cycles budget is reached to prevent runaway loops
      return consecutiveAutoCycles >= maxAuto;
    }

    return false;
  }
}
