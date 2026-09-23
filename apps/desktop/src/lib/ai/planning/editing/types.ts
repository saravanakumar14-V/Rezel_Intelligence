/**
 * Rezel 11.8C — Plan Editing & Controlled Revision Types
 *
 * Defines contracts for typed plan edit operations, draft revisions,
 * risk/cost deltas, running-workflow protection, audit records, and errors.
 */

import type { HierarchicalPlan, PlanMetadata } from '../types';
import type { PlanStep } from '../../types';
import type { RiskLevel } from '../../../security/PermissionManager';
import type { RoutingProfile, ProviderVendor } from '../../providers/types';
import type { PlanDiff, PlanReview } from '../review/types';

export type PlanEditOperation =
  | { type: 'ADD_STEP'; phaseId: string; subgoalId: string; step: PlanStep; dependsOn?: string[] }
  | { type: 'REMOVE_STEP'; stepId: string; repairDependencies?: boolean }
  | { type: 'UPDATE_STEP'; stepId: string; updates: Partial<PlanStep> }
  | { type: 'REORDER_STEP'; phaseId: string; subgoalId: string; stepId: string; targetIndex: number }
  | { type: 'SKIP_STEP'; stepId: string }
  | { type: 'UPDATE_PARAMETER'; stepId: string; toolArgs: Record<string, unknown> }
  | { type: 'UPDATE_ROUTING_PROFILE'; routingProfile: RoutingProfile; phaseId?: string; stepId?: string }
  | { type: 'UPDATE_PROVIDER_MODEL'; stepId?: string; vendor: ProviderVendor; modelId: string }
  | { type: 'UPDATE_APPROVAL_REQUIREMENT'; phaseId?: string; stepId?: string; requiresApproval: boolean }
  | { type: 'UPDATE_CHECKPOINT'; phaseId: string; checkpointBoundary: boolean }
  | { type: 'UPDATE_VERIFICATION'; phaseId?: string; stepId?: string; criteria: string[] }
  | { type: 'ADD_DEPENDENCY'; stepId: string; dependsOnStepId: string }
  | { type: 'REMOVE_DEPENDENCY'; stepId: string; dependsOnStepId: string }
  | { type: 'UPDATE_PLAN_METADATA'; updates: Partial<PlanMetadata> };

export type PlanRevisionStatus = 'DRAFT' | 'VALID' | 'INVALID' | 'COMMITTED' | 'REJECTED';

export interface PlanRevisionAuditRecord {
  readonly revisionId: string;
  readonly sourcePlanId: string;
  readonly sourceVersion: number;
  readonly newVersion: number;
  readonly operations: PlanEditOperation[];
  readonly riskDelta: {
    readonly fromMaxRisk: RiskLevel;
    readonly toMaxRisk: RiskLevel;
    readonly addedHighRiskCount: number;
  };
  readonly costDelta: {
    readonly fromCost?: number;
    readonly toCost?: number;
  };
  readonly actor: string;
  readonly createdAt: number;
}

export interface PlanRevision {
  readonly revisionId: string;
  readonly sourcePlanId: string;
  readonly sourceVersion: number;
  readonly newPlanId: string;
  readonly newVersion: number;
  readonly draftPlan: HierarchicalPlan;
  readonly operations: PlanEditOperation[];
  readonly diff: PlanDiff;
  readonly review: PlanReview;
  status: PlanRevisionStatus;
  readonly createdAt: number;
  committedAt?: number;
  readonly auditRecord?: PlanRevisionAuditRecord;
}

export type PlanEditErrorCode =
  | 'UNSAFE_APPROVAL_DOWNGRADE'
  | 'DEPENDENCY_INTEGRITY_VIOLATION'
  | 'STEP_NOT_FOUND'
  | 'PHASE_NOT_FOUND'
  | 'SUBGOAL_NOT_FOUND'
  | 'RUNNING_WORKFLOW_IMMUTABLE'
  | 'INVALID_REVISION_STATE'
  | 'CAPABILITY_MISMATCH';

export class PlanEditError extends Error {
  readonly code: PlanEditErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: PlanEditErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[PlanEdit::${code}] ${message}`);
    this.name = 'PlanEditError';
    this.code = code;
    this.details = details;
  }
}
