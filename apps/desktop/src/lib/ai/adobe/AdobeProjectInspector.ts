/**
 * REZEL 13.3.2 — Adobe Project Inspector
 *
 * Dedicated, read-only inspector for Adobe After Effects.
 * Bridges native AfterEffectsApplicationAdapter inspection into canonical
 * `AdobeProjectSnapshot` structures for the Rezel Application Intelligence runtime.
 *
 * STRICT INVARIANTS:
 * - Purely READ-ONLY: Never invokes mutative capabilities (e.g. ae_add_text_layer, ae_create_comp).
 * - Security: Acquires READ resource lock before inspection and guarantees release in finally block.
 * - Provenance: Every snapshot carries `source = 'APPLICATION_ADAPTER'` and timestamp.
 * - Cache: Bounded memory cache with 2000ms TTL and mutation-triggered invalidation.
 */

import { ApplicationRegistry } from '../../applications/ApplicationRegistry';
import { ResourceLockManager } from '../scheduler/ResourceLockManager';
import type { AdobeInspectionOptions, AdobeProjectSnapshot } from './types';
import { validateRawAdobePayload } from './payloadValidator';

interface CachedSnapshotEntry {
  readonly snapshot: AdobeProjectSnapshot;
  readonly cachedAt: number;
}

export class AdobeProjectInspectorImpl {
  private cache: Map<string, CachedSnapshotEntry> = new Map();
  private ttlMs: number;
  private hitCount = 0;
  private missCount = 0;

  constructor(ttlMs = 2000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Inspects the active After Effects project state in a strictly read-only manner.
   */
  async inspectProject(options?: AdobeInspectionOptions): Promise<AdobeProjectSnapshot> {
    const now = Date.now();
    const cacheKey = `after_effects_${options?.sessionId || 'default'}`;

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
      const disconnectedSnapshot: AdobeProjectSnapshot = {
        status: 'ADAPTER_DISCONNECTED',
        compositions: [],
        source: 'APPLICATION_ADAPTER',
        observedAt: now,
      };
      return disconnectedSnapshot;
    }

    // 3. Verify adapter session health
    const health = adapter.getHealth(options?.sessionId);
    if (!health || health.state === 'UNHEALTHY' || health.state === 'STALE' || health.state === 'UNKNOWN') {
      const disconnectedSnapshot: AdobeProjectSnapshot = {
        status: 'ADAPTER_DISCONNECTED',
        compositions: [],
        source: 'APPLICATION_ADAPTER',
        observedAt: health?.lastHeartbeat || now,
      };
      return disconnectedSnapshot;
    }

    // 4. Acquire READ lock on app:after_effects
    const workflowId = options?.workflowId || 'workflow_ae_inspect';
    const executionId = options?.executionId || `exec_ae_inspect_${crypto.randomUUID()}`;

    await ResourceLockManager.acquireLocks(workflowId, executionId, [
      { uri: 'app:after_effects', access: 'READ' },
    ]);

    try {
      // 5. Execute read-only inspect via the adapter's inspect() interface
      const inspectResult = await adapter.inspect(
        {
          applicationId: 'after_effects',
          sessionId: options?.sessionId,
          context: {
            workflowId,
            executionId,
          },
        }
      );

      // 6. Handle inspection failure or disconnected response
      if (inspectResult.status === 'ERROR' || inspectResult.status === 'UNKNOWN') {
        const isDisconnected =
          inspectResult.error?.includes('DISCONNECTED') ||
          inspectResult.error?.includes('ae_ipc_timeout');

        const failedSnapshot: AdobeProjectSnapshot = {
          status: isDisconnected ? 'ADAPTER_DISCONNECTED' : 'UNKNOWN',
          compositions: [],
          source: 'APPLICATION_ADAPTER',
          observedAt: inspectResult.timestamp || now,
        };
        return failedSnapshot;
      }

      // 7. Validate and parse raw inspection output into canonical AdobeProjectSnapshot
      const rawPayload = inspectResult.rawOutput ?? {
        projectOpen: true,
        compositions: inspectResult.entities,
      };

      const snapshot = validateRawAdobePayload(rawPayload, {
        maxCompositions: options?.maxCompositions,
        maxLayersPerComposition: options?.maxLayersPerComposition,
        observedAt: inspectResult.timestamp || now,
      });

      // 8. Cache valid snapshot
      this.cache.set(cacheKey, {
        snapshot,
        cachedAt: now,
      });

      return snapshot;
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      const isDisconnected = errorMsg.includes('DISCONNECTED') || errorMsg.includes('ae_ipc_timeout');

      const errorSnapshot: AdobeProjectSnapshot = {
        status: isDisconnected ? 'ADAPTER_DISCONNECTED' : 'UNKNOWN',
        compositions: [],
        source: 'APPLICATION_ADAPTER',
        observedAt: now,
      };
      return errorSnapshot;
    } finally {
      // 9. Guarantee READ lock release
      ResourceLockManager.releaseLocks(workflowId, executionId);
    }
  }

  /**
   * Invalidates cached snapshot for a specific session or default key.
   */
  invalidateCache(sessionId?: string): void {
    if (sessionId) {
      this.cache.delete(`after_effects_${sessionId}`);
    } else {
      this.cache.delete('after_effects_default');
    }
  }

  /**
   * Clears the entire inspection cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Returns cache diagnostics.
   */
  getCacheStats(): { size: number; hitCount: number; missCount: number; ttlMs: number } {
    return {
      size: this.cache.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
      ttlMs: this.ttlMs,
    };
  }

  /**
   * Updates cache TTL.
   */
  setCacheTTL(ttlMs: number): void {
    this.ttlMs = ttlMs;
  }
}

export const AdobeProjectInspector = new AdobeProjectInspectorImpl();
