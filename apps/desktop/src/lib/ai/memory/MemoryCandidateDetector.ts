/**
 * Rezel 11.7A — Memory Candidate Detector
 *
 * Scans conversation turns and workflow outputs to detect explicit memory requests
 * and durable project/preference facts.
 */

import type { MemoryType, MemoryScope } from './types';

export interface MemoryCandidate {
  readonly type: MemoryType;
  readonly scope: MemoryScope;
  readonly content: string;
  readonly confidence: number;
  readonly isExplicitRemember: boolean;
  readonly isExplicitForget: boolean;
  readonly forgetQuery?: string;
}

export class MemoryCandidateDetector {
  /**
   * Evaluates text content to detect memory candidates.
   */
  static detect(text: string, context: { projectId?: string; workflowId?: string } = {}): MemoryCandidate | null {
    if (!text || text.trim().length === 0) return null;
    const lower = text.toLowerCase().trim();

    // 1. Explicit Forget Command
    if (lower.startsWith('forget that') || lower.startsWith('forget my preference') || lower.startsWith('forget ')) {
      const forgetQuery = text.replace(/^forget (that|my preference|all about)?\s*/i, '').trim();
      return {
        type: 'USER_PREFERENCE',
        scope: context.projectId ? 'PROJECT' : 'GLOBAL',
        content: forgetQuery,
        confidence: 1.0,
        isExplicitRemember: false,
        isExplicitForget: true,
        forgetQuery,
      };
    }

    // 2. Explicit Remember Command
    if (lower.startsWith('remember that') || lower.startsWith('remember:')) {
      const content = text.replace(/^remember\s*(that|:)?\s*/i, '').trim();
      return {
        type: 'USER_PREFERENCE',
        scope: context.projectId ? 'PROJECT' : 'GLOBAL',
        content,
        confidence: 0.98,
        isExplicitRemember: true,
        isExplicitForget: false,
      };
    }

    // 3. Project / Technical Decisions
    if (lower.includes('decision:') || lower.includes('we decided to') || lower.includes('architecture requires')) {
      return {
        type: 'DECISION',
        scope: context.projectId ? 'PROJECT' : 'GLOBAL',
        content: text.trim(),
        confidence: 0.92,
        isExplicitRemember: false,
        isExplicitForget: false,
      };
    }

    // 4. User Preference heuristics
    if (lower.includes('i prefer ') || lower.includes('my preference is ')) {
      return {
        type: 'USER_PREFERENCE',
        scope: 'GLOBAL',
        content: text.trim(),
        confidence: 0.90,
        isExplicitRemember: false,
        isExplicitForget: false,
      };
    }

    return null;
  }
}
