/**
 * Rezel 13.2.2 — State Conflict Resolver
 *
 * Enforces a deterministic, multi-tier authority hierarchy when resolving contradictory
 * evidence between Application-Native Adapters, OS/UIA structural evidence, and Profile Predicates.
 *
 * Tier Precedence:
 *   Tier 1: APPLICATION_ADAPTER (Application internal RPC/IPC state)
 *   Tier 2: WINDOW / UIA (Direct OS & UI Automation structure)
 *   Tier 3: PROFILE_MATCHER (Heuristic predicate evaluation)
 */

import type {
  InferredState,
  InferredValue,
  StateEvidence,
  StateEvidenceSource,
  TriStateBoolean,
  ConfidenceLevel,
  ActivityState,
  ModalState,
} from './types';

export class ConflictResolver {
  /**
   * Returns numeric tier priority for an evidence source (lower number = higher authority).
   */
  static getTier(source: StateEvidenceSource): number {
    switch (source) {
      case 'APPLICATION_ADAPTER':
        return 1;
      case 'WINDOW':
      case 'UIA':
        return 2;
      case 'PROFILE_MATCHER':
      default:
        return 3;
    }
  }

  /**
   * Resolves conflicting boolean state candidates for a specific stateId.
   */
  static resolveState(
    stateId: string,
    candidates: Array<{ isTrue: TriStateBoolean; confidence: ConfidenceLevel; evidence: StateEvidence }>
  ): InferredState {
    if (candidates.length === 0) {
      return {
        stateId,
        isTrue: 'UNKNOWN',
        confidence: 'LOW',
        evidence: [
          {
            stateId,
            source: 'PROFILE_MATCHER',
            description: `No evidence observed for state '${stateId}'`,
            confidence: 'LOW',
            observedAt: Date.now(),
          },
        ],
      };
    }

    if (candidates.length === 1) {
      return {
        stateId,
        isTrue: candidates[0].isTrue,
        confidence: candidates[0].confidence,
        evidence: [candidates[0].evidence],
      };
    }

    // Separate by truth value
    const trueCandidates = candidates.filter((c) => c.isTrue === 'TRUE');
    const falseCandidates = candidates.filter((c) => c.isTrue === 'FALSE');
    const unknownCandidates = candidates.filter((c) => c.isTrue === 'UNKNOWN');

    // Case 1: All agree on TRUE or FALSE
    if (trueCandidates.length > 0 && falseCandidates.length === 0) {
      const best = this.pickHighestTier(trueCandidates);
      return {
        stateId,
        isTrue: 'TRUE',
        confidence: best.confidence,
        evidence: candidates.map((c) => c.evidence),
      };
    }

    if (falseCandidates.length > 0 && trueCandidates.length === 0) {
      const best = this.pickHighestTier(falseCandidates);
      return {
        stateId,
        isTrue: 'FALSE',
        confidence: best.confidence,
        evidence: candidates.map((c) => c.evidence),
      };
    }

    if (trueCandidates.length === 0 && falseCandidates.length === 0) {
      return {
        stateId,
        isTrue: 'UNKNOWN',
        confidence: 'LOW',
        evidence: unknownCandidates.map((c) => c.evidence),
      };
    }

    // Case 2: Contradiction between TRUE and FALSE candidates
    const bestTrue = this.pickHighestTier(trueCandidates);
    const bestFalse = this.pickHighestTier(falseCandidates);

    const tierTrue = this.getTier(bestTrue.evidence.source);
    const tierFalse = this.getTier(bestFalse.evidence.source);

    if (tierTrue < tierFalse) {
      // TRUE has higher tier authority (e.g. Adapter over UIA)
      return {
        stateId,
        isTrue: 'TRUE',
        confidence: bestTrue.confidence,
        evidence: candidates.map((c) => c.evidence),
      };
    }

    if (tierFalse < tierTrue) {
      // FALSE has higher tier authority
      return {
        stateId,
        isTrue: 'FALSE',
        confidence: bestFalse.confidence,
        evidence: candidates.map((c) => c.evidence),
      };
    }

    // Equal tier conflict (e.g. UIA vs WINDOW, or multiple matchers in disagreement)
    // Must NOT silently pick one; degrade to UNKNOWN with LOW confidence
    const conflictEvidence: StateEvidence = {
      stateId,
      source: bestTrue.evidence.source,
      description: `Conflict between ${bestTrue.evidence.source} (${bestTrue.isTrue}) and ${bestFalse.evidence.source} (${bestFalse.isTrue})`,
      confidence: 'LOW',
      observedAt: Date.now(),
      details: {
        conflict: true,
        trueSources: trueCandidates.map((c) => c.evidence.source),
        falseSources: falseCandidates.map((c) => c.evidence.source),
      },
    };

    return {
      stateId,
      isTrue: 'UNKNOWN',
      confidence: 'LOW',
      evidence: [...candidates.map((c) => c.evidence), conflictEvidence],
    };
  }

  /**
   * Resolves Activity state dimension (IDLE, BUSY, LOADING, RENDERING, UNKNOWN).
   */
  static resolveActivity(
    adapterActivity?: ActivityState,
    adapterEvidence?: StateEvidence,
    uiaActivity?: ActivityState,
    uiaEvidence?: StateEvidence
  ): InferredValue<ActivityState> {
    const evidenceList: StateEvidence[] = [];
    if (adapterEvidence) evidenceList.push(adapterEvidence);
    if (uiaEvidence) evidenceList.push(uiaEvidence);

    // Tier 1: Adapter authority
    if (adapterActivity && adapterActivity !== 'UNKNOWN') {
      return {
        value: adapterActivity,
        confidence: 'HIGH',
        evidence: evidenceList,
      };
    }

    // Tier 2: UIA evidence
    if (uiaActivity && uiaActivity !== 'UNKNOWN') {
      return {
        value: uiaActivity,
        confidence: 'MEDIUM',
        evidence: evidenceList,
      };
    }

    return {
      value: 'UNKNOWN',
      confidence: 'LOW',
      evidence: evidenceList.length > 0
        ? evidenceList
        : [
            {
              source: 'PROFILE_MATCHER',
              description: 'No activity evidence available',
              confidence: 'LOW',
              observedAt: Date.now(),
            },
          ],
    };
  }

  /**
   * Resolves Modal state dimension (NONE, MODAL, UNKNOWN).
   */
  static resolveModalState(
    hasModalDialog: boolean,
    hasUIAObservation: boolean,
    uiaModalEvidence?: StateEvidence,
    adapterModal?: boolean,
    adapterEvidence?: StateEvidence
  ): InferredValue<ModalState> {
    const evidenceList: StateEvidence[] = [];
    if (adapterEvidence) evidenceList.push(adapterEvidence);
    if (uiaModalEvidence) evidenceList.push(uiaModalEvidence);

    // Tier 2 OS/UIA structural evidence for modal dialogs is authoritative
    if (hasModalDialog) {
      return {
        value: 'MODAL',
        confidence: 'HIGH',
        evidence: evidenceList,
      };
    }

    if (adapterModal !== undefined) {
      return {
        value: adapterModal ? 'MODAL' : 'NONE',
        confidence: 'HIGH',
        evidence: evidenceList,
      };
    }

    if (hasUIAObservation) {
      return {
        value: 'NONE',
        confidence: 'HIGH',
        evidence: [
          {
            source: 'UIA',
            description: 'No modal dialogs or blocked parent windows observed in active UI tree',
            confidence: 'HIGH',
            observedAt: Date.now(),
          },
        ],
      };
    }

    return {
      value: 'UNKNOWN',
      confidence: 'LOW',
      evidence: [
        {
          source: 'UIA',
          description: 'Modal state could not be conclusively determined (no UIA tree observed)',
          confidence: 'LOW',
          observedAt: Date.now(),
        },
      ],
    };
  }

  private static pickHighestTier<T extends { evidence: StateEvidence; confidence: ConfidenceLevel }>(
    items: T[]
  ): T {
    let best = items[0];
    let bestTier = this.getTier(best.evidence.source);

    for (let i = 1; i < items.length; i++) {
      const tier = this.getTier(items[i].evidence.source);
      if (tier < bestTier) {
        best = items[i];
        bestTier = tier;
      }
    }

    return best;
  }
}
