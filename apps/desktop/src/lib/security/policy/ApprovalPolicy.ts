import type { PolicyEvaluationContext, PolicyDecision, ApprovalContext } from './PolicyTypes';
import type { ClassifiedRisk } from './RiskClassifier';

export class ApprovalPolicy {
  static decide(ctx: PolicyEvaluationContext, classified: ClassifiedRisk): PolicyDecision {
    if (classified.risk === 'CRITICAL') {
      return {
        decision: 'DENY',
        reason: classified.reason || 'Operation classified as critical risk.',
      };
    }

    if (classified.risk === 'HIGH') {
      const targetPath = (ctx.args.path || ctx.args.source) as string;
      
      const approvalContext: ApprovalContext = {
        message: `Rezel wants to execute ${ctx.capabilityId}.`,
        risk: 'HIGH',
        isReversible: false, // Default to false for HIGH risk
        target: targetPath,
      };

      if (classified.resourceInfo) {
        if (ctx.capabilityId === 'fs.delete') {
          approvalContext.message = `Rezel wants to delete ${classified.resourceInfo.itemCount} item(s) totaling ${classified.resourceInfo.size} bytes.`;
          approvalContext.affectedItems = classified.resourceInfo.itemCount;
          approvalContext.affectedBytes = classified.resourceInfo.size;
        }
      }

      return {
        decision: 'REQUIRE_APPROVAL',
        reason: classified.reason || 'High risk operation requires user approval.',
        approvalContext
      };
    }

    // MEDIUM and LOW risk are typically allowed by policy without prompt,
    // though the PermissionManager might still prompt if it hasn't been granted for the session.
    // The PolicyEngine's job is structural/contextual rules, not session grants.
    return {
      decision: 'ALLOW',
      reason: classified.reason || 'Operation within safe bounds.',
    };
  }
}
