/**
 * Rezel 13.2.4 — Operation Selection Engine
 *
 * Deterministically selects a registered OperationDefinition from the target ApplicationProfile
 * strictly following declarative precedence:
 * 1. Exact operation ID
 * 2. Explicit operation alias
 * 3. Exact normalized name
 * 4. Semantic description match
 *
 * Strict Ambiguity Policy:
 * - If multiple candidates share the highest match tier -> AMBIGUOUS_OPERATION
 * - If no candidates match -> OPERATION_UNAVAILABLE
 * - Never invents operations or synthesizes arbitrary actions outside profile.operations.
 */

import type { ApplicationProfile, OperationDefinition } from '../../profiles/types';
import type { PlannerFailureCode } from './types';

export interface OperationSelectionSuccess {
  readonly success: true;
  readonly operation: OperationDefinition;
  readonly matchTier: 'EXACT_ID' | 'EXPLICIT_ALIAS' | 'NORMALIZED_NAME' | 'DESCRIPTION_MATCH';
  readonly score: number;
}

export interface OperationSelectionFailure {
  readonly success: false;
  readonly failureCode: PlannerFailureCode;
  readonly reason: string;
  readonly candidateOperationIds?: readonly string[];
}

export type OperationSelectionResult =
  | OperationSelectionSuccess
  | OperationSelectionFailure;

interface ScoredCandidate {
  operation: OperationDefinition;
  score: number;
  matchTier: 'EXACT_ID' | 'EXPLICIT_ALIAS' | 'NORMALIZED_NAME' | 'DESCRIPTION_MATCH';
}

export class OperationSelectionEngine {
  /**
   * Selects an operation from profile.operations matching the given query string.
   */
  static selectOperation(
    query: string,
    profile: ApplicationProfile
  ): OperationSelectionResult {
    const raw = query.trim().toLowerCase();
    if (!raw) {
      return {
        success: false,
        failureCode: 'OPERATION_UNAVAILABLE',
        reason: 'Operation query is empty',
      };
    }

    const operations = Object.values(profile.operations);
    if (operations.length === 0) {
      return {
        success: false,
        failureCode: 'OPERATION_UNAVAILABLE',
        reason: `Application '${profile.name}' (${profile.appId}) declares 0 registered operations`,
      };
    }

    const scored: ScoredCandidate[] = [];

    for (const op of operations) {
      const opIdLower = op.id.toLowerCase();
      const normalizedOpName = op.id.replace(/_/g, ' ').toLowerCase();
      const descLower = op.description.toLowerCase();

      // ─── TIER 1: Exact Operation ID ─────────────────────────────────────────
      if (raw === opIdLower) {
        scored.push({ operation: op, score: 100, matchTier: 'EXACT_ID' });
        continue;
      }

      // ─── TIER 2: Explicit Operation Alias ───────────────────────────────────
      if (op.aliases && op.aliases.length > 0) {
        let matchedAlias = false;
        for (const alias of op.aliases) {
          const aliasLower = alias.toLowerCase();
          if (raw === aliasLower) {
            scored.push({ operation: op, score: 95, matchTier: 'EXPLICIT_ALIAS' });
            matchedAlias = true;
            break;
          } else if (raw.includes(aliasLower) || aliasLower.includes(raw)) {
            scored.push({ operation: op, score: 90, matchTier: 'EXPLICIT_ALIAS' });
            matchedAlias = true;
            break;
          }
        }
        if (matchedAlias) continue;
      }

      // ─── TIER 3: Exact Normalized Name ──────────────────────────────────────
      if (raw === normalizedOpName || raw.includes(normalizedOpName) || normalizedOpName.includes(raw)) {
        scored.push({ operation: op, score: 80, matchTier: 'NORMALIZED_NAME' });
        continue;
      }

      // ─── TIER 4: Description / Semantic Match ───────────────────────────────
      const queryTokens = raw.split(/\s+/).filter((t) => t.length > 2);
      let matchedTokens = 0;
      for (const token of queryTokens) {
        if (descLower.includes(token) || opIdLower.includes(token)) {
          matchedTokens++;
        }
      }

      if (queryTokens.length > 0 && matchedTokens > 0) {
        const ratio = matchedTokens / queryTokens.length;
        if (ratio >= 0.5) {
          scored.push({
            operation: op,
            score: Math.round(40 + ratio * 30),
            matchTier: 'DESCRIPTION_MATCH',
          });
        }
      }
    }

    if (scored.length === 0) {
      const available = operations.map((o) => o.id).join(', ');
      return {
        success: false,
        failureCode: 'OPERATION_UNAVAILABLE',
        reason: `No registered operation in '${profile.name}' matches query '${query}'. Available operations: [${available}]`,
      };
    }

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    const topScore = scored[0].score;
    const topCandidates = scored.filter((s) => s.score === topScore);

    // Check for ambiguity among equal top scores
    if (topCandidates.length > 1) {
      const candidateIds = topCandidates.map((c) => c.operation.id);
      return {
        success: false,
        failureCode: 'AMBIGUOUS_OPERATION',
        reason: `Multiple operations in '${profile.name}' matched query '${query}' with equal score (${topScore}): [${candidateIds.join(', ')}]`,
        candidateOperationIds: candidateIds,
      };
    }

    return {
      success: true,
      operation: topCandidates[0].operation,
      matchTier: topCandidates[0].matchTier,
      score: topCandidates[0].score,
    };
  }
}
