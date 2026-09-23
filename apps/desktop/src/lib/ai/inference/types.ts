/**
 * Rezel 13.2.2 — Runtime Application State Inference Types
 *
 * Defines the core data models for inferred application runtime states,
 * evidence tracing, tri-state truth values, confidence levels, and cache contracts.
 *
 * Strictly Read-Only: Contains no action execution, mutation, or planner capabilities.
 */

import type { UIAnalysisResult } from '../ui/types';
import type { AdobeProjectSnapshot } from '../adobe/types';
import type { BlenderSceneSnapshot } from '../blender/types';

// ─── 1. Core Tri-State & Confidence ───────────────────────────────────────────

export type TriStateBoolean = 'TRUE' | 'FALSE' | 'UNKNOWN';

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type StateEvidenceSource =
  | 'UIA'
  | 'WINDOW'
  | 'APPLICATION_ADAPTER'
  | 'PROFILE_MATCHER';

// ─── 2. State Evidence ────────────────────────────────────────────────────────

export interface StateEvidence {
  readonly stateId?: string;
  readonly source: StateEvidenceSource;
  readonly description: string;
  readonly matchedElements?: readonly string[];
  readonly adapterId?: string;
  readonly confidence: ConfidenceLevel;
  readonly observedAt: number;
  readonly details?: Readonly<Record<string, unknown>>;
}

// ─── 3. Inferred State & Values ───────────────────────────────────────────────

export interface InferredState {
  readonly stateId: string;
  readonly isTrue: TriStateBoolean;
  readonly confidence: ConfidenceLevel;
  readonly evidence: readonly StateEvidence[];
}

export interface InferredValue<T> {
  readonly value: T;
  readonly confidence: ConfidenceLevel;
  readonly evidence: readonly StateEvidence[];
}

// ─── 4. Standard State Dimensions ─────────────────────────────────────────────

export type ModalState = 'NONE' | 'MODAL' | 'UNKNOWN';

export type ActivityState =
  | 'IDLE'
  | 'BUSY'
  | 'LOADING'
  | 'RENDERING'
  | 'UNKNOWN';

export interface DocumentRuntimeState {
  readonly name?: InferredValue<string>;
  readonly path?: InferredValue<string>;
  readonly dirty?: InferredValue<boolean>;
}

// ─── 5. Application Runtime State Snapshot ───────────────────────────────────

export interface ApplicationRuntimeState {
  readonly appId: string;
  readonly sessionId?: string;
  readonly windowId?: string;
  readonly processId?: number;
  readonly profileStatus:
    | 'EXACT_MATCH'
    | 'COMPATIBLE'
    | 'UNKNOWN_VERSION'
    | 'NO_PROFILE';

  readonly activeStates: Readonly<Record<string, InferredState>>;

  readonly workspace?: InferredValue<string>;

  readonly document?: DocumentRuntimeState;

  readonly modalState: InferredValue<ModalState>;

  readonly activity: InferredValue<ActivityState>;

  readonly adobeProject?: AdobeProjectSnapshot;

  readonly blenderScene?: BlenderSceneSnapshot;

  readonly evidence: readonly StateEvidence[];

  readonly observedAt: number;
  readonly isCached?: boolean;
}

// ─── 6. Query & Invalidation Types ───────────────────────────────────────────

export interface StateInferenceQuery {
  readonly applicationId?: string;
  readonly sessionId?: string;
  readonly windowId?: string;
  readonly processId?: number;
  readonly executableName?: string;
  readonly version?: string;
  readonly uiObservation?: UIAnalysisResult;
  readonly forceRefresh?: boolean;
}

export type StateMutationType =
  | 'DOCUMENT_MUTATION'    // e.g., type_text, paste, document clear
  | 'NAVIGATION_MUTATION'  // e.g., navigate_to_path, folder browse
  | 'WORKSPACE_MUTATION'   // e.g., workspace tab change
  | 'ACTIVITY_MUTATION'    // e.g., click render, start export
  | 'MODAL_MUTATION'       // e.g., dialog open, dialog dismiss
  | 'FOCUS_ONLY'           // e.g., focus element (does not invalidate document/workspace)
  | 'GENERIC_MUTATION';    // fallback invalidation
