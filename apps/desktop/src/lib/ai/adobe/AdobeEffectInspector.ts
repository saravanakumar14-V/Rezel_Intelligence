/**
 * REZEL 13.3.5 — Adobe Effect Inspector
 *
 * Dedicated, read-only effects inspector for Adobe After Effects.
 * Inspects effects applied to layers and their parameters via the native AfterEffectsApplicationAdapter.
 *
 * STRICT INVARIANTS:
 * - Purely READ-ONLY: Never invokes mutative capabilities.
 * - Security: Acquires READ resource lock before inspection and guarantees release in finally block.
 * - Provenance: Every snapshot carries `source = 'APPLICATION_ADAPTER'` and timestamp.
 * - Cache: Bounded memory cache with 2000ms TTL and mutation-triggered invalidation.
 * - Bounded Inspection: Defaults to maxEffects = 50, maxPropertiesPerEffect = 100, sets isTruncated.
 */

import { ApplicationRegistry } from '../../applications/ApplicationRegistry';
import { ResourceLockManager } from '../scheduler/ResourceLockManager';
import type {
  AdobeEffectPropertySnapshot,
  AdobeEffectSnapshot,
  AdobeEffectsListSnapshot,
  EffectPropertyValueType,
  EffectsInspectionOptions,
} from './types';

interface CachedEffectsEntry {
  readonly snapshot: AdobeEffectsListSnapshot;
  readonly cachedAt: number;
}

export class AdobeEffectInspectorImpl {
  private cache: Map<string, CachedEffectsEntry> = new Map();
  private ttlMs: number;
  private hitCount = 0;
  private missCount = 0;

  constructor(ttlMs = 2000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Inspects effects applied to a layer in a strictly read-only manner.
   */
  async inspectEffects(options?: EffectsInspectionOptions): Promise<AdobeEffectsListSnapshot> {
    const now = Date.now();
    const compKey = options?.compId !== undefined ? `comp_${options.compId}` : 'active';
    const layerKey = options?.layerIndex !== undefined ? `layer_${options.layerIndex}` : 'active';
    const cacheKey = `ae_effects_${options?.sessionId || 'default'}_${compKey}_${layerKey}`;

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
      const disconnectedSnapshot: AdobeEffectsListSnapshot = {
        compositionId: '',
        effects: [],
        source: 'APPLICATION_ADAPTER',
        observedAt: now,
        status: 'ADAPTER_DISCONNECTED',
      };
      return disconnectedSnapshot;
    }

    // 3. Verify adapter session health
    const health = adapter.getHealth(options?.sessionId);
    if (!health || health.state === 'UNHEALTHY' || health.state === 'STALE' || health.state === 'UNKNOWN' || health.state === 'DISCONNECTED') {
      const disconnectedSnapshot: AdobeEffectsListSnapshot = {
        compositionId: '',
        effects: [],
        source: 'APPLICATION_ADAPTER',
        observedAt: health?.lastHeartbeat || now,
        status: 'ADAPTER_DISCONNECTED',
      };
      return disconnectedSnapshot;
    }

    // 4. Acquire READ lock on app:after_effects
    const workflowId = options?.workflowId || 'workflow_ae_effects_inspect';
    const executionId = options?.executionId || `exec_ae_effects_inspect_${crypto.randomUUID()}`;

    await ResourceLockManager.acquireLocks(workflowId, executionId, [
      { uri: 'app:after_effects', access: 'READ' },
    ]);

    try {
      // 5. Execute read-only inspect_effects via adapter execute
      const maxEffects = options?.maxEffects ?? 50;
      const maxPropertiesPerEffect = options?.maxPropertiesPerEffect ?? 100;

      const opResult = await adapter.execute({
        operationId: `op_effects_inspect_${crypto.randomUUID()}`,
        applicationId: 'after_effects',
        sessionId: options?.sessionId,
        capabilityId: 'ae_inspect_effects',
        parameters: {
          compId: options?.compId,
          layerIndex: options?.layerIndex,
          maxEffects,
          maxPropertiesPerEffect,
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

        const failedSnapshot: AdobeEffectsListSnapshot = {
          compositionId: '',
          effects: [],
          source: 'APPLICATION_ADAPTER',
          observedAt: now,
          status: isDisconnected ? 'ADAPTER_DISCONNECTED' : 'UNKNOWN',
        };
        return failedSnapshot;
      }

      // 7. Parse and sanitize payload
      const rawData = typeof opResult.output === 'string' ? JSON.parse(opResult.output) : opResult.output;
      const snapshot = this.sanitizeEffectsPayload(rawData, now, maxEffects, maxPropertiesPerEffect);

      // 8. Cache result
      this.cache.set(cacheKey, {
        snapshot,
        cachedAt: now,
      });

      return snapshot;
    } catch (err: any) {
      const errorSnapshot: AdobeEffectsListSnapshot = {
        compositionId: '',
        effects: [],
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
   * Sanitizes raw adapter effects payload into a valid AdobeEffectsListSnapshot.
   */
  private sanitizeEffectsPayload(
    raw: any,
    now: number,
    maxEffects: number,
    maxPropertiesPerEffect: number
  ): AdobeEffectsListSnapshot {
    if (!raw || typeof raw !== 'object') {
      return {
        compositionId: '',
        effects: [],
        source: 'APPLICATION_ADAPTER',
        observedAt: now,
        status: 'UNKNOWN',
      };
    }

    const compId = String(raw.compositionId ?? raw.compId ?? '');
    const layerId = raw.layerId ? String(raw.layerId) : undefined;
    const layerIndex = typeof raw.layerIndex === 'number' ? raw.layerIndex : undefined;

    let isTruncated = Boolean(raw.isTruncated);
    const effects: AdobeEffectSnapshot[] = [];

    if (Array.isArray(raw.effects)) {
      const rawEffects = raw.effects.slice(0, maxEffects);
      if (raw.effects.length > maxEffects) {
        isTruncated = true;
      }

      for (const eff of rawEffects) {
        if (!eff || typeof eff !== 'object') continue;

        const name = String(eff.name || '');
        const matchName = String(eff.matchName || 'UNKNOWN_EFFECT');
        const occurrenceIndex = typeof eff.occurrenceIndex === 'number' ? eff.occurrenceIndex : 1;
        const identity = eff.identity ? String(eff.identity) : `${layerId || 'layer'}_${matchName}_${occurrenceIndex}`;
        const enabled = typeof eff.enabled === 'boolean' ? eff.enabled : true;
        const numProperties = typeof eff.numProperties === 'number' ? eff.numProperties : 0;

        const properties: AdobeEffectPropertySnapshot[] = [];
        if (Array.isArray(eff.properties)) {
          const rawProps = eff.properties.slice(0, maxPropertiesPerEffect);
          if (eff.properties.length > maxPropertiesPerEffect) {
            isTruncated = true;
          }

          for (const p of rawProps) {
            if (!p || typeof p !== 'object') continue;

            const propertyPath = String(p.propertyPath || '');
            const displayName = String(p.displayName || p.name || propertyPath.split('.').pop() || '');
            const validTypes: EffectPropertyValueType[] = ['NUMBER', 'VECTOR', 'COLOR', 'BOOLEAN', 'ENUM', 'TEXT', 'UNKNOWN'];
            const valueType: EffectPropertyValueType = validTypes.includes(p.valueType) ? p.valueType : 'UNKNOWN';
            const animated = Boolean(p.animated);
            const minValue = typeof p.minValue === 'number' && !isNaN(p.minValue) ? p.minValue : undefined;
            const maxValue = typeof p.maxValue === 'number' && !isNaN(p.maxValue) ? p.maxValue : undefined;

            properties.push({
              propertyPath,
              displayName,
              valueType,
              value: p.value,
              animated,
              minValue,
              maxValue,
              source: 'APPLICATION_ADAPTER',
            });
          }
        }

        effects.push({
          identity,
          name,
          matchName,
          occurrenceIndex,
          enabled,
          numProperties,
          properties,
          source: 'APPLICATION_ADAPTER',
          observedAt: now,
        });
      }
    }

    return {
      compositionId: compId,
      layerId,
      layerIndex,
      effects,
      source: 'APPLICATION_ADAPTER',
      observedAt: now,
      isTruncated,
      status: compId ? 'ACTIVE_COMPOSITION' : 'NO_ACTIVE_COMPOSITION',
    };
  }

  /**
   * Invalidates cached effects for a layer or entire cache.
   */
  invalidate(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  invalidateLayer(sessionId?: string, compId?: number, layerIndex?: number): void {
    const sess = sessionId || 'default';
    const compPart = compId !== undefined ? `comp_${compId}` : '';
    const layerPart = layerIndex !== undefined ? `layer_${layerIndex}` : '';
    for (const key of this.cache.keys()) {
      if (
        key.startsWith(`ae_effects_${sess}`) &&
        (!compPart || key.includes(compPart)) &&
        (!layerPart || key.includes(layerPart))
      ) {
        this.cache.delete(key);
      }
    }
  }

  clearCache(): void {
    this.cache.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
    };
  }
}

export const AdobeEffectInspector = new AdobeEffectInspectorImpl(2000);
