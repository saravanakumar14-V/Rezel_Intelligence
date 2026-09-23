/**
 * Rezel 13.2.3 — Operation Compilation Cache
 *
 * Provides a lightweight, bounded cache for compiled operation plans.
 * Keyed by: operationId + appId + profileVersion + normalizedParamsHash + stateHash.
 *
 * Avoids redundant step resolution without retaining stale target references.
 */

import type { CompiledOperationPlan } from './types';
import type { ApplicationRuntimeState } from '../inference/types';

export interface CompilationCacheEntry {
  readonly plan: CompiledOperationPlan;
  readonly cachedAt: number;
}

export interface CompilationCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly activeEntries: number;
}

export class CompilationCache {
  private cache = new Map<string, CompilationCacheEntry>();
  private ttlMs: number;

  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(ttlMs = 5000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Generates a deterministic cache key.
   */
  static buildKey(
    appId: string,
    operationId: string,
    profileVersion?: string,
    params?: Readonly<Record<string, unknown>>,
    runtimeState?: ApplicationRuntimeState
  ): string {
    const paramsStr = params ? JSON.stringify(params, Object.keys(params).sort()) : '{}';
    const stateSummary = runtimeState
      ? Object.keys(runtimeState.activeStates)
          .sort()
          .map((k) => `${k}=${runtimeState.activeStates[k].isTrue}`)
          .join(';')
      : 'no_state';

    return `${appId}:${operationId}:${profileVersion || 'latest'}:${paramsStr}:${stateSummary}`;
  }

  /**
   * Retrieves a cached plan if within TTL.
   */
  get(key: string): CompiledOperationPlan | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    const age = Date.now() - entry.cachedAt;
    if (age > this.ttlMs) {
      this.cache.delete(key);
      this.evictions++;
      this.misses++;
      return undefined;
    }

    this.hits++;
    return entry.plan;
  }

  /**
   * Stores a compiled plan.
   */
  set(key: string, plan: CompiledOperationPlan): void {
    this.cache.set(key, {
      plan,
      cachedAt: Date.now(),
    });
  }

  /**
   * Invalidates entries matching an application or operation.
   */
  invalidate(appId: string, operationId?: string): void {
    const prefix = operationId ? `${appId}:${operationId}:` : `${appId}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        this.evictions++;
      }
    }
  }

  /**
   * Clears all cache entries.
   */
  clear(): void {
    this.evictions += this.cache.size;
    this.cache.clear();
  }

  /**
   * Returns cache stats.
   */
  getStats(): CompilationCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      activeEntries: this.cache.size,
    };
  }

  /**
   * Resets counters for testing.
   */
  reset(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }
}
