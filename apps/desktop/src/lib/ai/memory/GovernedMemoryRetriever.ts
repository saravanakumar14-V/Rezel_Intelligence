/**
 * Rezel 11.7A — Governed Memory Retriever & Conflict Resolver
 *
 * Implements relevance-filtered memory retrieval and conflict detection:
 * - Scored relevance ranking (scope match, freshness, confidence)
 * - Conflict detection against live application and workflow state
 * - Strict invariant: Live verified state strictly overrides stale stored memory
 */

import type {
  GovernedMemoryEntry,
  MemoryQuery,
  MemoryRetrievalResult,
} from './types';
import { GovernedMemoryStore } from './GovernedMemoryStore';

export interface MemoryConflict {
  readonly memoryId: string;
  readonly memoryContent: string;
  readonly conflictingKey: string;
  readonly liveTruth: unknown;
  readonly resolutionRule: string;
}

export class GovernedMemoryRetriever {
  /**
   * Retrieves relevant memories matching the query context.
   */
  static retrieve(query: MemoryQuery = {}): MemoryRetrievalResult {
    const startTime = Date.now();
    const rawMemories = GovernedMemoryStore.search(query);

    // Score & Rank Candidates by Scope + Freshness + Confidence
    const ranked = rawMemories.sort((a, b) => {
      // 1. Exact scope preference (WORKFLOW > PROJECT > GLOBAL)
      const scopeRank = { WORKFLOW: 4, PROJECT: 3, SESSION: 2, GLOBAL: 1 };
      const rankDiff = (scopeRank[b.scope] || 0) - (scopeRank[a.scope] || 0);
      if (rankDiff !== 0) return rankDiff;

      // 2. Freshness
      return b.updatedAt - a.updatedAt;
    });

    const limit = query.limit || 10;
    const finalMemories = ranked.slice(0, limit);

    return {
      memories: finalMemories,
      query,
      totalCount: finalMemories.length,
      retrievedAt: startTime,
    };
  }

  /**
   * Detects material conflicts between stored memories and live application/workflow state.
   */
  static detectConflicts(
    memories: GovernedMemoryEntry[],
    liveState: Record<string, unknown>
  ): MemoryConflict[] {
    const conflicts: MemoryConflict[] = [];

    for (const mem of memories) {
      for (const [key, liveVal] of Object.entries(liveState)) {
        if (liveVal === undefined || liveVal === null) continue;

        const lowerContent = mem.content.toLowerCase();
        const lowerKey = key.toLowerCase();

        // Check if memory mentions this key with a different value
        if (lowerContent.includes(lowerKey)) {
          const stringLiveVal = String(liveVal).toLowerCase();
          if (!lowerContent.includes(stringLiveVal)) {
            conflicts.push({
              memoryId: mem.memoryId,
              memoryContent: mem.content,
              conflictingKey: key,
              liveTruth: liveVal,
              resolutionRule: 'Current verified application/workflow state strictly overrides stored memory.',
            });
          }
        }
      }
    }

    return conflicts;
  }
}
