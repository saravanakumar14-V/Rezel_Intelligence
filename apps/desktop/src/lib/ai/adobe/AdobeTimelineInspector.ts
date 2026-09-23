/**
 * REZEL 13.3.4 — Adobe Timeline Inspector
 *
 * Dedicated, read-only timeline and keyframe inspector for Adobe After Effects.
 * Inspects timeline properties, current time, and keyframes via the native AfterEffectsApplicationAdapter.
 *
 * STRICT INVARIANTS:
 * - Purely READ-ONLY: Never invokes mutative capabilities.
 * - Security: Acquires READ resource lock before inspection and guarantees release in finally block.
 * - Provenance: Every snapshot carries `source = 'APPLICATION_ADAPTER'` and timestamp.
 * - Cache: Bounded memory cache with 2000ms TTL and mutation-triggered invalidation.
 * - Bounded Inspection: Defaults to maxProperties = 50, maxKeyframesPerProperty = 200, sets isTruncated.
 */

import { ApplicationRegistry } from '../../applications/ApplicationRegistry';
import { ResourceLockManager } from '../scheduler/ResourceLockManager';
import type {
  AdobeTimelineSnapshot,
  AnimatedPropertySnapshot,
  KeyframeSnapshot,
  PropertyValueType,
  TimelineInspectionOptions,
} from './types';

interface CachedTimelineEntry {
  readonly snapshot: AdobeTimelineSnapshot;
  readonly cachedAt: number;
}

export class AdobeTimelineInspectorImpl {
  private cache: Map<string, CachedTimelineEntry> = new Map();
  private ttlMs: number;
  private hitCount = 0;
  private missCount = 0;

  constructor(ttlMs = 2000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Inspects timeline and keyframe state in a strictly read-only manner.
   */
  async inspectTimeline(options?: TimelineInspectionOptions): Promise<AdobeTimelineSnapshot> {
    const now = Date.now();
    const compKey = options?.compId !== undefined ? `comp_${options.compId}` : 'active';
    const layerKey = options?.layerIndex !== undefined ? `layer_${options.layerIndex}` : 'active';
    const propKey = options?.propertyPath ? `prop_${options.propertyPath}` : 'all';
    const cacheKey = `ae_timeline_${options?.sessionId || 'default'}_${compKey}_${layerKey}_${propKey}`;

    // 1. Check memory cache unless forceRefresh is requested
    if (!options?.forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && now - cached.cachedAt <= this.ttlMs) {
        this.hitCount++;
        return cached.snapshot;
      }
    }

    this.missCount++;

    // 2. Resolve native After Effects adapter from registry
    const adapter = ApplicationRegistry.get('after_effects');
    if (!adapter) {
      const disconnectedSnapshot: AdobeTimelineSnapshot = {
        compositionId: '',
        currentTime: 0,
        properties: [],
        source: 'APPLICATION_ADAPTER',
        observedAt: now,
        status: 'ADAPTER_DISCONNECTED',
      };
      return disconnectedSnapshot;
    }

    // 3. Verify adapter session health
    const health = adapter.getHealth(options?.sessionId);
    if (!health || health.state === 'UNHEALTHY' || health.state === 'STALE' || health.state === 'UNKNOWN' || health.state === 'DISCONNECTED') {
      const disconnectedSnapshot: AdobeTimelineSnapshot = {
        compositionId: '',
        currentTime: 0,
        properties: [],
        source: 'APPLICATION_ADAPTER',
        observedAt: health?.lastHeartbeat || now,
        status: 'ADAPTER_DISCONNECTED',
      };
      return disconnectedSnapshot;
    }

    // 4. Acquire READ lock on app:after_effects
    const workflowId = options?.workflowId || 'workflow_ae_timeline_inspect';
    const executionId = options?.executionId || `exec_ae_timeline_inspect_${crypto.randomUUID()}`;

    await ResourceLockManager.acquireLocks(workflowId, executionId, [
      { uri: 'app:after_effects', access: 'READ' },
    ]);

    try {
      // 5. Execute read-only inspect_timeline via adapter execute
      const maxProperties = options?.maxProperties ?? 50;
      const maxKeyframes = options?.maxKeyframes ?? 200;

      const opResult = await adapter.execute({
        operationId: `op_timeline_inspect_${crypto.randomUUID()}`,
        applicationId: 'after_effects',
        sessionId: options?.sessionId,
        capabilityId: 'ae_inspect_timeline',
        parameters: {
          compId: options?.compId,
          layerIndex: options?.layerIndex,
          propertyPath: options?.propertyPath,
          maxProperties,
          maxKeyframes,
        },
        mutatesExternalState: false,
        context: {
          workflowId,
          executionId,
        },
      });

      // 6. Handle failure or disconnected response
      if (!opResult.success || !opResult.output) {
        const isDisconnected =
          opResult.outcome === 'UNKNOWN' ||
          opResult.error?.includes('DISCONNECTED') ||
          opResult.error?.includes('ae_ipc_timeout');

        const failedSnapshot: AdobeTimelineSnapshot = {
          compositionId: '',
          currentTime: 0,
          properties: [],
          source: 'APPLICATION_ADAPTER',
          observedAt: now,
          status: isDisconnected ? 'ADAPTER_DISCONNECTED' : 'UNKNOWN',
        };
        return failedSnapshot;
      }

      // 7. Parse and sanitize payload
      const rawData = typeof opResult.output === 'string' ? JSON.parse(opResult.output) : opResult.output;
      const snapshot = this.sanitizeTimelinePayload(rawData, now, maxProperties, maxKeyframes);

      // 8. Cache result
      this.cache.set(cacheKey, {
        snapshot,
        cachedAt: now,
      });

      return snapshot;
    } catch (err: any) {
      const errorSnapshot: AdobeTimelineSnapshot = {
        compositionId: '',
        currentTime: 0,
        properties: [],
        source: 'APPLICATION_ADAPTER',
        observedAt: now,
        status: 'UNKNOWN',
      };
      return errorSnapshot;
    } finally {
      // 9. Guarantee lock release
      ResourceLockManager.releaseLocks(workflowId, executionId);
    }
  }

  /**
   * Sanitizes raw adapter timeline payload into a valid AdobeTimelineSnapshot.
   */
  private sanitizeTimelinePayload(
    raw: any,
    now: number,
    maxProperties: number,
    maxKeyframes: number
  ): AdobeTimelineSnapshot {
    if (!raw || typeof raw !== 'object') {
      return {
        compositionId: '',
        currentTime: 0,
        properties: [],
        source: 'APPLICATION_ADAPTER',
        observedAt: now,
        status: 'UNKNOWN',
      };
    }

    const compId = String(raw.compositionId ?? raw.compId ?? '');
    const layerId = raw.layerId ? String(raw.layerId) : undefined;
    const layerIndex = typeof raw.layerIndex === 'number' ? raw.layerIndex : undefined;
    const currentTime = typeof raw.currentTime === 'number' && !isNaN(raw.currentTime) && isFinite(raw.currentTime) ? raw.currentTime : 0;

    let isTruncated = Boolean(raw.isTruncated);
    const properties: AnimatedPropertySnapshot[] = [];

    if (Array.isArray(raw.properties)) {
      const rawProps = raw.properties.slice(0, maxProperties);
      if (raw.properties.length > maxProperties) {
        isTruncated = true;
      }

      for (const p of rawProps) {
        if (!p || typeof p !== 'object') continue;
        const propertyPath = String(p.propertyPath ?? '');
        const displayName = String(p.displayName ?? propertyPath);
        const valueType: PropertyValueType = this.normalizeValueType(p.valueType);
        const animated = Boolean(p.animated);

        const keyframes: KeyframeSnapshot[] = [];
        if (Array.isArray(p.keyframes)) {
          const rawKeys = p.keyframes.slice(0, maxKeyframes);
          if (p.keyframes.length > maxKeyframes) {
            isTruncated = true;
          }

          for (const k of rawKeys) {
            if (!k || typeof k !== 'object') continue;
            const time = typeof k.time === 'number' && !isNaN(k.time) && isFinite(k.time) ? k.time : 0;
            keyframes.push({
              time,
              value: k.value,
              interpolationIn: k.interpolationIn ? String(k.interpolationIn) : undefined,
              interpolationOut: k.interpolationOut ? String(k.interpolationOut) : undefined,
              spatialInterpolation: k.spatialInterpolation ? String(k.spatialInterpolation) : undefined,
            });
          }
        }

        properties.push({
          propertyPath,
          displayName,
          valueType,
          animated,
          keyframes,
        });
      }
    }

    return {
      compositionId: compId,
      layerId,
      layerIndex,
      currentTime,
      properties,
      source: 'APPLICATION_ADAPTER',
      observedAt: now,
      isTruncated,
      status: 'ACTIVE_COMPOSITION',
    };
  }

  private normalizeValueType(vt: any): PropertyValueType {
    if (vt === 'NUMBER' || vt === 'VECTOR' || vt === 'COLOR' || vt === 'BOOLEAN' || vt === 'TEXT') {
      return vt;
    }
    return 'UNKNOWN';
  }

  /**
   * Invalidates the timeline cache upon mutation or focus change.
   */
  invalidate(): void {
    this.cache.clear();
  }

  /**
   * Retrieves diagnostic cache statistics.
   */
  getCacheStats(): { size: number; hitCount: number; missCount: number } {
    return {
      size: this.cache.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
    };
  }

  /**
   * Resets diagnostic counters.
   */
  resetStats(): void {
    this.hitCount = 0;
    this.missCount = 0;
    this.cache.clear();
  }
}

export const AdobeTimelineInspector = new AdobeTimelineInspectorImpl();
