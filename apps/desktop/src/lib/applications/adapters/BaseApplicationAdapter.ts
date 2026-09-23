/**
 * Rezel OS — Base Application Adapter (Milestone 11.3C)
 *
 * Provides core implementation for session tracking, capability queries,
 * health normalization, and verification delegation.
 */

import type {
  ApplicationAdapter,
  ApplicationCapability,
  ApplicationDiscoveryInfo,
  ApplicationHealth,
  ApplicationOperation,
  ApplicationOperationResult,
  ApplicationSession,
  InspectionRequest,
  InspectionResult,
} from '../types';
import type { VerificationPredicate, VerificationResult } from '../../ai/verification/types';

export abstract class BaseApplicationAdapter implements ApplicationAdapter {
  abstract readonly applicationId: string;
  abstract readonly displayName: string;

  protected sessions = new Map<string, ApplicationSession>();
  protected capabilities: ApplicationCapability[] = [];

  getCapabilities(): ApplicationCapability[] {
    return [...this.capabilities];
  }

  getSessions(): ApplicationSession[] {
    return Array.from(this.sessions.values());
  }

  getSession(sessionId: string): ApplicationSession | undefined {
    return this.sessions.get(sessionId);
  }

  getHealth(sessionId?: string): ApplicationHealth {
    if (sessionId) {
      const session = this.sessions.get(sessionId);
      if (session) return session.health;
    }
    const activeSessions = this.getSessions().filter((s) => s.state === 'ACTIVE');
    if (activeSessions.length > 0) {
      return {
        state: 'READY',
        lastHeartbeat: Math.max(...activeSessions.map((s) => s.health.lastHeartbeat)),
        message: `${activeSessions.length} active session(s) available`,
      };
    }
    return {
      state: 'DISCONNECTED',
      lastHeartbeat: 0,
      message: 'No active sessions',
    };
  }

  abstract discover(): Promise<ApplicationDiscoveryInfo>;

  abstract connect(options?: {
    sessionId?: string;
    launchId?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<ApplicationSession>;

  abstract disconnect(sessionId: string): Promise<void>;

  abstract inspect(request: InspectionRequest, signal?: AbortSignal): Promise<InspectionResult>;

  abstract execute(
    operation: ApplicationOperation,
    signal?: AbortSignal
  ): Promise<ApplicationOperationResult>;

  abstract verify(
    sessionId: string,
    predicate: VerificationPredicate,
    signal?: AbortSignal
  ): Promise<VerificationResult>;

  protected registerSession(session: ApplicationSession): void {
    this.sessions.set(session.sessionId, session);
  }

  protected unregisterSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
