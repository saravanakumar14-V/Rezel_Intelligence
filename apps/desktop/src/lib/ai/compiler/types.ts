/**
 * Rezel 13.2.3 — Declarative Operation Compiler Types
 *
 * Defines strongly-typed contracts for compiled operation plans,
 * compilation failure codes, parameter validation results, and compiler requests.
 *
 * Strict Non-Execution Guarantee: The compiler produces declarative execution plans.
 * It NEVER dispatches computer actions or mutates operating system state.
 */

import type { ComputerAction } from '../computer/types';
import type { VerificationPredicate } from '../verification/types';
import type { UIAnalysisResult } from '../ui/types';
import type { ApplicationRuntimeState } from '../inference/types';

// ─── 1. Failure Codes ─────────────────────────────────────────────────────────

export type OperationFailureCode =
  | 'PRECONDITION_FAILED'
  | 'INVALID_PARAMETERS'
  | 'TARGET_NOT_FOUND'
  | 'AMBIGUOUS_TARGET'
  | 'POLICY_DENIED'
  | 'ACTION_FAILED'
  | 'VERIFICATION_FAILED'
  | 'UNKNOWN';

export interface OperationCompilationFailure {
  readonly success: false;
  readonly failureCode: OperationFailureCode;
  readonly reason: string;
  readonly operationId: string;
  readonly appId: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

// ─── 2. Compiled Operation Plan ───────────────────────────────────────────────

export interface CompiledNativeStrategy {
  readonly adapterId: string;
  readonly operationId: string;
  readonly capabilityId: string;
}

export interface CompiledOperationPlan {
  readonly operationId: string;
  readonly appId: string;
  readonly sessionId: string;

  readonly actions: readonly ComputerAction[];

  readonly requiredPermissions: readonly string[];

  readonly postconditions: readonly VerificationPredicate[];

  readonly nativeStrategy?: CompiledNativeStrategy;

  readonly compiledAt: number;

  readonly profileVersion?: string;
}

export interface OperationCompilationSuccess {
  readonly success: true;
  readonly plan: CompiledOperationPlan;
}

export type OperationCompilationResult =
  | OperationCompilationSuccess
  | OperationCompilationFailure;

// ─── 3. Compilation Request & Options ─────────────────────────────────────────

export interface OperationCompilationRequest {
  readonly appId: string;
  readonly operationId: string;
  readonly sessionId?: string;
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly version?: string;
  readonly uiObservation?: UIAnalysisResult;
  readonly runtimeState?: ApplicationRuntimeState;
  readonly forceRefresh?: boolean;
}
