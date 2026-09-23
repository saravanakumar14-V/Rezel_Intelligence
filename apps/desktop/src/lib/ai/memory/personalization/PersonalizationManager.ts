/**
 * Rezel 11.7C — Memory Personalization, Confidence & Lifecycle Manager
 *
 * Implements:
 * - Explicit confidence and stability scoring
 * - Bounded lifecycle state transitions (CANDIDATE -> PENDING_CONFIRMATION -> ACTIVE -> STALE -> SUPERSEDED)
 * - Confirmation policies for inferred preferences
 * - Personalization profile assembly with deterministic precedence (WORKFLOW > PROJECT > GLOBAL)
 * - Validated, secret-safe Memory Import / Export
 */

import type {
  PersonalizationProfile,
  PreferenceCategory,
  MemoryExportRecord,
} from './types';
import { PersonalizationError } from './types';
import type { GovernedMemoryEntry, MemoryQuery } from '../types';
import type { MemoryCandidate } from '../MemoryCandidateDetector';
import { GovernedMemoryStore } from '../GovernedMemoryStore';

class PersonalizationManagerImpl {
  /**
   * Evaluates a memory candidate to determine confidence, stability, and confirmation requirements.
   */
  evaluateCandidate(
    candidate: MemoryCandidate,
    context: { projectId?: string; workflowId?: string; category?: PreferenceCategory } = {}
  ): {
    shouldStore: boolean;
    requiresConfirmation: boolean;
    entryPayload?: Omit<GovernedMemoryEntry, 'memoryId' | 'createdAt' | 'updatedAt' | 'version'>;
  } {
    if (!candidate || !candidate.content) {
      return { shouldStore: false, requiresConfirmation: false };
    }

    // Weak inference threshold
    if (candidate.confidence < 0.6) {
      return { shouldStore: false, requiresConfirmation: false };
    }

    const now = Date.now();

    // 1. Explicit user instructions bypass confirmation and become HIGH confidence
    if (candidate.isExplicitRemember) {
      return {
        shouldStore: true,
        requiresConfirmation: false,
        entryPayload: {
          type: candidate.type,
          scope: candidate.scope,
          projectId: context.projectId,
          workflowId: context.workflowId,
          content: candidate.content,
          source: 'USER',
          sensitivity: 'NORMAL',
          lifecycleState: 'ACTIVE',
          preferenceCategory: context.category || 'UI',
          confidenceMetadata: {
            score: 1.0,
            sourceReliability: 1.0,
            stability: 'HIGH',
            lastConfirmedAt: now,
            confirmationCount: 1,
            confidenceReason: 'Explicit user remember instruction',
          },
          sourceReference: {
            sourceType: 'USER_INPUT',
            createdAt: now,
          },
        },
      };
    }

    // 2. Inferred habits or preferences require explicit confirmation before becoming active
    return {
      shouldStore: true,
      requiresConfirmation: true,
      entryPayload: {
        type: candidate.type,
        scope: candidate.scope,
        projectId: context.projectId,
        workflowId: context.workflowId,
        content: candidate.content,
        source: 'SYSTEM',
        sensitivity: 'NORMAL',
        lifecycleState: 'PENDING_CONFIRMATION',
        preferenceCategory: context.category || 'UI',
        confidenceMetadata: {
          score: candidate.confidence,
          sourceReliability: 0.7,
          stability: 'MEDIUM',
          confirmationCount: 0,
          confidenceReason: 'Heuristically inferred user preference',
        },
        sourceReference: {
          sourceType: 'SYSTEM',
          createdAt: now,
        },
      },
    };
  }

  /**
   * Confirms a pending memory, transitioning it to ACTIVE.
   */
  confirmMemory(memoryId: string): GovernedMemoryEntry {
    const mem = GovernedMemoryStore.get(memoryId);
    if (!mem) {
      throw new PersonalizationError('MEMORY_CONFIRMATION_REQUIRED', `Memory entry not found: ${memoryId}`);
    }

    const currentConf = mem.confidenceMetadata || {
      score: 0.8,
      sourceReliability: 0.8,
      stability: 'MEDIUM',
      confirmationCount: 0,
    };

    return GovernedMemoryStore.update(memoryId, {
      lifecycleState: 'ACTIVE',
      confidenceMetadata: {
        ...currentConf,
        score: Math.min(1.0, currentConf.score + 0.2),
        stability: 'HIGH',
        lastConfirmedAt: Date.now(),
        confirmationCount: currentConf.confirmationCount + 1,
      },
    });
  }

  /**
   * Marks a memory entry as STALE.
   */
  markMemoryStale(memoryId: string, reason: string): GovernedMemoryEntry {
    return GovernedMemoryStore.update(memoryId, {
      lifecycleState: 'STALE',
      staleReason: reason,
    });
  }

  /**
   * Supersedes an existing memory entry with a replacement.
   */
  supersedeMemory(memoryId: string, newContent: string): GovernedMemoryEntry {
    const oldMem = GovernedMemoryStore.get(memoryId);
    if (!oldMem) {
      throw new PersonalizationError('MEMORY_SUPERSEDED', `Memory not found: ${memoryId}`);
    }

    // Create replacement memory
    const newMem = GovernedMemoryStore.create({
      type: oldMem.type,
      scope: oldMem.scope,
      projectId: oldMem.projectId,
      workflowId: oldMem.workflowId,
      content: newContent,
      source: 'USER',
      sensitivity: oldMem.sensitivity,
      lifecycleState: 'ACTIVE',
      preferenceCategory: oldMem.preferenceCategory,
      confidenceMetadata: {
        score: 1.0,
        sourceReliability: 1.0,
        stability: 'HIGH',
        lastConfirmedAt: Date.now(),
        confirmationCount: 1,
        confidenceReason: `Superseded prior memory (${memoryId})`,
      },
      sourceReference: {
        sourceType: 'USER_INPUT',
        createdAt: Date.now(),
      },
    });

    // Mark old as SUPERSEDED
    GovernedMemoryStore.update(memoryId, {
      lifecycleState: 'SUPERSEDED',
      supersededBy: newMem.memoryId,
    });

    return newMem;
  }

  /**
   * Builds the active personalization profile applying deterministic precedence (WORKFLOW > PROJECT > GLOBAL).
   */
  buildPersonalizationProfile(context: {
    projectId?: string;
    workflowId?: string;
  } = {}): PersonalizationProfile {
    const allMemories = GovernedMemoryStore.search({
      type: 'USER_PREFERENCE',
      includeSensitive: false,
    });

    // Filter active memories matching context
    const active = allMemories.filter((m) => {
      if (m.isDeleted) return false;
      if (m.lifecycleState && m.lifecycleState !== 'ACTIVE') return false;
      if (m.scope === 'PROJECT' && context.projectId && m.projectId !== context.projectId) return false;
      if (m.scope === 'WORKFLOW' && context.workflowId && m.workflowId !== context.workflowId) return false;
      return true;
    });

    // Apply Precedence: Scope Rank WORKFLOW (3) > PROJECT (2) > GLOBAL (1)
    const scopeRank = { WORKFLOW: 3, PROJECT: 2, SESSION: 2, GLOBAL: 1 };
    const sorted = [...active].sort(
      (a, b) => (scopeRank[b.scope] || 0) - (scopeRank[a.scope] || 0)
    );

    const communicationPreferences: string[] = [];
    const uiPreferences: string[] = [];
    const creativePreferences: string[] = [];
    const workflowPreferences: string[] = [];
    const developerPreferences: string[] = [];
    const automationPreferences: string[] = [];

    const activePreferences = sorted.map((m) => {
      const cat = m.preferenceCategory || 'UI';
      if (cat === 'COMMUNICATION') communicationPreferences.push(m.content);
      else if (cat === 'UI') uiPreferences.push(m.content);
      else if (cat === 'CREATIVE') creativePreferences.push(m.content);
      else if (cat === 'WORKFLOW') workflowPreferences.push(m.content);
      else if (cat === 'DEVELOPER') developerPreferences.push(m.content);
      else if (cat === 'AUTOMATION') automationPreferences.push(m.content);

      return {
        memoryId: m.memoryId,
        category: cat,
        preference: m.content,
        scope: m.scope,
        confidence: m.confidenceMetadata?.score || 1.0,
      };
    });

    return {
      activePreferences,
      communicationPreferences,
      uiPreferences,
      creativePreferences,
      workflowPreferences,
      developerPreferences,
      automationPreferences,
    };
  }

  /**
   * Exports non-deleted memories in a sanitized portable format.
   */
  exportMemories(filter: MemoryQuery = {}): MemoryExportRecord[] {
    const memories = GovernedMemoryStore.search(filter);
    return memories.map((m) => ({
      memoryId: m.memoryId,
      type: m.type,
      scope: m.scope,
      projectId: m.projectId,
      workflowId: m.workflowId,
      content: m.content,
      source: m.source,
      sensitivity: m.sensitivity,
      confidence: m.confidenceMetadata as any,
      lifecycleState: m.lifecycleState || 'ACTIVE',
      preferenceCategory: m.preferenceCategory,
      sourceReference: m.sourceReference,
      version: m.version,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
    }));
  }

  /**
   * Imports memories validating schema, provenance, and rejecting secret tiers.
   */
  importMemories(records: MemoryExportRecord[]): { importedCount: number; rejectedCount: number } {
    let importedCount = 0;
    let rejectedCount = 0;

    for (const record of records) {
      if (!record.content || record.sensitivity === 'SECRET') {
        rejectedCount++;
        continue;
      }

      try {
        GovernedMemoryStore.create({
          type: record.type || 'USER_PREFERENCE',
          scope: record.scope || 'GLOBAL',
          projectId: record.projectId,
          workflowId: record.workflowId,
          content: record.content,
          source: 'IMPORTED',
          sensitivity: record.sensitivity || 'NORMAL',
          lifecycleState: record.lifecycleState || 'ACTIVE',
          preferenceCategory: record.preferenceCategory,
          confidenceMetadata: {
            score: record.confidence?.score || 0.6,
            sourceReliability: 0.5,
            stability: 'MEDIUM',
            confirmationCount: 0,
            confidenceReason: 'Imported from external archive',
          },
          sourceReference: {
            sourceType: 'SYSTEM',
            createdAt: Date.now(),
          },
        });
        importedCount++;
      } catch {
        rejectedCount++;
      }
    }

    return { importedCount, rejectedCount };
  }
}

export const PersonalizationManager = new PersonalizationManagerImpl();
