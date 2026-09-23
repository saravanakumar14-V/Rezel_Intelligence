import type { ApplicationSession } from './types.js';

export class ApplicationSessionManager {
  private activeSessions = new Map<string, ApplicationSession>();

  updateSession(session: ApplicationSession): void {
    this.activeSessions.set(session.appId, session);
  }

  removeSession(appId: string): void {
    this.activeSessions.delete(appId);
  }

  getSession(appId: string): ApplicationSession | undefined {
    return this.activeSessions.get(appId);
  }

  getForegroundSession(): ApplicationSession | undefined {
    for (const session of this.activeSessions.values()) {
      if (session.foreground && session.connectionStatus === 'CONNECTED') {
        return session;
      }
    }
    // Fallback to any connected session if none are strictly "foreground"
    for (const session of this.activeSessions.values()) {
      if (session.connectionStatus === 'CONNECTED') {
        return session;
      }
    }
    return undefined;
  }

  getAllSessions(): ApplicationSession[] {
    return Array.from(this.activeSessions.values());
  }
}
