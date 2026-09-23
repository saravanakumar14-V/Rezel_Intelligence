/**
 * REZEL 13.3.2 — Adobe Project & Composition Intelligence Types
 *
 * Defines strongly typed, read-only data models for Adobe After Effects
 * project state, compositions, layers, transform states, and provenance.
 *
 * Strictly Read-Only: Contains no mutation, execution, or planner capabilities.
 */

export type AdobeProjectStatus =
  | 'PROJECT_CLOSED'
  | 'PROJECT_OPEN'
  | 'ACTIVE_PROJECT'
  | 'NO_ACTIVE_COMPOSITION'
  | 'ACTIVE_COMPOSITION'
  | 'ADAPTER_DISCONNECTED'
  | 'UNKNOWN';

export type AdobeLayerType =
  | 'TEXT'
  | 'SHAPE'
  | 'SOLID'
  | 'FOOTAGE'
  | 'PRECOMP'
  | 'NULL'
  | 'UNKNOWN';

export interface LayerTransformState {
  readonly position?: readonly [number, number, number];
  readonly scale?: readonly [number, number, number];
  readonly rotation?: number;
  readonly opacity?: number;
}

export interface LayerSnapshot {
  readonly index: number;
  readonly id: string;
  readonly name: string;
  readonly type: AdobeLayerType;
  readonly isVisible?: boolean;
  readonly isLocked?: boolean;
  readonly transformState?: LayerTransformState;
}

export interface CompositionSnapshot {
  readonly id: string;
  readonly name: string;
  readonly width?: number;
  readonly height?: number;
  readonly duration?: number;
  readonly frameRate?: number;
  readonly layers: readonly LayerSnapshot[];
  readonly isTruncated?: boolean;
}

export interface AdobeProjectSnapshot {
  readonly status: AdobeProjectStatus;
  readonly projectPath?: string;
  readonly projectName?: string;
  readonly dirty?: boolean;

  readonly compositions: readonly CompositionSnapshot[];
  readonly activeCompositionId?: string;

  readonly isTruncated?: boolean;
  readonly source: 'APPLICATION_ADAPTER';
  readonly observedAt: number;
}

export interface AdobeInspectionOptions {
  readonly sessionId?: string;
  readonly forceRefresh?: boolean;
  readonly maxCompositions?: number;
  readonly maxLayersPerComposition?: number;
  readonly workflowId?: string;
  readonly executionId?: string;
}

// ─── REZEL 13.3.4 — Adobe Timeline & Keyframe Types ─────────────────────────

export type PropertyValueType =
  | 'NUMBER'
  | 'VECTOR'
  | 'COLOR'
  | 'BOOLEAN'
  | 'TEXT'
  | 'UNKNOWN';

export interface KeyframeSnapshot {
  readonly time: number;
  readonly value: unknown;
  readonly interpolationIn?: string;
  readonly interpolationOut?: string;
  readonly spatialInterpolation?: string;
  readonly selected?: boolean;
}

export interface AnimatedPropertySnapshot {
  readonly propertyPath: string;
  readonly displayName: string;
  readonly valueType: PropertyValueType;
  readonly animated: boolean;
  readonly keyframes: readonly KeyframeSnapshot[];
}

export interface AdobeTimelineSnapshot {
  readonly compositionId: string;
  readonly layerId?: string;
  readonly layerIndex?: number;
  readonly currentTime: number;
  readonly properties: readonly AnimatedPropertySnapshot[];
  readonly source: 'APPLICATION_ADAPTER';
  readonly observedAt: number;
  readonly isTruncated?: boolean;
  readonly status?: AdobeProjectStatus;
}

export interface TimelineInspectionOptions {
  readonly sessionId?: string;
  readonly forceRefresh?: boolean;
  readonly compId?: number;
  readonly layerIndex?: number;
  readonly propertyPath?: string;
  readonly maxProperties?: number;
  readonly maxKeyframes?: number;
  readonly workflowId?: string;
  readonly executionId?: string;
}

// ─── REZEL 13.3.5 — Adobe Effects & Property Intelligence Types ─────────────

export type EffectPropertyValueType =
  | 'NUMBER'
  | 'VECTOR'
  | 'COLOR'
  | 'BOOLEAN'
  | 'ENUM'
  | 'TEXT'
  | 'UNKNOWN';

export interface AdobeEffectPropertySnapshot {
  readonly propertyPath: string;
  readonly displayName: string;
  readonly valueType: EffectPropertyValueType;
  readonly value?: unknown;
  readonly animated?: boolean;
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly source: 'APPLICATION_ADAPTER';
}

export interface AdobeEffectSnapshot {
  readonly identity: string;
  readonly name: string;
  readonly matchName: string;
  readonly occurrenceIndex: number;
  readonly enabled?: boolean;
  readonly numProperties: number;
  readonly properties?: readonly AdobeEffectPropertySnapshot[];
  readonly source: 'APPLICATION_ADAPTER';
  readonly observedAt: number;
}

export interface AdobeEffectsListSnapshot {
  readonly compositionId: string;
  readonly layerId?: string;
  readonly layerIndex?: number;
  readonly effects: readonly AdobeEffectSnapshot[];
  readonly source: 'APPLICATION_ADAPTER';
  readonly observedAt: number;
  readonly isTruncated?: boolean;
  readonly status?: AdobeProjectStatus;
}

export interface EffectsInspectionOptions {
  readonly sessionId?: string;
  readonly forceRefresh?: boolean;
  readonly compId?: number;
  readonly layerIndex?: number;
  readonly maxEffects?: number;
  readonly maxPropertiesPerEffect?: number;
  readonly workflowId?: string;
  readonly executionId?: string;
}

export interface SetPropertyValueOptions {
  readonly compId?: number;
  readonly layerIndex: number;
  readonly propertyPath: string;
  readonly value: unknown;
  readonly effectMatchName?: string;
  readonly occurrenceIndex?: number;
  readonly sessionId?: string;
  readonly workflowId?: string;
  readonly executionId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 13.3.6 Render Queue & Export Models
// ─────────────────────────────────────────────────────────────────────────────

export type RenderQueueItemStatus =
  | 'QUEUED'
  | 'UNQUEUED'
  | 'DONE'
  | 'USER_STOPPED'
  | 'ERR_STOPPED'
  | 'UNKNOWN';

export interface RenderQueueItemSnapshot {
  readonly index: number;
  readonly compositionId?: string;
  readonly compositionName?: string;
  readonly status: RenderQueueItemStatus;
  readonly outputFilePath?: string;
}

export interface AdobeRenderQueueSnapshot {
  readonly source: 'APPLICATION_ADAPTER';
  readonly observedAt: number;
  readonly status: AdobeProjectStatus;
  readonly items: readonly RenderQueueItemSnapshot[];
  readonly isTruncated?: boolean;
  readonly totalItems?: number;
}

export interface RenderQueueInspectionOptions {
  readonly sessionId?: string;
  readonly forceRefresh?: boolean;
  readonly maxItems?: number;
  readonly workflowId?: string;
  readonly executionId?: string;
}

export interface AddToRenderQueueOptions {
  readonly compId?: number;
  readonly sessionId?: string;
  readonly workflowId?: string;
  readonly executionId?: string;
}

export interface SetRenderOutputPathOptions {
  readonly queueIndex: number;
  readonly outputFilePath: string;
  readonly expectedCompId?: string;
  readonly sessionId?: string;
  readonly workflowId?: string;
  readonly executionId?: string;
}

export interface StartRenderOptions {
  readonly sessionId?: string;
  readonly workflowId?: string;
  readonly executionId?: string;
}

export interface RenderExecutionResult {
  readonly success: boolean;
  readonly status:
    | 'SUCCESS'
    | 'SUCCESS_UNVERIFIED'
    | 'FAILED'
    | 'DENIED'
    | 'CANCELLED'
    | 'DISCONNECTED'
    | 'UNKNOWN'
    | 'PRECONDITION_FAILED';
  readonly renderStarted?: number;
  readonly renderFinished?: number;
  readonly numItems?: number;
  readonly completedItems?: number;
  readonly failedItems?: number;
  readonly outputFiles?: readonly string[];
  readonly verificationStatus?: 'VERIFIED_ON_DISK' | 'FILE_NOT_FOUND' | 'UNVERIFIED' | 'SKIPPED';
  readonly error?: string;
}

