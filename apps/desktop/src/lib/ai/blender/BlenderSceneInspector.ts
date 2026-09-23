/**
 * Rezel 13.4 — Blender Scene Inspector
 *
 * Dedicated, read-only inspector for Blender 3D.
 * Bridges native BlenderApplicationAdapter inspection into canonical
 * `BlenderSceneSnapshot` structures for the Rezel Application Intelligence runtime.
 *
 * STRICT INVARIANTS:
 * - Purely READ-ONLY: Never invokes mutative capabilities (e.g. blender.create_object).
 * - Security: Acquires READ resource lock ('app:blender') before inspection and guarantees release in finally block.
 * - Provenance: Every snapshot carries `source = 'APPLICATION_ADAPTER'` and timestamp.
 * - Cache: Bounded memory cache with 2000ms TTL and mutation-triggered invalidation.
 */

import { ApplicationRegistry } from '../../applications/ApplicationRegistry';
import { ResourceLockManager } from '../scheduler/ResourceLockManager';
import type {
  BlenderInspectionOptions,
  BlenderObjectQuery,
  BlenderResolutionResult,
  BlenderSceneSnapshot,
} from './types';
import { validateRawBlenderPayload } from './payloadValidator';
import { BlenderObjectResolver } from './BlenderObjectResolver';

interface CachedSnapshotEntry {
  readonly snapshot: BlenderSceneSnapshot;
  readonly cachedAt: number;
}

export class BlenderSceneInspectorImpl {
  private cache: Map<string, CachedSnapshotEntry> = new Map();
  private ttlMs: number;
  private hitCount = 0;
  private missCount = 0;

  constructor(ttlMs = 2000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Inspects the active Blender scene state in a strictly read-only manner.
   */
  async inspectScene(options?: BlenderInspectionOptions): Promise<BlenderSceneSnapshot> {
    const now = Date.now();
    const cacheKey = `blender_${options?.sessionId || 'default'}`;

    // 1. Check memory cache unless forceRefresh is requested
    if (!options?.forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (cached && now - cached.cachedAt <= this.ttlMs) {
        this.hitCount++;
        return cached.snapshot;
      }
    }

    this.missCount++;

    // 2. Resolve native Blender adapter from registry
    const adapter = ApplicationRegistry.get('blender');
    if (!adapter) {
      const disconnectedSnapshot: BlenderSceneSnapshot = {
        status: 'ADAPTER_DISCONNECTED',
        collections: [],
        objects: [],
        source: 'APPLICATION_ADAPTER',
        observedAt: now,
        isTruncated: false,
      };
      return disconnectedSnapshot;
    }

    // 3. Verify adapter session health
    const health = adapter.getHealth(options?.sessionId);
    if (!health || health.state === 'UNHEALTHY' || health.state === 'STALE' || health.state === 'UNKNOWN' || health.state === 'DISCONNECTED') {
      const disconnectedSnapshot: BlenderSceneSnapshot = {
        status: 'ADAPTER_DISCONNECTED',
        collections: [],
        objects: [],
        source: 'APPLICATION_ADAPTER',
        observedAt: health?.lastHeartbeat || now,
        isTruncated: false,
      };
      return disconnectedSnapshot;
    }

    // 4. Acquire READ lock on app:blender
    const workflowId = options?.workflowId || 'workflow_blender_inspect';
    const executionId = options?.executionId || `exec_blender_inspect_${crypto.randomUUID()}`;

    await ResourceLockManager.acquireLocks(workflowId, executionId, [
      { uri: 'app:blender', access: 'READ' },
    ]);

    try {
      // 5. Execute read-only inspect via the adapter's inspect() interface
      const inspectResult = await adapter.inspect({
        applicationId: 'blender',
        sessionId: options?.sessionId,
        context: {
          workflowId,
          executionId,
        },
      });

      // 6. Handle inspection failure or disconnected response
      if (inspectResult.status === 'ERROR' || inspectResult.status === 'UNKNOWN') {
        const isDisconnected =
          inspectResult.error?.includes('DISCONNECTED') ||
          inspectResult.error?.includes('blender_ipc_timeout') ||
          inspectResult.error?.includes('Connection closed');

        const failedSnapshot: BlenderSceneSnapshot = {
          status: isDisconnected ? 'ADAPTER_DISCONNECTED' : 'UNKNOWN',
          collections: [],
          objects: [],
          source: 'APPLICATION_ADAPTER',
          observedAt: inspectResult.timestamp || now,
          isTruncated: false,
        };
        return failedSnapshot;
      }

      // 7. Validate and parse raw inspection output into canonical BlenderSceneSnapshot
      const rawPayload = inspectResult.rawOutput ?? {
        scene_name: 'Scene',
        objects: inspectResult.entities,
      };

      const snapshot = validateRawBlenderPayload(rawPayload, {
        maxObjects: options?.maxObjects,
        maxCollections: options?.maxCollections,
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
      const isDisconnected =
        errorMsg.includes('DISCONNECTED') ||
        errorMsg.includes('blender_ipc_timeout') ||
        errorMsg.includes('Connection closed');

      const errorSnapshot: BlenderSceneSnapshot = {
        status: isDisconnected ? 'ADAPTER_DISCONNECTED' : 'UNKNOWN',
        collections: [],
        objects: [],
        source: 'APPLICATION_ADAPTER',
        observedAt: now,
        isTruncated: false,
      };
      return errorSnapshot;
    } finally {
      // 9. Guarantee READ lock release
      ResourceLockManager.releaseLocks(workflowId, executionId);
    }
  }

  /**
   * Resolves a target object from the active Blender scene state.
   */
  async resolveObject(
    query: BlenderObjectQuery,
    options?: BlenderInspectionOptions
  ): Promise<BlenderResolutionResult> {
    const snapshot = await this.inspectScene(options);
    if (snapshot.status === 'ADAPTER_DISCONNECTED' || snapshot.status === 'UNKNOWN') {
      return {
        success: false,
        failureCode: 'TARGET_NOT_FOUND',
        reason: `Blender scene unreachable (status: ${snapshot.status})`,
      };
    }

    return BlenderObjectResolver.resolveObject(snapshot, query);
  }

  /**
   * Invalidates cached snapshot for a specific session or default key.
   */
  invalidate(sessionId?: string): void {
    if (sessionId) {
      this.cache.delete(`blender_${sessionId}`);
    } else {
      this.cache.delete('blender_default');
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

export const BlenderSceneInspector = new BlenderSceneInspectorImpl();
