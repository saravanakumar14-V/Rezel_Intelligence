/**
 * Rezel 13.2.4 — Application Intelligence Planner Integration Types
 *
 * Defines strongly-typed contracts for application-aware intent resolution,
 * deterministic operation selection, planning boundaries, and user-facing explanations.
 *
 * Strict Non-Execution Guarantee: The planner selects and compiles registered operations.
 * It NEVER dispatches computer actions or executes arbitrary UI sequences directly.
 */

import type { CompiledOperationPlan } from '../../compiler/types';
import type { PlanStep } from '../../types';
import type { ApplicationProfile, OperationDefinition } from '../../profiles/types';
import type { ApplicationRuntimeState } from '../../inference/types';

// ─── 1. Intent Model ──────────────────────────────────────────────────────────

export interface ApplicationOperationIntent {
  readonly explicitAppId?: string;
  readonly operationQuery: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly source: 'USER' | 'VOICE' | 'COMMAND' | 'WORKFLOW';
}

// ─── 2. Planner Failure Codes ─────────────────────────────────────────────────

export type PlannerFailureCode =
  | 'APPLICATION_NOT_FOUND'
  | 'AMBIGUOUS_APPLICATION'
  | 'NO_PROFILE'
  | 'OPERATION_UNAVAILABLE'
  | 'AMBIGUOUS_OPERATION'
  | 'UNKNOWN_APPLICATION_STATE'
  | 'PRECONDITION_FAILED'
  | 'INVALID_PARAMETERS'
  | 'COMPILATION_FAILED'
  | 'POLICY_DENIED'
  | 'ADAPTER_DISCONNECTED'
  | 'EXECUTION_FAILED'
  | 'VERIFICATION_FAILED'
  | 'UNKNOWN';

export interface PlannerPlanningFailure {
  readonly success: false;
  readonly failureCode: PlannerFailureCode;
  readonly reason: string;
  readonly userExplanation: string;
  readonly appId?: string;
  readonly operationId?: string;
  readonly candidateAppIds?: readonly string[];
  readonly candidateOperationIds?: readonly string[];
  readonly details?: Readonly<Record<string, unknown>>;
}

// ─── 3. Planned Application Operation & Result ────────────────────────────────

export interface PlannedApplicationOperation {
  readonly operationId: string;
  readonly applicationId: string;
  readonly compiledPlan: CompiledOperationPlan;
  readonly planStep: PlanStep;
  readonly plannedAt: number;
}

export interface ExecutionResult {
  readonly success: boolean;
  readonly status:
    | 'SUCCESS'
    | 'FAILED'
    | 'DENIED'
    | 'CANCELLED'
    | 'DISCONNECTED'
    | 'UNKNOWN';

  readonly operationId: string;
  readonly applicationId: string;
  readonly adapterId?: string;
  readonly outcome?: unknown;
  readonly error?: string;
  readonly durationMs?: number;
}

export interface PlannedOperationExecutionResult {
  readonly success: boolean;
  readonly status: ExecutionResult['status'];
  readonly executionResult?: ExecutionResult;
  readonly results: import('../../computer/types').ComputerActionResult[];
  readonly error?: string;
}

export interface PlannerPlanningSuccess {
  readonly success: true;
  readonly plannedOperation: PlannedApplicationOperation;
  readonly profile: ApplicationProfile;
  readonly operation: OperationDefinition;
  readonly runtimeState?: ApplicationRuntimeState;
}

export type PlannerPlanningResult =
  | PlannerPlanningSuccess
  | PlannerPlanningFailure;

// ─── 4. Planning Context & Request ────────────────────────────────────────────

export interface ApplicationPlanningRequest {
  readonly query: string;
  readonly source?: 'USER' | 'VOICE' | 'COMMAND' | 'WORKFLOW';
  readonly explicitAppId?: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly sessionId?: string;
  readonly forceRefresh?: boolean;
  readonly runtimeState?: ApplicationRuntimeState;
  readonly uiObservation?: import('../../ui/types').UIAnalysisResult;
}

// ─── 5. Observability Decision Record ─────────────────────────────────────────

export interface PlanningDecisionRecord {
  readonly query: string;
  readonly intent: ApplicationOperationIntent;
  readonly resolvedAppId?: string;
  readonly candidateOperations: readonly string[];
  readonly selectedOperationId?: string;
  readonly runtimeStateObserved: boolean;
  readonly preconditionResult?: string;
  readonly compilationSuccess: boolean;
  readonly executionHandoff: boolean;
  readonly timestamp: number;
}
