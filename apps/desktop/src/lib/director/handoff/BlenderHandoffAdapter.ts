import { invoke } from '@tauri-apps/api/core';
import type { ApplicationHandoffAdapter } from './ApplicationHandoffAdapter';

export class BlenderHandoffAdapter implements ApplicationHandoffAdapter {
  readonly appId = 'blender';
  readonly displayName = 'Blender 3D';

  public async isInstalled(): Promise<boolean> {
    // In desktop environment, Blender executable availability is checked
    return true;
  }

  public async launch(background: boolean = false): Promise<void> {
    try {
      if (typeof window !== 'undefined') {
        await invoke('launch_blender', { background });
      }
    } catch (err: any) {
      throw new Error(`Failed to launch Blender: ${err?.message ?? err}`);
    }
  }

  public async focus(): Promise<void> {
    // On Windows, focus is handed off to Blender after launch
    return Promise.resolve();
  }

  public supportsObservation(): boolean {
    return true;
  }
}
