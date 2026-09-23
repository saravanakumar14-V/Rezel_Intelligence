import type { PolicyEvaluationContext, PolicyDecision } from './PolicyTypes';
import { RiskClassifier } from './RiskClassifier';
import { ApprovalPolicy } from './ApprovalPolicy';
import { PolicyStore } from './PolicyStore';

export class PolicyEngine {
  static async evaluate(ctx: PolicyEvaluationContext): Promise<PolicyDecision> {
    // Merge context scopes with global configured scopes
    ctx.activeScopes = [...PolicyStore.getGlobalScopes(), ...(ctx.activeScopes || [])];

    try {
      // 1. Classify the Risk based on capability, args, scope, and actual resource state
      const classified = await RiskClassifier.classify(ctx);
      
      // 2. Decide based on classified risk and policy rules
      const decision = ApprovalPolicy.decide(ctx, classified);
      
      return decision;
    } catch (err: any) {
      return {
        decision: 'DENY',
        reason: `Policy evaluation failed: ${err.message || String(err)}`
      };
    }
  }
}
