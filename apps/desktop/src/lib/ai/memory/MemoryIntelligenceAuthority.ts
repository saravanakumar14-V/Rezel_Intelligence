import { GovernedMemoryStore } from './GovernedMemoryStore';
import { GovernedMemoryRetriever } from './GovernedMemoryRetriever';
import { ProjectContextManager } from './project/ProjectContextManager';
import { KnowledgeIngestionManager } from '../knowledge/KnowledgeIngestionManager';
import type { GovernedMemoryEntry, MemoryQuery, MemoryType } from './types';
import type { KnowledgeSearchResult } from '../knowledge/types';

export interface UnifiedMemoryContext {
  memories: GovernedMemoryEntry[];
  knowledge: KnowledgeSearchResult[];
  activeProject?: string;
  totalResults: number;
}

export class MemoryIntelligenceAuthorityImpl {
  /**
   * Performs unified context-aware memory and knowledge retrieval.
   */
  query(text: string, options: { projectId?: string; limit?: number } = {}): UnifiedMemoryContext {
    const memoryQuery: MemoryQuery = {
      text,
      projectId: options.projectId,
      limit: options.limit || 6,
    };

    const retrievedMemories = GovernedMemoryRetriever.retrieve(memoryQuery);
    const knowledgeResults = KnowledgeIngestionManager.search(text, options.projectId, options.limit || 4);

    let activeProject = options.projectId;
    if (!activeProject) {
      try {
        activeProject = ProjectContextManager.resolveActiveProjectId();
      } catch {
        activeProject = undefined;
      }
    }

    return {
      memories: retrievedMemories.memories,
      knowledge: knowledgeResults,
      activeProject,
      totalResults: retrievedMemories.totalCount + knowledgeResults.length,
    };
  }

  /**
   * Retains an explicit user preference or project fact.
   */
  remember(content: string, options: { type?: MemoryType; projectId?: string; tags?: string[] } = {}): GovernedMemoryEntry {
    return GovernedMemoryStore.create({
      content,
      type: options.type || 'USER_PREFERENCE',
      scope: options.projectId ? 'PROJECT' : 'GLOBAL',
      projectId: options.projectId,
      source: 'USER',
      sensitivity: 'NORMAL',
      tags: options.tags,
    });
  }

  /**
   * Forgets a specific memory or forgets all memories for a project.
   */
  forget(memoryId: string): boolean {
    return GovernedMemoryStore.delete(memoryId);
  }

  /**
   * Forgets all memory and project context associated with a project.
   */
  forgetProject(projectId: string): number {
    const count = GovernedMemoryStore.forgetScope('PROJECT', projectId);
    try {
      ProjectContextManager.deleteProject(projectId);
    } catch {
      // Ignore if not in manager
    }
    return count;
  }
}

export const MemoryIntelligenceAuthority = new MemoryIntelligenceAuthorityImpl();
