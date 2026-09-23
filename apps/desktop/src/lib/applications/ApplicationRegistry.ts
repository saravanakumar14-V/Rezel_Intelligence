/**
 * Rezel OS — Application Registry (Milestone 11.3C)
 *
 * Central registry for Application Adapters and active Application Sessions.
 * Coordinates discovery, session routing, and application lifecycle telemetry.
 */

import type {
  ApplicationAdapter,
  ApplicationCapability,
  ApplicationDiscoveryInfo,
  ApplicationHealth,
  ApplicationLifecycleEvent,
  ApplicationSession,
} from './types';

export class ApplicationRegistryImpl {
  private adapters = new Map<string, ApplicationAdapter>();
  private eventListeners = new Set<(event: ApplicationLifecycleEvent) => void>();

  /**
   * Registers a new application adapter.
   */
  register(adapter: ApplicationAdapter): void {
    this.adapters.set(adapter.applicationId, adapter);
    this.emitEvent({
      type: 'application_discovered',
      timestamp: Date.now(),
      applicationId: adapter.applicationId,
      payload: { displayName: adapter.displayName },
    });
  }

  /**
   * Unregisters an application adapter.
   */
  unregister(applicationId: string): boolean {
    return this.adapters.delete(applicationId);
  }

  /**
   * Retrieves an adapter by applicationId.
   */
  get(applicationId: string): ApplicationAdapter | undefined {
    return this.adapters.get(applicationId);
  }

  /**
   * Lists all registered application adapters.
   */
  list(): ApplicationAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Discovers status and sessions across all registered applications.
   */
  async discoverAll(): Promise<ApplicationDiscoveryInfo[]> {
    const results: ApplicationDiscoveryInfo[] = [];
    for (const adapter of this.adapters.values()) {
      try {
        const info = await adapter.discover();
        results.push(info);
      } catch (err: any) {
        results.push({
          applicationId: adapter.applicationId,
          displayName: adapter.displayName,
          isInstalled: false,
          isRunning: false,
          availableSessions: [],
        });
      }
    }
    return results;
  }

  /**
   * Finds a session across all registered adapters.
   */
  findSession(sessionId: string): { adapter: ApplicationAdapter; session: ApplicationSession } | undefined {
    for (const adapter of this.adapters.values()) {
      const session = adapter.getSession(sessionId);
      if (session) {
        return { adapter, session };
      }
    }
    return undefined;
  }

  /**
   * Retrieves all active sessions across all registered adapters.
   */
  getAllSessions(): ApplicationSession[] {
    const sessions: ApplicationSession[] = [];
    for (const adapter of this.adapters.values()) {
      if (typeof adapter.getSessions === 'function') {
        sessions.push(...adapter.getSessions());
      }
    }
    return sessions;
  }

  /**
   * Finds an application capability by ID across all adapters.
   */
  findCapability(
    capabilityIdOrName: string
  ): { adapter: ApplicationAdapter; capability: ApplicationCapability } | undefined {
    for (const adapter of this.adapters.values()) {
      const capabilities = adapter.getCapabilities();
      const match = capabilities.find(
        (c) => c.id === capabilityIdOrName || c.name === capabilityIdOrName
      );
      if (match) {
        return { adapter, capability: match };
      }
    }
    return undefined;
  }

  /**
   * Retrieves overall health for an application.
   */
  getHealth(applicationId: string, sessionId?: string): ApplicationHealth {
    const adapter = this.adapters.get(applicationId);
    if (!adapter) {
      return {
        state: 'DISCONNECTED',
        lastHeartbeat: 0,
        message: `Application '${applicationId}' not registered`,
      };
    }
    return adapter.getHealth(sessionId);
  }

  /**
   * Subscribes to application lifecycle events.
   */
  subscribe(listener: (event: ApplicationLifecycleEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /**
   * Emits an application lifecycle telemetry event.
   */
  emitEvent(event: ApplicationLifecycleEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[ApplicationRegistry] Event listener error:', err);
      }
    }
  }
}

export const ApplicationRegistry = new ApplicationRegistryImpl();
