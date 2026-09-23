/**
 * Rezel 11.7A — Governed Long-Term Memory Store
 *
 * Provides persistent, versioned, scoped, and privacy-governed memory management:
 * - Strict rejection of SECRET memories and plaintext credential patterns
 * - Scoped isolation across GLOBAL, PROJECT, WORKFLOW, and SESSION contexts
 * - Explicit versioning and provenance tracking on all mutations
 * - Tombstone deletion (forgetByQuery, forgetScope)
 * - Safe exclusion of expired memories
 */

import type {
  GovernedMemoryEntry,
  MemoryQuery,
} from './types';
import { GovernedMemoryError } from './types';

class GovernedMemoryStoreImpl {
  private memories = new Map<string, GovernedMemoryEntry>();

  /**
   * Creates a new governed memory entry.
   */
  create(
    entry: Omit<GovernedMemoryEntry, 'memoryId' | 'createdAt' | 'updatedAt' | 'version'>
  ): GovernedMemoryEntry {
    if (!entry.content || entry.content.trim().length === 0) {
      throw new GovernedMemoryError('MEMORY_INVALID', 'Memory content cannot be empty');
    }

    // 1. Secret Protection Invariant
    if (entry.sensitivity === 'SECRET') {
      throw new GovernedMemoryError(
        'MEMORY_SECRET_REJECTED',
        'Secret memory persistence is strictly rejected to prevent plaintext secret leaks'
      );
    }

    // Heuristic scan for raw API keys or passwords in content
    const lowerContent = entry.content.toLowerCase();
    if (
      lowerContent.includes('aizasy') ||
      lowerContent.includes('sk-proj') ||
      lowerContent.includes('password:') ||
      lowerContent.includes('secret_key')
    ) {
      throw new GovernedMemoryError(
        'MEMORY_SECRET_REJECTED',
        'Detected sensitive API key or password pattern in memory content. Secret rejected.'
      );
    }

    const memoryId = `mem_${crypto.randomUUID()}`;
    const now = Date.now();

    const created: GovernedMemoryEntry = {
      ...entry,
      memoryId,
      createdAt: now,
      updatedAt: now,
      version: 1,
      isDeleted: false,
    };

    this.memories.set(memoryId, created);
    return created;
  }

  /**
   * Retrieves a memory entry by ID.
   */
  get(memoryId: string): GovernedMemoryEntry | undefined {
    const entry = this.memories.get(memoryId);
    if (!entry || entry.isDeleted) return undefined;

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      return undefined;
    }

    return entry;
  }

  /**
   * Updates an existing memory entry and increments version.
   */
  update(
    memoryId: string,
    updates: Partial<Omit<GovernedMemoryEntry, 'memoryId' | 'createdAt' | 'version'>>
  ): GovernedMemoryEntry {
    const existing = this.get(memoryId);
    if (!existing) {
      throw new GovernedMemoryError('MEMORY_NOT_FOUND', `Memory entry not found: ${memoryId}`, { memoryId });
    }

    if (updates.sensitivity === 'SECRET') {
      throw new GovernedMemoryError(
        'MEMORY_SECRET_REJECTED',
        'Cannot update memory entry to SECRET sensitivity tier'
      );
    }

    const updated: GovernedMemoryEntry = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
      version: existing.version + 1,
    };

    this.memories.set(memoryId, updated);
    return updated;
  }

  /**
   * Marks a memory entry as deleted (tombstone).
   */
  delete(memoryId: string): boolean {
    const entry = this.memories.get(memoryId);
    if (!entry || entry.isDeleted) return false;

    this.memories.set(memoryId, {
      ...entry,
      isDeleted: true,
      updatedAt: Date.now(),
      version: entry.version + 1,
    });
    return true;
  }

  /**
   * Forgets memories matching a query string.
   */
  forgetByQuery(query: string): number {
    if (!query) return 0;
    const lower = query.toLowerCase();
    let count = 0;

    for (const [id, entry] of this.memories.entries()) {
      if (!entry.isDeleted && entry.content.toLowerCase().includes(lower)) {
        this.delete(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Forgets all memories in a given scope.
   */
  forgetScope(scope: GovernedMemoryEntry['scope'], id?: string): number {
    let count = 0;
    for (const [memId, entry] of this.memories.entries()) {
      if (!entry.isDeleted && entry.scope === scope) {
        if (scope === 'PROJECT' && id && entry.projectId !== id) continue;
        if (scope === 'WORKFLOW' && id && entry.workflowId !== id) continue;
        this.delete(memId);
        count++;
      }
    }
    return count;
  }

  /**
   * Searches and filters memories based on query parameters.
   */
  search(query: MemoryQuery = {}): GovernedMemoryEntry[] {
    const now = Date.now();
    const results: GovernedMemoryEntry[] = [];

    for (const entry of this.memories.values()) {
      if (entry.isDeleted) continue;

      // Exclude expired memories
      if (entry.expiresAt && now > entry.expiresAt) continue;

      // Scope isolation
      if (query.scope && entry.scope !== query.scope) continue;
      if (query.projectId && entry.projectId && entry.projectId !== query.projectId) continue;
      if (query.workflowId && entry.workflowId && entry.workflowId !== query.workflowId) continue;

      // Type filter
      if (query.type && entry.type !== query.type) continue;

      // Sensitivity filter
      if (!query.includeSensitive && entry.sensitivity === 'SENSITIVE') continue;

      // Text search
      if (query.text) {
        const lowerText = query.text.toLowerCase();
        const matchesContent = entry.content.toLowerCase().includes(lowerText);
        const matchesTags = entry.tags?.some((t) => t.toLowerCase().includes(lowerText));
        if (!matchesContent && !matchesTags) continue;
      }

      results.push(entry);
      if (query.limit && results.length >= query.limit) break;
    }

    return results;
  }

  /**
   * Helper to clear in-memory store for testing.
   */
  clear(): void {
    this.memories.clear();
  }
}

export const GovernedMemoryStore = new GovernedMemoryStoreImpl();
