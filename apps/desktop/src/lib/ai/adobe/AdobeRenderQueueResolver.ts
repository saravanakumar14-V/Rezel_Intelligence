/**
 * Rezel 13.3.6 — Adobe Render Queue Resolver
 *
 * Provides deterministic resolution and pre-mutation validation for render queue items.
 * Guards against transient queue index shifts and ensures pre-render safety checks.
 */

import type {
  AdobeRenderQueueSnapshot,
  RenderQueueItemSnapshot,
} from './types';

export type RenderQueueResolverStatus =
  | 'SUCCESS'
  | 'TARGET_NOT_FOUND'
  | 'TARGET_STALE'
  | 'AMBIGUOUS_TARGET'
  | 'ADAPTER_DISCONNECTED'
  | 'PRECONDITION_FAILED'
  | 'UNKNOWN_APPLICATION_STATE';

export interface RenderQueueResolutionResult {
  readonly status: RenderQueueResolverStatus;
  readonly targetItem?: RenderQueueItemSnapshot;
  readonly error?: string;
}

export interface RenderQueueTargetQuery {
  readonly queueIndex?: number;
  readonly compositionId?: string;
  readonly compositionName?: string;
}

export class AdobeRenderQueueResolver {
  /**
   * Resolves a target render queue item from an observed snapshot.
   */
  static resolve(
    snapshot: AdobeRenderQueueSnapshot,
    query: RenderQueueTargetQuery
  ): RenderQueueResolutionResult {
    // 1. Guard offline or disconnected state
    if (snapshot.status === 'ADAPTER_DISCONNECTED') {
      return {
        status: 'ADAPTER_DISCONNECTED',
        error: 'After Effects adapter is disconnected or offline.',
      };
    }

    if (snapshot.status === 'NO_ACTIVE_PROJECT' as any) {
      return {
        status: 'PRECONDITION_FAILED',
        error: 'No active project is open in After Effects.',
      };
    }

    if (snapshot.status === 'UNKNOWN') {
      return {
        status: 'UNKNOWN_APPLICATION_STATE',
        error: 'Application state is unknown or unverified.',
      };
    }

    const items = snapshot.items || [];
    if (items.length === 0) {
      return {
        status: 'TARGET_NOT_FOUND',
        error: 'Render queue is empty.',
      };
    }

    // 2. Direct resolution by queue index
    if (typeof query.queueIndex === 'number') {
      const target = items.find((it) => it.index === query.queueIndex);
      if (!target) {
        return {
          status: 'TARGET_NOT_FOUND',
          error: `Render queue item not found at index ${query.queueIndex}.`,
        };
      }

      // Stale index identity verification if expected compositionId is given
      if (query.compositionId && target.compositionId) {
        if (String(target.compositionId) !== String(query.compositionId)) {
          return {
            status: 'TARGET_STALE',
            error: `Render queue item at index ${query.queueIndex} has compositionId '${target.compositionId}' but expected '${query.compositionId}' (queue index shifted).`,
          };
        }
      }

      return {
        status: 'SUCCESS',
        targetItem: target,
      };
    }

    // 3. Resolution by compositionId
    if (query.compositionId) {
      const matches = items.filter(
        (it) => it.compositionId && String(it.compositionId) === String(query.compositionId)
      );

      if (matches.length === 0) {
        return {
          status: 'TARGET_NOT_FOUND',
          error: `No render queue item found for composition ID '${query.compositionId}'.`,
        };
      }

      if (matches.length > 1) {
        return {
          status: 'AMBIGUOUS_TARGET',
          error: `Multiple render queue items (${matches.length}) found for composition ID '${query.compositionId}'. Specify queueIndex to disambiguate.`,
        };
      }

      return {
        status: 'SUCCESS',
        targetItem: matches[0],
      };
    }

    // 4. Resolution by compositionName
    if (query.compositionName) {
      const matches = items.filter(
        (it) => it.compositionName && it.compositionName.toLowerCase() === query.compositionName!.toLowerCase()
      );

      if (matches.length === 0) {
        return {
          status: 'TARGET_NOT_FOUND',
          error: `No render queue item found with composition name '${query.compositionName}'.`,
        };
      }

      if (matches.length > 1) {
        return {
          status: 'AMBIGUOUS_TARGET',
          error: `Multiple render queue items (${matches.length}) match composition name '${query.compositionName}'. Specify queueIndex to disambiguate.`,
        };
      }

      return {
        status: 'SUCCESS',
        targetItem: matches[0],
      };
    }

    return {
      status: 'TARGET_NOT_FOUND',
      error: 'No target identifier (queueIndex, compositionId, or compositionName) provided in query.',
    };
  }

  /**
   * Pre-render safety verification: checks if renderQueue can be started.
   */
  static canStartRender(snapshot: AdobeRenderQueueSnapshot): {
    allowed: boolean;
    queuedCount: number;
    reason?: string;
  } {
    if (snapshot.status !== 'ACTIVE_PROJECT') {
      return {
        allowed: false,
        queuedCount: 0,
        reason: `Cannot start render: project status is ${snapshot.status}.`,
      };
    }

    const items = snapshot.items || [];
    if (items.length === 0) {
      return {
        allowed: false,
        queuedCount: 0,
        reason: 'Render queue is empty.',
      };
    }

    const queuedItems = items.filter((it) => it.status === 'QUEUED');
    if (queuedItems.length === 0) {
      return {
        allowed: false,
        queuedCount: 0,
        reason: 'No items in the render queue are in QUEUED status.',
      };
    }

    return {
      allowed: true,
      queuedCount: queuedItems.length,
    };
  }
}
