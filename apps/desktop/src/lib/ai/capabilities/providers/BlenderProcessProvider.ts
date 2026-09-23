import type { CapabilityProvider, Capability, ExecutionContext } from '../types';
import { invoke } from '@tauri-apps/api/core';

class BlenderLaunchCapability implements Capability<{ background?: boolean }, void> {
  readonly id = 'blender.launch';
  readonly description = 'Launch Blender safely with Rezel IPC integration. Do not use this if Blender is already running.';
  readonly category = 'system';
  readonly riskLevel = 'LOW';
  readonly toolGroup = 'blender_process';
  
  // Launching the process mutates external state
  readonly mutatesExternalState = true;
  readonly isReversible = false;
  readonly retryPolicy = 'NEVER';

  readonly parameters = {
    background: {
      type: 'boolean' as const,
      description: 'If true, launches Blender in background mode without GUI.',
      required: false,
    },
  };

  validateScope() {
    return { allowed: true };
  }

  async getRequiredLocks() {
    // Only lock the process launch itself, not the whole app, 
    // or just lock the app to prevent concurrent launches.
    return [{ uri: 'app:blender', access: 'WRITE' as const }];
  }

  async execute(args: { background?: boolean }, context: ExecutionContext): Promise<void> {
    if (context.signal?.aborted) {
      throw new Error('Aborted before launch');
    }

    try {
      await invoke('launch_blender', { background: args.background ?? false });
    } catch (e: any) {
      throw new Error(`Failed to launch Blender: ${e}`);
    }

    // Await deterministic authenticated IPC client connection and capability registration
    try {
      const { ApplicationCapabilityRegistry } = await import('../../ApplicationCapabilityRegistry.js');
      const registeredCaps = await ApplicationCapabilityRegistry.waitForClient(
        'blender',
        15000,
        ['blender.create_object', 'blender.inspect_scene'],
        context.signal
      );
      console.info(`[BlenderProcess] blender_ipc_ready: Registered capabilities: ${registeredCaps.join(', ')}`);
    } catch (err: any) {
      console.error(`[BlenderProcess] blender_ipc_timeout: ${err?.message ?? err}`);
      throw new Error(`Blender launched but IPC connection timed out waiting for capability registration: ${err?.message ?? err}`);
    }
  }
}

export class BlenderProcessProvider implements CapabilityProvider {
  readonly id = 'blender_process_provider';
  readonly type = 'builtin';

  capabilities(): Capability<any, any>[] {
    return [new BlenderLaunchCapability()];
  }

  health() {
    return { status: 'CONNECTED' as const };
  }
}
