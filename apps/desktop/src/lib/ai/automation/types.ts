/**
 * Rezel 11.6D — Closed-Loop Computer Automation Types
 *
 * Defines contracts for bounded automation goals, control-loop states,
 * execution traces, completion criteria, and automation error models.
 */

import type { RoutingProfile } from '../providers/types';
import type { RiskLevel } from '../../security/PermissionManager';

export type AutomationLoopState =
  | 'IDLE'
  | 'OBSERVING'
  | 'UNDERSTANDING'
  | 'PLANNING'
  | 'AUTHORIZING'
  | 'ACTING'
  | 'VERIFYING'
  | 'RECOVERY'
  | 'RECOVERY_REQUIRED'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED';

export interface ComputerAutomationGoal {
  readonly goalId: string;
  readonly workflowId: string;
  readonly description: string;
  readonly maxIterations: number;
  readonly maxActions: number;
  readonly timeoutMs: number;
  readonly requiresVerification: boolean;
  readonly routingProfile?: RoutingProfile;
  readonly allowedApplications?: string[];
  readonly allowedCapabilities?: string[];
  readonly riskCeiling?: RiskLevel;
}

export interface AutomationIterationTrace {
  readonly iteration: number;
  readonly state: AutomationLoopState;
  readonly observationId?: string;
  readonly actionId?: string;
  readonly actionType?: string;
  readonly verificationResult?: string;
  readonly error?: string;
  readonly timestamp: number;
}

export interface AutomationExecutionResult {
  readonly goalId: string;
  readonly workflowId: string;
  readonly status: 'COMPLETED' | 'FAILED' | 'RECOVERY_REQUIRED' | 'CANCELLED' | 'LIMIT_REACHED';
  readonly iterations: number;
  readonly actionCount: number;
  readonly traces: AutomationIterationTrace[];
  readonly finalObservationId?: string;
  readonly stopReason?: string;
  readonly durationMs: number;
}

export type AutomationErrorCode =
  | 'AUTOMATION_LIMIT_REACHED'
  | 'AUTOMATION_TIMEOUT'
  | 'AUTOMATION_RECOVERY_EXHAUSTED'
  | 'AUTOMATION_UNKNOWN_STOP'
  | 'AUTOMATION_POLICY_DENIED'
  | 'AUTOMATION_APPROVAL_DENIED'
  | 'AUTOMATION_SESSION_STALE'
  | 'AUTOMATION_INVALID_GOAL';

export class AutomationError extends Error {
  readonly code: AutomationErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AutomationErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[Automation::${code}] ${message}`);
    this.name = 'AutomationError';
    this.code = code;
    this.details = details;
  }
}
