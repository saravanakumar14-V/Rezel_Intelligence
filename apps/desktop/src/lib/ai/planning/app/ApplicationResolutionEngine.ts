/**
 * Rezel 13.2.4 — Application Resolution Engine
 *
 * Resolves the target application profile deterministically following strict precedence:
 * 1. Explicit application from intent
 * 2. Active foreground application session
 * 3. Unique connected application session
 * 4. Reject with AMBIGUOUS_APPLICATION or APPLICATION_NOT_FOUND
 */

import { ApplicationProfileRegistry } from '../../profiles/ApplicationProfileRegistry';
import type { ApplicationProfile } from '../../profiles/types';
import type { ApplicationSessionManager } from '../../../director/ApplicationSessionManager';
import type { PlannerFailureCode } from './types';

export interface ApplicationResolutionSuccess {
  readonly success: true;
  readonly profile: ApplicationProfile;
  readonly resolvedBy: 'EXPLICIT_INTENT' | 'FOREGROUND_SESSION' | 'ACTIVE_SESSION';
}

export interface ApplicationResolutionFailure {
  readonly success: false;
  readonly failureCode: PlannerFailureCode;
  readonly reason: string;
  readonly candidateAppIds?: readonly string[];
}

export type ApplicationResolutionResult =
  | ApplicationResolutionSuccess
  | ApplicationResolutionFailure;

export class ApplicationResolutionEngine {
  /**
   * Resolves the target application profile for an intent.
   */
  static resolveApplication(
    explicitAppId?: string,
    sessionManager?: ApplicationSessionManager
  ): ApplicationResolutionResult {
    // ─── 1. Explicit Application in Intent ────────────────────────────────────
    if (explicitAppId) {
      const res = ApplicationProfileRegistry.resolveProfile({
        appId: explicitAppId,
        alias: explicitAppId,
      });

      if (res.profile) {
        return {
          success: true,
          profile: res.profile,
          resolvedBy: 'EXPLICIT_INTENT',
        };
      }

      return {
        success: false,
        failureCode: 'APPLICATION_NOT_FOUND',
        reason: `Explicitly requested application '${explicitAppId}' is not registered (${res.reason})`,
      };
    }

    // ─── 2. Active Foreground Session & Active Contexts ───────────────────────
    if (sessionManager) {
      const connectedSessions = sessionManager
        .getAllSessions()
        .filter((s) => s.connectionStatus === 'CONNECTED');

      // Check strictly foreground session first
      const foregroundSession = connectedSessions.find((s) => s.foreground);
      if (foregroundSession) {
        const res = ApplicationProfileRegistry.resolveProfile({
          appId: foregroundSession.appId,
          alias: foregroundSession.appId,
        });

        if (res.profile) {
          return {
            success: true,
            profile: res.profile,
            resolvedBy: 'FOREGROUND_SESSION',
          };
        }
      }

      // ─── 3. Single Active Session Context ───────────────────────────────────
      if (connectedSessions.length === 1) {
        const session = connectedSessions[0];
        const res = ApplicationProfileRegistry.resolveProfile({
          appId: session.appId,
          alias: session.appId,
        });

        if (res.profile) {
          return {
            success: true,
            profile: res.profile,
            resolvedBy: 'ACTIVE_SESSION',
          };
        }
      } else if (connectedSessions.length > 1) {
        const candidateAppIds = Array.from(new Set(connectedSessions.map((s) => s.appId)));
        return {
          success: false,
          failureCode: 'AMBIGUOUS_APPLICATION',
          reason: `Multiple active applications detected without explicit intent target: [${candidateAppIds.join(', ')}]`,
          candidateAppIds,
        };
      }
    }

    // ─── 4. No Target Application Found ───────────────────────────────────────
    return {
      success: false,
      failureCode: 'APPLICATION_NOT_FOUND',
      reason: 'No target application specified in query and no active application session found in foreground',
    };
  }
}
