/**
 * Rezel 11.6C — Controlled Computer Actions & Secure Desktop Interaction Types
 *
 * Defines contracts for typed computer actions, targets, execution results,
 * capability requirements, idempotency, and security error models.
 */

import type { ScreenBounds } from '../screen/types';
import type { RiskLevel } from '../../security/PermissionManager';
import type { VerificationResult } from '../verification/types';

export type ComputerActionType =
  | 'CLICK'
  | 'DOUBLE_CLICK'
  | 'RIGHT_CLICK'
  | 'TYPE'
  | 'KEY_PRESS'
  | 'HOTKEY'
  | 'SCROLL'
  | 'DRAG'
  | 'FOCUS'
  | 'SELECT'
  | 'EXPAND'
  | 'COLLAPSE'
  | 'PASTE';

export interface ComputerActionTarget {
  readonly windowId?: string;
  readonly applicationId?: string;
  readonly sessionId?: string;
  readonly elementId?: string;
  readonly bounds?: ScreenBounds;
  readonly text?: string;
  readonly processId?: number;
  readonly handle?: number;
}

export interface ComputerAction {
  readonly actionId: string;
  readonly type: ComputerActionType;
  readonly target?: ComputerActionTarget;
  readonly parameters?: Record<string, unknown>;
  readonly mutatesExternalState: boolean;
  readonly riskLevel: RiskLevel;
  readonly requiredCapability: string;
  readonly requiresApproval: boolean;
  readonly timeoutMs?: number;
  readonly isSensitive?: boolean;
  readonly isIdempotent: boolean;
  readonly approvalId?: string;
}

export type ComputerActionStatus =
  | 'SUCCESS'
  | 'FAILED'
  | 'DENIED'
  | 'STALE_TARGET'
  | 'FOCUS_FAILED'
  | 'TIMEOUT'
  | 'UNKNOWN';

export interface ComputerActionResult {
  readonly actionId: string;
  readonly targetId?: string;
  readonly status: ComputerActionStatus;
  readonly observationBefore?: string;
  readonly observationAfter?: string;
  readonly verification?: VerificationResult;
  readonly error?: string;
  readonly errorCode?: string;
  readonly errorDetails?: Record<string, unknown>;
  readonly executedAt: number;
  readonly durationMs: number;
}

export type ComputerErrorCode =
  | 'COMPUTER_ACTION_DENIED'
  | 'COMPUTER_ACTION_UNAUTHORIZED'
  | 'COMPUTER_ACTION_INVALID'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_STALE'
  | 'TARGET_AMBIGUOUS'
  | 'FOCUS_FAILED'
  | 'APPLICATION_SESSION_STALE'
  | 'ACTION_OUT_OF_BOUNDS'
  | 'SENSITIVE_INPUT_BLOCKED'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_REJECTED'
  | 'POLICY_DENIED'
  | 'ACTION_TIMEOUT'
  | 'ACTION_UNKNOWN'
  | 'EMERGENCY_ABORTED'
  | 'COMPUTER_CONTROL_UNAVAILABLE';

export class ComputerError extends Error {
  readonly code: ComputerErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ComputerErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[Computer::${code}] ${message}`);
    this.name = 'ComputerError';
    this.code = code;
    this.details = details;
  }
}
