/**
 * Rezel 11.4D — Human Approval, Risk-Aware HITL & Pre-Mutation Approval Gates Types
 *
 * Defines contracts for risk levels, approval requests, approval state machines,
 * approval policies, audit trails, and classified approval error models.
 */

import type { RiskLevel } from '../../security/PermissionManager';

export type ApprovalState = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface ApprovalRequest {
  readonly approvalId: string;
  readonly workflowId: string;
  readonly stepId: string;
  readonly checkpointId: string;
  readonly riskLevel: RiskLevel;
  readonly reason: string;
  readonly summary: string;
  readonly requestedCapabilities: string[];
  readonly affectedResources: string[];
  readonly applicationId?: string;
  readonly applicationSessionId?: string;
  readonly provider?: string;
  readonly modelId?: string;
  readonly estimatedCost?: number;
  readonly mutatesExternalState: boolean;
  readonly createdAt: number;
  readonly expiresAt?: number;
  state: ApprovalState;
  decisionTimestamp?: number;
  decisionReason?: string;
  decisionBy?: string;
}

export interface ApprovalAuditRecord {
  readonly auditId: string;
  readonly approvalId: string;
  readonly workflowId: string;
  readonly stepId: string;
  readonly riskLevel: RiskLevel;
  readonly action: string;
  readonly decision: ApprovalState;
  readonly timestamp: number;
  readonly reason?: string;
  readonly actor?: string;
}

export interface ApprovalPolicy {
  autoApproveLowRisk: boolean;
  requireApprovalForMediumRisk: boolean;
  requireApprovalForHighRisk: boolean;
  requireApprovalForCriticalRisk: boolean;
  defaultExpirationMs?: number;
}

export type ApprovalErrorCode =
  | 'APPROVAL_NOT_FOUND'
  | 'APPROVAL_ALREADY_DECIDED'
  | 'APPROVAL_EXPIRED'
  | 'APPROVAL_CANCELLED'
  | 'APPROVAL_POLICY_VIOLATION'
  | 'POLICY_REJECTED_AFTER_APPROVAL'
  | 'SESSION_STALE_AFTER_APPROVAL';

export class ApprovalError extends Error {
  readonly code: ApprovalErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ApprovalErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[Approval::${code}] ${message}`);
    this.name = 'ApprovalError';
    this.code = code;
    this.details = details;
  }
}
