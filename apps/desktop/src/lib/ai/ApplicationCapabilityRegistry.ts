import { listen } from '@tauri-apps/api/event';
import { ToolRegistry } from './ToolRegistry';
import type { ToolDefinition } from './types';
import type { RiskLevel } from '../security/PermissionManager';
import { CapabilityRegistry } from './capabilities/CapabilityRegistry';
import { LegacyToolCapability } from './capabilities/ToolCapabilityAdapter';

interface ConnectedClientPayload {
  client_id: string;
  capabilities: Array<{
    name: string;
    description: string;
    parameters: any;
    category?: any;
    risk?: RiskLevel;
  }>;
}

interface DisconnectedClientPayload {
  client_id: string;
}

class ApplicationCapabilityRegistryImpl {
  /** Map of client_id to array of tool names they registered */
  private clientTools = new Map<string, string[]>();
  private initialized = false;
  private pendingWaiters = new Set<(payload: { clientId: string; capabilities: string[] }) => void>();

  /**
   * init
   * 
   * Sets up Tauri event listeners for IPC clients.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      await listen<ConnectedClientPayload>('ipc://client_connected', (event) => {
        this.handleClientConnected(event.payload);
      });

      await listen<DisconnectedClientPayload>('ipc://client_disconnected', (event) => {
        this.handleClientDisconnected(event.payload.client_id);
      });
    } catch (e) {
      // In non-Tauri / test environments, listen may not be available
      console.warn('[AppRegistry] Tauri listen not available in this environment');
    }
  }

  handleClientConnected(payload: ConnectedClientPayload): string[] {
    const { client_id, capabilities } = payload;
    console.info(`[AppRegistry] Client connected: ${client_id} with ${capabilities.length} capabilities`);

    const toolNames: string[] = [];

    for (const cap of capabilities) {
      // Read-only known capabilities
      const isReadOnly = cap.name === 'ae_get_status' || cap.name === 'ae_inspect_project' || cap.name === 'blender.inspect_scene';
      
      const toolDef: ToolDefinition = {
        name: cap.name,
        description: cap.description,
        parameters: cap.parameters,
        category: cap.category ?? 'system',
        risk: cap.risk ?? 'HIGH', // Safe default: always confirm unknown app commands
        tauriCommand: 'send_ipc_command',
        ipcClientId: client_id,
        toolGroup: `app_ipc_${client_id}`,
        mutatesExternalState: !isReadOnly,
        retryPolicy: isReadOnly ? 'AUTO' : 'NEVER',
        requiredLocks: client_id === 'blender' ? [{ uri: 'app:blender', access: isReadOnly ? 'READ' : 'WRITE' }] : undefined,
      };

      ToolRegistry.register(toolDef);
      
      // Also register into modern CapabilityRegistry so Gemini can see it dynamically
      const legacyCap = new LegacyToolCapability(toolDef);
      CapabilityRegistry.register(legacyCap);
      
      toolNames.push(toolDef.name);
    }

    this.clientTools.set(client_id, toolNames);

    // Notify any pending waiters
    for (const waiter of this.pendingWaiters) {
      try {
        waiter({ clientId: client_id, capabilities: toolNames });
      } catch (err) {
        console.error('[AppRegistry] Waiter callback error:', err);
      }
    }

    return toolNames;
  }

  handleClientDisconnected(clientId: string): void {
    console.info(`[AppRegistry] Client disconnected: ${clientId}`);

    const tools = this.clientTools.get(clientId);
    if (tools) {
      for (const toolName of tools) {
        ToolRegistry.unregister(toolName);
        CapabilityRegistry.unregister(toolName);
      }
      this.clientTools.delete(clientId);
    }
  }

  /**
   * Returns registered tool names for the given client.
   */
  getClientCapabilities(clientId: string): string[] {
    return this.clientTools.get(clientId) ?? [];
  }

  /**
   * Deterministically awaits client connection and required capability registration.
   */
  async waitForClient(
    clientId: string,
    timeoutMs: number = 15000,
    requiredCapabilities: string[] = [],
    signal?: AbortSignal
  ): Promise<string[]> {
    // 1. Check if already connected with all required capabilities
    const existing = this.clientTools.get(clientId);
    if (existing) {
      const hasAll = requiredCapabilities.every((req) => existing.includes(req));
      if (hasAll) {
        return existing;
      }
    }

    if (signal?.aborted) {
      throw new Error(`Connection wait for ${clientId} aborted`);
    }

    // 2. Wait for incoming authenticated connection
    return new Promise((resolve, reject) => {
      let timer: any = null;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        this.pendingWaiters.delete(listener);
        if (signal) signal.removeEventListener('abort', onAbort);
      };

      const onAbort = () => {
        cleanup();
        reject(new Error(`Connection wait for ${clientId} aborted by signal`));
      };

      const listener = (data: { clientId: string; capabilities: string[] }) => {
        if (data.clientId === clientId) {
          const hasAll = requiredCapabilities.every((req) => data.capabilities.includes(req));
          if (hasAll) {
            cleanup();
            resolve(data.capabilities);
          }
        }
      };

      this.pendingWaiters.add(listener);

      if (signal) {
        signal.addEventListener('abort', onAbort);
      }

      timer = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `blender_ipc_timeout: Client '${clientId}' did not register capabilities [${requiredCapabilities.join(
              ', '
            )}] within ${timeoutMs}ms`
          )
        );
      }, timeoutMs);
    });
  }
}

export const ApplicationCapabilityRegistry = new ApplicationCapabilityRegistryImpl();
