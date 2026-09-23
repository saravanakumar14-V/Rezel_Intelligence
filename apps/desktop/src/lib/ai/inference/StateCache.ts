/**
 * Rezel 13.2.2 — Application Runtime State Cache
 *
 * Bounded, per-session cache maintaining only [current, previous] state snapshots.
 * Provides TTL-based freshness validation and targeted mutation-based invalidation.
 * Strictly avoids unbounded memory growth or persistent user memory leakage.
 */

import type { ApplicationRuntimeState, StateMutationType } from './types';

export interface CacheEntry {
  current: ApplicationRuntimeState;
  previous?: ApplicationRuntimeState;
  cachedAt: number;
}

export interface StateCacheStats {
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly activeEntries: number;
}

export class StateCache {
  private cache = new Map<string, CacheEntry>();
  private ttlMs: number;

  private hits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(ttlMs = 2000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Sets custom TTL in milliseconds.
   */
  setTTL(ttlMs: number): void {
    this.ttlMs = Math.max(100, ttlMs);
  }

  /**
   * Retrieves the current cached state if within TTL and not expired.
   */
  get(key: string): ApplicationRuntimeState | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    const age = Date.now() - entry.cachedAt;
    if (age > this.ttlMs) {
      // Expired
      this.cache.delete(key);
      this.evictions++;
      this.misses++;
      return undefined;
    }

    this.hits++;
    return {
      ...entry.current,
      isCached: true,
    };
  }

  /**
   * Stores a new state snapshot for a key, moving previous current to previous.
   */
  set(key: string, state: ApplicationRuntimeState): void {
    const existing = this.cache.get(key);
    this.cache.set(key, {
      current: state,
      previous: existing?.current,
      cachedAt: Date.now(),
    });
  }

  /**
   * Retrieves previous state snapshot if available.
   */
  getPrevious(key: string): ApplicationRuntimeState | undefined {
    return this.cache.get(key)?.previous;
  }

  /**
   * Explicitly invalidates a specific cache entry.
   */
  invalidate(key: string, _reason?: string): boolean {
    const existed = this.cache.delete(key);
    if (existed) {
      this.evictions++;
    }
    return existed;
  }

  /**
   * Targeted invalidation based on computer action mutation type.
   */
  invalidateByMutation(key: string, mutationType: StateMutationType): boolean {
    if (mutationType === 'FOCUS_ONLY') {
      // Safe: focus action does not alter underlying document, navigation, or application state
      return false;
    }

    // Invalidate the cache for mutating actions
    return this.invalidate(key, `Mutation: ${mutationType}`);
  }

  /**
   * Invalidates all cache entries across all sessions.
   */
  invalidateAll(_reason?: string): void {
    this.evictions += this.cache.size;
    this.cache.clear();
  }

  /**
   * Returns cache telemetry statistics.
   */
  getStats(): StateCacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      activeEntries: this.cache.size,
    };
  }

  /**
   * Clears cache and resets counters (for test isolation).
   */
  reset(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }
}
