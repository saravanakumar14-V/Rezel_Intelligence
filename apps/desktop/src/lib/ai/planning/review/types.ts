/**
 * Rezel 11.8B — Plan Inspection & Review Types
 *
 * Defines contracts for structured read-only plan reviews, risk/approval
 * summaries, diagnostic issues/warnings, parallel branch discovery,
 * plan diffs, and review snapshots.
 */

import type { PlanComplexity } from '../types';
import type { RiskLevel } from '../../../security/PermissionManager';

export type PlanReviewValidationStatus = 'VALID' | 'VALID_WITH_WARNINGS' | 'INVALID';

export type PlanReviewIssueType =
  | 'MISSING_APPLICATION'
  | 'CAPABILITY_MISMATCH'
  | 'COST_WARNING'
  | 'APPROVAL_REQUIRED'
  | 'CHECKPOINT_REQUIRED'
  | 'DEPENDENCY_BLOCK'
  | 'STALE_CONTEXT'
  | 'SESSION_UNAVAILABLE'
  | 'LOCAL_CAPABILITY_GAP';

export type PlanReviewIssueSeverity = 'INFO' | 'WARNING' | 'ERROR';

export interface PlanReviewIssue {
  readonly type: PlanReviewIssueType;
  readonly severity: PlanReviewIssueSeverity;
  readonly message: string;
  readonly phaseId?: string;
  readonly stepId?: string;
}

export interface PlanRiskSummary {
  readonly level: RiskLevel;
  readonly count: number;
  readonly highestRiskOperation?: string;
}

export interface ProviderRouteSummary {
  readonly vendor: string;
  readonly modelId: string;
  readonly routingProfile: string;
  readonly isPaid: boolean;
  readonly selectionReason?: string;
  readonly routeType: 'PLANNED'; // Planned route record, not execution guarantee
}

export interface PlanReviewStep {
  readonly stepId: string;
  readonly title: string;
  readonly description: string;
  readonly category?: string;
  readonly application?: string;
  readonly mutatesExternalState: boolean;
  readonly riskLevel: RiskLevel;
  readonly requiresApproval: boolean;
  readonly checkpointBoundary: boolean;
  readonly verificationSummary?: string;
  readonly dependencies: string[];
  readonly expectedOutputs: string[];
  readonly providerRoute?: ProviderRouteSummary;
}

export interface PlanReviewSubgoal {
  readonly subgoalId: string;
  readonly title: string;
  readonly objective: string;
  readonly stepCount: number;
  readonly dependencies: string[];
  readonly steps: PlanReviewStep[];
  readonly rationale?: string;
}

export interface PlanReviewPhase {
  readonly phaseId: string;
  readonly title: string;
  readonly objective: string;
  readonly applications: string[];
  readonly riskLevel: RiskLevel;
  readonly requiresApproval: boolean;
  readonly checkpointBoundary: boolean;
  readonly verificationCriteria: string[];
  readonly dependencies: string[];
  readonly subgoals: PlanReviewSubgoal[];
  readonly rationale?: string;
}

export interface PlanReview {
  readonly planId: string;
  readonly version: number;
  readonly goal: string;
  readonly summary: string;
  readonly complexity: PlanComplexity;
  readonly validationStatus: PlanReviewValidationStatus;
  readonly phases: PlanReviewPhase[];
  readonly totalSteps: number;
  readonly mutatingSteps: number;
  readonly approvalRequiredSteps: number;
  readonly checkpointCount: number;
  readonly applications: string[];
  readonly providers: ProviderRouteSummary[];
  readonly estimatedCost?: number;
  readonly estimatedDurationMs?: number;
  readonly estimatedProviderCalls?: number;
  readonly risks: PlanRiskSummary[];
  readonly issues: PlanReviewIssue[];
  readonly parallelBranches: string[][];
  readonly generatedAt: number;
}

export interface PlanDiff {
  readonly fromPlanId: string;
  readonly fromVersion: number;
  readonly toPlanId: string;
  readonly toVersion: number;
  readonly addedPhases: string[];
  readonly removedPhases: string[];
  readonly changedPhases: string[];
  readonly addedSteps: string[];
  readonly removedSteps: string[];
  readonly changedSteps: string[];
  readonly riskChanges: Array<{ stepId: string; oldRisk?: RiskLevel; newRisk?: RiskLevel }>;
  readonly dependencyChanges: Array<{ stepId: string; oldDeps: string[]; newDeps: string[] }>;
}

export interface PlanReviewSnapshot {
  readonly snapshotId: string;
  readonly planId: string;
  readonly planVersion: number;
  readonly review: PlanReview;
  readonly createdAt: number;
}
