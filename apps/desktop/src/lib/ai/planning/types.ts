/**
 * Rezel 11.8A — Hierarchical Planning & Plan Intelligence Types
 *
 * Defines contracts for hierarchical goals, execution phases, subgoals,
 * plan quality metadata, verification criteria, and planning errors.
 */

import type { PlanStep, PlanStatus } from '../types';
import type { RiskLevel } from '../../security/PermissionManager';
import type { TaskProfile, ProviderRoute } from '../providers/types';
import type { WorkflowStepOutputDefinition } from '../dataflow/types';

export type PlanComplexity = 'SIMPLE' | 'MODERATE' | 'COMPLEX';

export interface PlanSubgoal {
  readonly subgoalId: string;
  readonly title: string;
  readonly objective: string;
  readonly steps: PlanStep[];
  readonly dependencies?: string[];
  readonly outputs?: WorkflowStepOutputDefinition[];
  readonly rationale?: string;
}

export interface PlanPhase {
  readonly phaseId: string;
  readonly title: string;
  readonly objective: string;
  readonly subgoals: PlanSubgoal[];
  readonly dependencies?: string[];
  readonly verificationCriteria?: string[];
  readonly riskLevel?: RiskLevel;
  readonly checkpointBoundary?: boolean;
  readonly requiresApproval?: boolean;
  readonly rationale?: string;
}

export interface PlanMetadata {
  readonly complexity: PlanComplexity;
  readonly estimatedDurationMs?: number;
  readonly estimatedProviderCalls?: number;
  readonly estimatedCost?: number;
  readonly confidence?: number;
  readonly requiredApplications?: string[];
  readonly requiredCapabilities?: string[];
  readonly rationale?: string;
}

export interface HierarchicalPlan {
  readonly id: string;
  readonly workflowId?: string;
  readonly projectId?: string;
  readonly goal: string;
  readonly version: number;
  readonly status: PlanStatus;
  readonly phases: PlanPhase[];
  readonly steps: PlanStep[]; // Flattened for backward-compatibility with WorkflowRuntime
  readonly taskProfile?: TaskProfile;
  readonly planningRoute?: ProviderRoute;
  readonly metadata?: PlanMetadata;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type PlanningErrorCode =
  | 'INVALID_PLAN_SCHEMA'
  | 'CIRCULAR_DEPENDENCY_DETECTED'
  | 'UNRESOLVED_DEPENDENCY'
  | 'UNKNOWN_APPLICATION_CAPABILITY'
  | 'PLANNING_FAILED'
  | 'PLAN_VALIDATION_FAILED'
  | 'CAPABILITY_MISMATCH';

export class PlanningError extends Error {
  readonly code: PlanningErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: PlanningErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[Planning::${code}] ${message}`);
    this.name = 'PlanningError';
    this.code = code;
    this.details = details;
  }
}
