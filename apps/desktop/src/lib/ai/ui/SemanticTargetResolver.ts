/**
 * Rezel 13.1 — Semantic Target Resolver
 *
 * Resolves requested semantic target descriptions to specific live Windows UIA elements:
 * - Deterministic scoring based on accessible names, text content, roles, and automation IDs
 * - Explicit AMBIGUOUS status when multiple candidates match closely
 * - Zero pixel coordinate reliance during resolution
 * - Fast query path over live UIUnderstandingEngine inspection states
 */

import type { UIElement, UIWindow, UIAnalysisResult } from './types';
import { UIUnderstandingEngine } from './UIUnderstandingEngine';

export interface SemanticResolutionQuery {
  readonly applicationId?: string;
  readonly windowId?: string;
  readonly processId?: number;
  readonly targetDescription: string;
  readonly roleHint?: string;
  readonly expectedType?: string;
}

export type TargetResolutionStatus = 'RESOLVED' | 'AMBIGUOUS' | 'NOT_FOUND';

export interface SemanticResolutionResult {
  readonly status: TargetResolutionStatus;
  readonly element?: UIElement;
  readonly window?: UIWindow;
  readonly confidence: number;
  readonly candidateMatches?: Array<{ element: UIElement; score: number }>;
  readonly reason?: string;
}

export class SemanticTargetResolverImpl {
  /**
   * Resolves a semantic target description to a concrete UIElement.
   */
  async resolveTarget(
    query: SemanticResolutionQuery,
    uiState?: UIAnalysisResult
  ): Promise<SemanticResolutionResult> {
    if (!query || !query.targetDescription.trim()) {
      return {
        status: 'NOT_FOUND',
        confidence: 0,
        reason: 'Empty semantic target description provided',
      };
    }

    const state = uiState || (await UIUnderstandingEngine.inspectNativeUI({
      applicationId: query.applicationId,
      windowId: query.windowId,
      processId: query.processId,
    }));

    if (!state.elements || state.elements.length === 0) {
      return {
        status: 'NOT_FOUND',
        confidence: 0,
        reason: 'No UI elements discovered for the specified window/application',
      };
    }

    const targetDesc = query.targetDescription.toLowerCase().trim();
    const roleHint = query.roleHint?.toLowerCase();
    const typeHint = query.expectedType?.toUpperCase();

    // Filter elements in the target window if specified
    const candidates = state.elements.filter((el) => {
      if (query.windowId && el.windowId && el.windowId !== query.windowId) return false;
      if (query.processId && el.processId && el.processId !== query.processId) return false;
      return true;
    });

    const scored: Array<{ element: UIElement; score: number }> = [];

    for (const el of candidates) {
      let score = 0;
      const label = (el.label || '').toLowerCase();
      const text = (el.text || '').toLowerCase();
      const autoId = (el.automationId || '').toLowerCase();
      const role = (el.role || '').toLowerCase();
      const type = (el.type || '').toUpperCase();

      // 1. Exact matches
      if (label === targetDesc || text === targetDesc || autoId === targetDesc) {
        score += 1.0;
      } else if (label.includes(targetDesc) || text.includes(targetDesc)) {
        // Substring match
        score += 0.8;
      } else {
        // Word token overlap
        const queryTokens = targetDesc.split(/\s+/).filter(Boolean);
        const elTextTokens = `${label} ${text} ${autoId}`.split(/\s+/).filter(Boolean);
        const matchCount = queryTokens.filter((tok) => elTextTokens.some((et) => et.includes(tok))).length;
        if (matchCount > 0) {
          score += (matchCount / queryTokens.length) * 0.65;
        }
      }

      // 2. Role / Type Hint Bonus
      if (roleHint && role.includes(roleHint)) {
        score += 0.15;
      }
      if (typeHint && type === typeHint) {
        score += 0.15;
      }

      // 3. State bonus (visible and enabled elements are preferred)
      if (el.visible !== false) score += 0.05;
      if (el.enabled !== false) score += 0.05;

      if (score >= 0.5) {
        scored.push({ element: el, score: Math.min(score, 1.0) });
      }
    }

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return {
        status: 'NOT_FOUND',
        confidence: 0,
        reason: `No UI element matched semantic target '${query.targetDescription}'`,
      };
    }

    const top = scored[0];

    // Ambiguity Check: If second match is within 0.08 and above 0.75 threshold
    if (scored.length > 1) {
      const second = scored[1];
      if (second.score >= 0.75 && top.score - second.score < 0.08) {
        return {
          status: 'AMBIGUOUS',
          confidence: top.score,
          candidateMatches: scored.slice(0, 5),
          reason: `Multiple elements matched '${query.targetDescription}' with close confidence (${top.score.toFixed(2)} vs ${second.score.toFixed(2)})`,
        };
      }
    }

    const matchedWindow = state.windows.find(
      (w) => w.windowId === top.element.windowId || (top.element.handle && w.handle === top.element.handle)
    );

    return {
      status: 'RESOLVED',
      element: top.element,
      window: matchedWindow,
      confidence: top.score,
      candidateMatches: scored.slice(0, 3),
    };
  }
}

export const SemanticTargetResolver = new SemanticTargetResolverImpl();
