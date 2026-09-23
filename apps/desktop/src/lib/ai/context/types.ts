/**
 * Rezel 11.5C — Unified Multimodal Context Contracts & Types
 *
 * Defines unified multimodal context structures, source provenance,
 * explicit evidence types, conflict models, and context-level errors.
 */

import type { VisionInput } from '../vision/types';
import type { AudioInput } from '../audio/types';

export type ContextSourceType =
  | 'USER_TEXT'
  | 'VOICE_TRANSCRIPT'
  | 'IMAGE'
  | 'SCREENSHOT'
  | 'APPLICATION_VIEW'
  | 'APPLICATION_STATE'
  | 'WORKFLOW_STATE'
  | 'RUNTIME_VARIABLE'
  | 'CONVERSATION';

export type ContextEvidenceType =
  | 'USER_ASSERTION'
  | 'STRUCTURED_APPLICATION_STATE'
  | 'VISUAL_EVIDENCE'
  | 'AUDIO_TRANSCRIPT'
  | 'WORKFLOW_STATE'
  | 'DERIVED_MODEL_OUTPUT';

export type ContextConflictType =
  | 'USER_INPUT_CONFLICT'
  | 'APPLICATION_STATE_CONFLICT'
  | 'WORKFLOW_STATE_CONFLICT'
  | 'VISUAL_STRUCTURED_CONFLICT'
  | 'DUPLICATE_CONTEXT';

export type ContextConflictSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ContextConflict {
  readonly conflictId: string;
  readonly sources: string[];
  readonly conflictType: ContextConflictType;
  readonly severity: ContextConflictSeverity;
  readonly description: string;
  readonly resolution?: string;
}

export interface AudioTranscriptContextItem {
  readonly id: string;
  readonly text: string;
  readonly confidence?: number;
  readonly isSensitive?: boolean;
  readonly sourceId?: string;
}

export interface ApplicationStateContextItem {
  readonly applicationId: string;
  readonly sessionId?: string;
  readonly timestamp: number;
  readonly entities: unknown[];
  readonly status: string;
  readonly isAuthoritative: boolean;
}

export interface WorkflowStateContextItem {
  readonly workflowId: string;
  readonly currentStepId?: string;
  readonly state: string;
  readonly checkpointId?: string;
}

export interface ConversationContextItem {
  readonly role: string;
  readonly content: string;
}

export interface UnifiedMultimodalContext {
  readonly contextId: string;
  readonly text?: string;
  readonly audioTranscripts?: AudioTranscriptContextItem[];
  readonly visualInputs?: VisionInput[];
  readonly audioInputs?: AudioInput[];
  readonly applicationState?: ApplicationStateContextItem[];
  readonly workflowState?: WorkflowStateContextItem;
  readonly runtimeVariables?: Record<string, unknown>;
  readonly conversation?: ConversationContextItem[];
  readonly conflicts?: ContextConflict[];
  readonly isSensitive?: boolean;
  readonly createdAt: number;
}

export type ContextErrorCode =
  | 'CONTEXT_INVALID'
  | 'CONTEXT_SOURCE_MISSING'
  | 'CONTEXT_CONFLICT'
  | 'CONTEXT_CAPABILITY_UNSATISFIABLE'
  | 'CONTEXT_TOO_LARGE'
  | 'CONTEXT_SENSITIVE_DATA_BLOCKED'
  | 'CONTEXT_MEDIA_UNAVAILABLE';

export class ContextError extends Error {
  readonly code: ContextErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ContextErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[Context::${code}] ${message}`);
    this.name = 'ContextError';
    this.code = code;
    this.details = details;
  }
}
