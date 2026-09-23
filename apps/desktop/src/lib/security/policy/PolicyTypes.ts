import type { RiskLevel } from '../PermissionManager';

export interface ApprovalContext {
  message: string;
  risk: RiskLevel;
  isReversible: boolean;
  target?: string;
  affectedItems?: number;
  affectedBytes?: number;
}

export type PolicyDecision =
  | { decision: 'ALLOW'; reason: string }
  | { decision: 'DENY'; reason: string }
  | { decision: 'REQUIRE_APPROVAL'; reason: string; approvalContext: ApprovalContext };

export interface ResourceScope {
  allowedRoots: string[];
  deniedRoots?: string[];
  readAllowed: boolean;
  writeAllowed: boolean;
  deleteAllowed: boolean;
  maxAffectedItems?: number;
  maxAffectedBytes?: number;
}

export interface PolicyEvaluationContext {
  capabilityId: string;
  toolGroup: string;
  args: Record<string, unknown>;
  workflowId?: string;
  executionId?: string;
  activeScopes: ResourceScope[];
}
