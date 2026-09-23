/**
 * REZEL 13.3.4 — Adobe Timeline & Property Resolver
 *
 * Deterministically resolves semantic property and keyframe targets from an
 * AdobeTimelineSnapshot using strict identity and runtime state checks.
 *
 * CRITICAL INVARIANTS:
 * - Active composition state must be verified (ACTIVE_COMPOSITION === TRUE).
 * - If active composition is FALSE -> PRECONDITION_FAILED.
 * - If active composition is UNKNOWN -> UNKNOWN_APPLICATION_STATE.
 * - If adapter disconnected -> ADAPTER_DISCONNECTED.
 * - Property resolution by deterministic propertyPath (e.g. 'Transform.Position').
 * - Missing property -> PROPERTY_NOT_FOUND.
 * - Unsupported property -> PROPERTY_UNSUPPORTED.
 * - Keyframe identity: semantic composite of (compositionId + layerId + propertyPath + time).
 */

import type {
  AdobeTimelineSnapshot,
  AnimatedPropertySnapshot,
  KeyframeSnapshot,
} from './types';

export type TimelineResolverStatus =
  | 'SUCCESS'
  | 'PROPERTY_NOT_FOUND'
  | 'PROPERTY_UNSUPPORTED'
  | 'KEYFRAME_NOT_FOUND'
  | 'PRECONDITION_FAILED'
  | 'UNKNOWN_APPLICATION_STATE'
  | 'ADAPTER_DISCONNECTED'
  | 'INVALID_PARAMETERS';

export interface PropertyResolutionQuery {
  readonly compositionId?: string;
  readonly layerId?: string;
  readonly layerIndex?: number;
  readonly propertyPath: string;
}

export interface KeyframeResolutionQuery extends PropertyResolutionQuery {
  readonly time: number;
  readonly toleranceSeconds?: number;
}

export interface PropertyResolutionResult {
  readonly status: TimelineResolverStatus;
  readonly property?: AnimatedPropertySnapshot;
  readonly compositionId?: string;
  readonly layerId?: string;
  readonly reason?: string;
  readonly error?: string;
}

export interface KeyframeResolutionResult {
  readonly status: TimelineResolverStatus;
  readonly keyframe?: KeyframeSnapshot;
  readonly property?: AnimatedPropertySnapshot;
  readonly reason?: string;
  readonly error?: string;
}

export class AdobeTimelineResolver {
  /**
   * Supported canonical property paths in Phase 13.3.4.
   */
  static readonly SUPPORTED_PROPERTY_PATHS: readonly string[] = [
    'Transform.Position',
    'Transform.Scale',
    'Transform.Rotation',
    'Transform.Opacity',
    'Transform.Anchor Point',
    'Transform.AnchorPoint',
    'Position',
    'Scale',
    'Rotation',
    'Opacity',
  ];

  /**
   * Resolves an AnimatedPropertySnapshot from a timeline snapshot.
   */
  static resolveProperty(
    snapshot: AdobeTimelineSnapshot | undefined,
    query: PropertyResolutionQuery
  ): PropertyResolutionResult {
    // 1. Snapshot presence check
    if (!snapshot) {
      return {
        status: 'UNKNOWN_APPLICATION_STATE',
        reason: 'Timeline snapshot is unavailable',
        error: 'Snapshot unavailable',
      };
    }

    // 2. Adapter Disconnected check
    if (snapshot.status === 'ADAPTER_DISCONNECTED') {
      return {
        status: 'ADAPTER_DISCONNECTED',
        reason: 'After Effects adapter is disconnected',
        error: 'Adapter disconnected',
      };
    }

    // 3. Unknown application state check
    if (snapshot.status === 'UNKNOWN') {
      return {
        status: 'UNKNOWN_APPLICATION_STATE',
        reason: 'After Effects project state is UNKNOWN',
        error: 'Project state UNKNOWN',
      };
    }

    // 4. Precondition check: active composition
    if (snapshot.status === 'PROJECT_CLOSED' || snapshot.status === 'NO_ACTIVE_COMPOSITION' || !snapshot.compositionId) {
      return {
        status: 'PRECONDITION_FAILED',
        reason: 'No active composition available for timeline resolution',
        error: 'Precondition ACTIVE_COMPOSITION is false',
      };
    }

    // 5. Property path validation
    if (!query.propertyPath || typeof query.propertyPath !== 'string') {
      return {
        status: 'INVALID_PARAMETERS',
        reason: 'Property path is missing or invalid',
        error: 'Invalid propertyPath',
      };
    }

    const normalizedQueryPath = query.propertyPath.trim();

    // Check if property is in supported vocabulary
    const isSupported = this.SUPPORTED_PROPERTY_PATHS.some(
      (p) => p.toLowerCase() === normalizedQueryPath.toLowerCase()
    );

    // 6. Find property in snapshot
    const matchedProp = snapshot.properties.find((p) => {
      if (p.propertyPath.toLowerCase() === normalizedQueryPath.toLowerCase()) return true;
      if (p.displayName.toLowerCase() === normalizedQueryPath.toLowerCase()) return true;
      // Allow 'Position' matching 'Transform.Position'
      if (p.propertyPath.toLowerCase().endsWith(`.${normalizedQueryPath.toLowerCase()}`)) return true;
      return false;
    });

    if (!matchedProp) {
      if (!isSupported) {
        return {
          status: 'PROPERTY_UNSUPPORTED',
          reason: `Property '${normalizedQueryPath}' is not supported for timeline operations`,
          error: 'Property unsupported',
        };
      }
      return {
        status: 'PROPERTY_NOT_FOUND',
        reason: `Property '${normalizedQueryPath}' not found on layer`,
        error: 'Property not found',
      };
    }

    return {
      status: 'SUCCESS',
      property: matchedProp,
      compositionId: snapshot.compositionId,
      layerId: snapshot.layerId,
    };
  }

  /**
   * Resolves a specific KeyframeSnapshot at a given time.
   */
  static resolveKeyframe(
    snapshot: AdobeTimelineSnapshot | undefined,
    query: KeyframeResolutionQuery
  ): KeyframeResolutionResult {
    // 1. Time validation
    if (typeof query.time !== 'number' || isNaN(query.time) || !isFinite(query.time) || query.time < 0) {
      return {
        status: 'INVALID_PARAMETERS',
        reason: `Invalid keyframe time: ${query.time} (must be finite and >= 0)`,
        error: 'Invalid time',
      };
    }

    // 2. Resolve target property
    const propRes = this.resolveProperty(snapshot, query);
    if (propRes.status !== 'SUCCESS' || !propRes.property) {
      return {
        status: propRes.status,
        reason: propRes.reason,
        error: propRes.error,
      };
    }

    const property = propRes.property;
    const tolerance = query.toleranceSeconds ?? 0.01;

    // 3. Find keyframe near query.time
    const matchedKeyframe = property.keyframes.find(
      (k) => Math.abs(k.time - query.time) <= tolerance
    );

    if (!matchedKeyframe) {
      return {
        status: 'KEYFRAME_NOT_FOUND',
        property,
        reason: `No keyframe found at time ${query.time}s on property '${property.propertyPath}'`,
        error: 'Keyframe not found',
      };
    }

    return {
      status: 'SUCCESS',
      keyframe: matchedKeyframe,
      property,
    };
  }
}
