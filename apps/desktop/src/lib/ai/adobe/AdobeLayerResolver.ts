/**
 * REZEL 13.3.3 — Adobe Layer Resolver
 *
 * Deterministically resolves semantic layer targets from an AdobeProjectSnapshot
 * using strict identity precedence and tri-state application runtime state checks.
 *
 * RESOLUTION PRECEDENCE:
 * 1. Native stable layer ID (exact match)
 * 2. Explicit composition ID + layer name
 * 3. Active composition + exact layer name
 * 4. Active composition + exact name + layer type
 *
 * CRITICAL INVARIANTS:
 * - Never use volatile array index as persistent semantic identity.
 * - If multiple matching layers exist with identical criteria -> AMBIGUOUS_TARGET.
 * - Active composition state must be verified (ACTIVE_COMPOSITION === TRUE).
 * - If active composition is FALSE -> PRECONDITION_FAILED.
 * - If active composition is UNKNOWN -> UNKNOWN_APPLICATION_STATE.
 * - If adapter disconnected -> ADAPTER_DISCONNECTED.
 */

import type {
  AdobeLayerType,
  AdobeProjectSnapshot,
  CompositionSnapshot,
} from './types';

export type LayerResolverStatus =
  | 'SUCCESS'
  | 'TARGET_NOT_FOUND'
  | 'AMBIGUOUS_TARGET'
  | 'UNKNOWN_APPLICATION_STATE'
  | 'PRECONDITION_FAILED'
  | 'ADAPTER_DISCONNECTED';

export interface LayerResolutionQuery {
  readonly layerId?: string;
  readonly layerName?: string;
  readonly compositionId?: string;
  readonly layerType?: AdobeLayerType;
}

export interface LayerTarget {
  readonly id: string;
  readonly name: string;
  readonly type: AdobeLayerType;
  readonly compositionId: string;
  readonly compositionName: string;
  readonly currentIndex: number;
  readonly isVisible?: boolean;
  readonly isLocked?: boolean;
}

export interface LayerResolutionResult {
  readonly status: LayerResolverStatus;
  readonly target?: LayerTarget;
  readonly matches?: readonly LayerTarget[];
  readonly error?: string;
  readonly reason?: string;
}

export class AdobeLayerResolver {
  /**
   * Resolves a unique LayerTarget from the provided AdobeProjectSnapshot.
   */
  static resolve(
    snapshot: AdobeProjectSnapshot | undefined,
    query: LayerResolutionQuery
  ): LayerResolutionResult {
    // 1. Snapshot presence check
    if (!snapshot) {
      return {
        status: 'UNKNOWN_APPLICATION_STATE',
        reason: 'Adobe project snapshot is unavailable',
        error: 'Snapshot unavailable',
      };
    }

    // 2. Adapter Disconnected check
    if (snapshot.status === 'ADAPTER_DISCONNECTED') {
      return {
        status: 'ADAPTER_DISCONNECTED',
        reason: 'After Effects adapter is disconnected',
        error: 'Adapter disconnected',
      };
    }

    // 3. Unknown application state check
    if (snapshot.status === 'UNKNOWN') {
      return {
        status: 'UNKNOWN_APPLICATION_STATE',
        reason: 'After Effects project state is UNKNOWN',
        error: 'Unknown application state',
      };
    }

    // 4. Project Closed / No Composition check
    if (snapshot.status === 'PROJECT_CLOSED') {
      return {
        status: 'PRECONDITION_FAILED',
        reason: 'No After Effects project is currently open (PROJECT_CLOSED)',
        error: 'Project closed',
      };
    }

    // 5. Target composition determination
    let targetComp: CompositionSnapshot | undefined = undefined;

    if (query.compositionId) {
      targetComp = snapshot.compositions.find(
        (c) => c.id === query.compositionId || c.name === query.compositionId
      );
      if (!targetComp) {
        return {
          status: 'TARGET_NOT_FOUND',
          reason: `Target composition '${query.compositionId}' was not found in project`,
          error: 'Composition not found',
        };
      }
    } else {
      // Must have an active composition
      if (snapshot.status === 'NO_ACTIVE_COMPOSITION' || !snapshot.activeCompositionId) {
        return {
          status: 'PRECONDITION_FAILED',
          reason: 'No active composition found in After Effects project',
          error: 'No active composition',
        };
      }

      targetComp = snapshot.compositions.find(
        (c) => c.id === snapshot.activeCompositionId
      );

      if (!targetComp) {
        return {
          status: 'PRECONDITION_FAILED',
          reason: `Active composition '${snapshot.activeCompositionId}' is not loaded in project snapshot`,
          error: 'Active composition missing',
        };
      }
    }

    // 6. Precedence 1: Native Stable Layer ID
    if (query.layerId) {
      const match = targetComp.layers.find((l) => l.id === query.layerId);
      if (match) {
        return {
          status: 'SUCCESS',
          target: {
            id: match.id,
            name: match.name,
            type: match.type,
            compositionId: targetComp.id,
            compositionName: targetComp.name,
            currentIndex: match.index,
            isVisible: match.isVisible,
            isLocked: match.isLocked,
          },
        };
      }

      // Also search all compositions if layerId is globally unique
      for (const comp of snapshot.compositions) {
        const compMatch = comp.layers.find((l) => l.id === query.layerId);
        if (compMatch) {
          return {
            status: 'SUCCESS',
            target: {
              id: compMatch.id,
              name: compMatch.name,
              type: compMatch.type,
              compositionId: comp.id,
              compositionName: comp.name,
              currentIndex: compMatch.index,
              isVisible: compMatch.isVisible,
              isLocked: compMatch.isLocked,
            },
          };
        }
      }

      return {
        status: 'TARGET_NOT_FOUND',
        reason: `Layer with native ID '${query.layerId}' was not found`,
        error: 'Layer ID not found',
      };
    }

    // 7. Precedence 2 & 3: Match by exact layerName (and optional layerType) within target composition
    if (query.layerName) {
      let matches = targetComp.layers.filter((l) => l.name === query.layerName);

      // Precedence 4: If multiple matches and layerType specified, filter by type
      if (matches.length > 1 && query.layerType) {
        const typeFiltered = matches.filter((l) => l.type === query.layerType);
        if (typeFiltered.length > 0) {
          matches = typeFiltered;
        }
      }

      if (matches.length === 0) {
        return {
          status: 'TARGET_NOT_FOUND',
          reason: `No layer named '${query.layerName}' found in composition '${targetComp.name}'`,
          error: 'Layer name not found',
        };
      }

      if (matches.length > 1) {
        const mappedMatches: LayerTarget[] = matches.map((m) => ({
          id: m.id,
          name: m.name,
          type: m.type,
          compositionId: targetComp!.id,
          compositionName: targetComp!.name,
          currentIndex: m.index,
          isVisible: m.isVisible,
          isLocked: m.isLocked,
        }));

        return {
          status: 'AMBIGUOUS_TARGET',
          matches: mappedMatches,
          reason: `Found ${matches.length} layers matching name '${query.layerName}' in composition '${targetComp.name}'. Specific layer ID or discrimination required.`,
          error: 'Ambiguous target layers',
        };
      }

      const match = matches[0];
      return {
        status: 'SUCCESS',
        target: {
          id: match.id,
          name: match.name,
          type: match.type,
          compositionId: targetComp.id,
          compositionName: targetComp.name,
          currentIndex: match.index,
          isVisible: match.isVisible,
          isLocked: match.isLocked,
        },
      };
    }

    // 8. If query provided only layerType without name or ID
    if (query.layerType) {
      const matches = targetComp.layers.filter((l) => l.type === query.layerType);
      if (matches.length === 0) {
        return {
          status: 'TARGET_NOT_FOUND',
          reason: `No layer of type '${query.layerType}' found in composition '${targetComp.name}'`,
          error: 'Layer type not found',
        };
      }
      if (matches.length > 1) {
        const mappedMatches: LayerTarget[] = matches.map((m) => ({
          id: m.id,
          name: m.name,
          type: m.type,
          compositionId: targetComp!.id,
          compositionName: targetComp!.name,
          currentIndex: m.index,
          isVisible: m.isVisible,
          isLocked: m.isLocked,
        }));

        return {
          status: 'AMBIGUOUS_TARGET',
          matches: mappedMatches,
          reason: `Found ${matches.length} layers of type '${query.layerType}' in composition '${targetComp.name}'. Specific layer ID or name required.`,
          error: 'Ambiguous target layers by type',
        };
      }

      const match = matches[0];
      return {
        status: 'SUCCESS',
        target: {
          id: match.id,
          name: match.name,
          type: match.type,
          compositionId: targetComp.id,
          compositionName: targetComp.name,
          currentIndex: match.index,
          isVisible: match.isVisible,
          isLocked: match.isLocked,
        },
      };
    }

    return {
      status: 'TARGET_NOT_FOUND',
      reason: 'Empty layer query provided',
      error: 'Empty query',
    };
  }

  /**
   * Finds all layers in the active or specified composition matching criteria.
   */
  static findLayers(
    snapshot: AdobeProjectSnapshot | undefined,
    query?: { compositionId?: string; layerType?: AdobeLayerType }
  ): { status: LayerResolverStatus; layers: readonly LayerTarget[]; reason?: string } {
    if (!snapshot) {
      return { status: 'UNKNOWN_APPLICATION_STATE', layers: [], reason: 'Snapshot unavailable' };
    }
    if (snapshot.status === 'ADAPTER_DISCONNECTED') {
      return { status: 'ADAPTER_DISCONNECTED', layers: [], reason: 'Adapter disconnected' };
    }
    if (snapshot.status === 'UNKNOWN') {
      return { status: 'UNKNOWN_APPLICATION_STATE', layers: [], reason: 'Unknown application state' };
    }
    if (snapshot.status === 'PROJECT_CLOSED') {
      return { status: 'PRECONDITION_FAILED', layers: [], reason: 'Project closed' };
    }

    let targetComp: CompositionSnapshot | undefined;
    if (query?.compositionId) {
      targetComp = snapshot.compositions.find((c) => c.id === query.compositionId || c.name === query.compositionId);
    } else if (snapshot.activeCompositionId) {
      targetComp = snapshot.compositions.find((c) => c.id === snapshot.activeCompositionId);
    }

    if (!targetComp) {
      return { status: 'PRECONDITION_FAILED', layers: [], reason: 'Composition not found or inactive' };
    }

    let matching = targetComp.layers;
    if (query?.layerType) {
      matching = matching.filter((l) => l.type === query.layerType);
    }

    const layers: LayerTarget[] = matching.map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      compositionId: targetComp!.id,
      compositionName: targetComp!.name,
      currentIndex: l.index,
      isVisible: l.isVisible,
      isLocked: l.isLocked,
    }));

    return { status: 'SUCCESS', layers };
  }

  /**
   * Generates a bounded semantic inspection description for a specific layer.
   */
  static inspectLayer(
    snapshot: AdobeProjectSnapshot | undefined,
    query: LayerResolutionQuery
  ): { status: LayerResolverStatus; inspection?: Record<string, unknown>; error?: string } {
    const res = this.resolve(snapshot, query);
    if (res.status !== 'SUCCESS' || !res.target) {
      return { status: res.status, error: res.reason || res.error };
    }

    const comp = snapshot!.compositions.find((c) => c.id === res.target!.compositionId);
    const layer = comp?.layers.find((l) => l.id === res.target!.id);

    return {
      status: 'SUCCESS',
      inspection: {
        id: res.target.id,
        name: res.target.name,
        type: res.target.type,
        compositionId: res.target.compositionId,
        compositionName: res.target.compositionName,
        currentIndex: res.target.currentIndex,
        isVisible: res.target.isVisible,
        isLocked: res.target.isLocked,
        transformState: layer?.transformState,
      },
    };
  }
}
