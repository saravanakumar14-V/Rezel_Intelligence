/**
 * Rezel 13.3.6 — Adobe Render Queue Inspector
 *
 * Provides safe, bounded, read-only inspection of the Adobe After Effects render queue.
 * Guarantees memory caching (2000ms TTL), automatic READ lock acquisition on 'app:after_effects',
 * and honest reporting of disconnected/offline states.
 */

import { ApplicationRegistry } from '../../applications/ApplicationRegistry';
import { ResourceLockManager } from '../scheduler/ResourceLockManager';
import type {
  AdobeRenderQueueSnapshot,
  RenderQueueInspectionOptions,
  RenderQueueItemSnapshot,
  RenderQueueItemStatus,
} from './types';

interface CachedRenderQueue {
  snapshot: AdobeRenderQueueSnapshot;
  cachedAt: number;
}

export class AdobeRenderQueueInspectorImpl {
  private cache = new Map<string, CachedRenderQueue>();
  private readonly ttlMs: number;
  private hitCount = 0;
  private missCount = 0;

  constructor(ttlMs = 2000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Inspects the render queue with caching, lock acquisition, and bounded limits.
   */
  async inspectRenderQueue(
    options?: RenderQueueInspectionOptions
  ): Promise<AdobeRenderQueueSnapshot> {
    const now = Date.now();
    const cacheKey = `ae_rq_${options?.sessionId || 'default'}`;

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
      const disconnectedSnapshot: AdobeRenderQueueSnapshot = {
        source: 'APPLICATION_ADAPTER',
        observedAt: now,
        status: 'ADAPTER_DISCONNECTED',
        items: [],
      };
      return disconnectedSnapshot;
    }

    // 3. Verify adapter session health
    const health = adapter.getHealth(options?.sessionId);
    if (
      !health ||
      health.state === 'UNHEALTHY' ||
      health.state === 'STALE' ||
      health.state === 'UNKNOWN' ||
      health.state === 'DISCONNECTED'
    ) {
      const disconnectedSnapshot: AdobeRenderQueueSnapshot = {
        source: 'APPLICATION_ADAPTER',
        observedAt: health?.lastHeartbeat || now,
        status: 'ADAPTER_DISCONNECTED',
        items: [],
      };
      return disconnectedSnapshot;
    }

    // 4. Acquire READ lock on app:after_effects
    const workflowId = options?.workflowId || 'workflow_ae_rq_inspect';
    const executionId =
      options?.executionId || `exec_ae_rq_inspect_${crypto.randomUUID()}`;

    await ResourceLockManager.acquireLocks(workflowId, executionId, [
      { uri: 'app:after_effects', access: 'READ' },
    ]);

    try {
      // 5. Execute read-only inspect_render_queue via adapter execute
      const maxItems = options?.maxItems ?? 100;

      const opResult = await adapter.execute({
        operationId: `op_rq_inspect_${crypto.randomUUID()}`,
        applicationId: 'after_effects',
        sessionId: options?.sessionId,
        capabilityId: 'ae_inspect_render_queue',
        parameters: {
          maxItems,
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

        const failedSnapshot: AdobeRenderQueueSnapshot = {
          source: 'APPLICATION_ADAPTER',
          observedAt: now,
          status: isDisconnected ? 'ADAPTER_DISCONNECTED' : 'UNKNOWN',
          items: [],
        };
        return failedSnapshot;
      }

      // 7. Parse and sanitize payload
      const rawData =
        typeof opResult.output === 'string'
          ? JSON.parse(opResult.output)
          : opResult.output;
      const snapshot = this.sanitizeRenderQueuePayload(rawData, now, maxItems);

      // 8. Cache result
      this.cache.set(cacheKey, {
        snapshot,
        cachedAt: now,
      });

      return snapshot;
    } catch {
      const errorSnapshot: AdobeRenderQueueSnapshot = {
        source: 'APPLICATION_ADAPTER',
        observedAt: now,
        status: 'UNKNOWN',
        items: [],
      };
      return errorSnapshot;
    } finally {
      // Always release lock
      ResourceLockManager.releaseLocks(workflowId, executionId);
    }
  }

  /**
   * Sanitizes the raw IPC output into strongly typed, bounded RenderQueueItemSnapshots.
   */
  private sanitizeRenderQueuePayload(
    rawData: any,
    now: number,
    maxItems: number
  ): AdobeRenderQueueSnapshot {
    if (!rawData || typeof rawData !== 'object') {
      return {
        source: 'APPLICATION_ADAPTER',
        observedAt: now,
        status: 'UNKNOWN',
        items: [],
      };
    }

    if (rawData.code === 'PROJECT_NOT_OPEN' || rawData.projectOpen === false) {
      return {
        source: 'APPLICATION_ADAPTER',
        observedAt: now,
        status: 'UNKNOWN',
        items: [],
      };
    }

    const rawItems = Array.isArray(rawData.items) ? rawData.items : [];
    const isTruncated = rawData.isTruncated || rawItems.length > maxItems;
    const boundedItems = rawItems.slice(0, maxItems);

    const items: RenderQueueItemSnapshot[] = boundedItems.map((it: any, idx: number) => {
      let status: RenderQueueItemStatus = 'UNKNOWN';
      const rawStatus = String(it.status || '').toUpperCase();
      if (
        rawStatus === 'QUEUED' ||
        rawStatus === 'UNQUEUED' ||
        rawStatus === 'DONE' ||
        rawStatus === 'USER_STOPPED' ||
        rawStatus === 'ERR_STOPPED'
      ) {
        status = rawStatus;
      }

      return {
        index: typeof it.index === 'number' ? it.index : idx + 1,
        compositionId: it.compositionId ? String(it.compositionId) : undefined,
        compositionName: it.compositionName ? String(it.compositionName) : undefined,
        status,
        outputFilePath: it.outputFilePath ? String(it.outputFilePath) : undefined,
      };
    });

    return {
      source: 'APPLICATION_ADAPTER',
      observedAt: now,
      status: 'ACTIVE_PROJECT',
      items,
      isTruncated,
      totalItems: typeof rawData.totalItems === 'number' ? rawData.totalItems : items.length,
    };
  }

  /**
   * Invalidates cache for a specific session or all sessions.
   */
  invalidate(sessionId?: string): void {
    if (sessionId) {
      this.cache.delete(`ae_rq_${sessionId}`);
    } else {
      this.invalidateAll();
    }
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  getCacheStats(): { hitCount: number; missCount: number; size: number } {
    return {
      hitCount: this.hitCount,
      missCount: this.missCount,
      size: this.cache.size,
    };
  }
}

export const AdobeRenderQueueInspector = new AdobeRenderQueueInspectorImpl(2000);
