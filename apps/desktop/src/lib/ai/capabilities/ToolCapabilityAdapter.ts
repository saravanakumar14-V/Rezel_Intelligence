import { invoke } from '@tauri-apps/api/core';
import type { CapabilityProvider, Capability, ExecutionContext, ScopeResult } from './types';
import { ToolRegistry } from '../ToolRegistry';
import type { ToolDefinition } from '../types';

/**
 * Adapter that wraps a legacy ToolDefinition into a new Capability.
 */
export class LegacyToolCapability implements Capability<any, any> {
  private readonly toolDef: ToolDefinition;

  constructor(toolDef: ToolDefinition) {
    this.toolDef = toolDef;
  }

  get id() { return this.toolDef.name; }
  get description() { return this.toolDef.description; }
  get category() { return this.toolDef.category as any; } // Cast to any to handle category mismatch safely for legacy
  get parameters() { return this.toolDef.parameters; }
  
  get riskLevel() { return this.toolDef.risk; }
  get mutatesExternalState() { return this.toolDef.mutatesExternalState ?? true; }
  get isReversible() { return false; } // Legacy tools don't define reversibility
  get retryPolicy() { return this.toolDef.retryPolicy ?? 'NEVER'; }
  
  get toolGroup() { return this.toolDef.toolGroup; }

  validateScope(): ScopeResult {
    // Legacy tools have no explicit resource scopes
    return { allowed: true };
  }

  async getRequiredLocks() {
    return this.toolDef.requiredLocks || [];
  }

  async execute(args: any, _context: ExecutionContext): Promise<any> {
    const tauriCommand = this.toolDef.tauriCommand ?? this.toolDef.name;
    const executionArgs = this.toolDef.ipcClientId
      ? { clientId: this.toolDef.ipcClientId, command: this.toolDef.name, args }
      : args;
    return await invoke<unknown>(tauriCommand, executionArgs);
  }
}

/**
 * Provider that bridges the legacy ToolRegistry into the new CapabilityRegistry.
 */
export class ToolCapabilityAdapterProvider implements CapabilityProvider {
  readonly id = 'legacy-tool-adapter';
  readonly type = 'legacy_adapter';

  capabilities(): Capability<any, any>[] {
    // Wrap all registered tools
    return ToolRegistry.getAll().map(toolDef => new LegacyToolCapability(toolDef));
  }

  health() {
    return { status: 'CONNECTED' as const };
  }
}
