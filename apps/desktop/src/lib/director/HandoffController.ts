import { invoke } from '@tauri-apps/api/core';
import type { WindowState, HandoffState, CompanionConfig, WindowBounds, ApplicationSession } from './types';
import { ApplicationHandoffRegistry } from './handoff/ApplicationHandoffAdapter';
import { BlenderHandoffAdapter } from './handoff/BlenderHandoffAdapter';
import { LocalMemory } from '../memory/LocalMemory';

// Register built-in adapters
ApplicationHandoffRegistry.register(new BlenderHandoffAdapter());

export type HandoffEventHandler = (event: {
  type: 'handoff_started' | 'handoff_completed' | 'handoff_failed' | 'window_mode_changed';
  payload?: any;
}) => void;

export class HandoffController {
  private windowState: WindowState = 'FULL';
  private handoffState: HandoffState = 'IDLE';
  private savedBounds: WindowBounds | null = null;
  private activeTargetApp: string | null = null;
  private listeners = new Set<HandoffEventHandler>();

  private config: CompanionConfig = {
    width: 360,
    height: 220,
    anchor: 'BOTTOM_RIGHT',
    alwaysOnTop: true,
  };

  constructor() {
    this.loadPreferences();
  }

  public subscribe(handler: HandoffEventHandler): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  private emit(type: 'handoff_started' | 'handoff_completed' | 'handoff_failed' | 'window_mode_changed', payload?: any) {
    for (const listener of this.listeners) {
      try {
        listener({ type, payload });
      } catch (err) {
        console.error('[HandoffController] Listener error:', err);
      }
    }
  }

  public getWindowState(): WindowState {
    return this.windowState;
  }

  public getHandoffState(): HandoffState {
    return this.handoffState;
  }

  public getSavedBounds(): WindowBounds | null {
    return this.savedBounds;
  }

  public getActiveTargetApp(): string | null {
    return this.activeTargetApp;
  }

  public getCompanionConfig(): CompanionConfig {
    return { ...this.config };
  }

  public setCompanionConfig(config: Partial<CompanionConfig>): void {
    this.config = { ...this.config, ...config };
    this.savePreferences();
  }

  /**
   * enterCompanionMode
   * Coordinates handoff to the specified target application and transforms window to COMPANION.
   */
  public async enterCompanionMode(targetAppId?: string, session?: ApplicationSession | null): Promise<void> {
    // Idempotency guards
    if (this.windowState === 'COMPANION' || this.windowState === 'TRANSITIONING') {
      return;
    }

    const appId = targetAppId ?? session?.appId ?? 'blender';
    this.activeTargetApp = appId;

    this.windowState = 'TRANSITIONING';
    this.handoffState = 'PREPARING';
    this.emit('window_mode_changed', { mode: 'TRANSITIONING' });
    this.emit('handoff_started', { appId, state: this.handoffState });

    try {
      const adapter = ApplicationHandoffRegistry.get(appId);
      if (!adapter) {
        throw new Error(`No handoff adapter registered for application: ${appId}`);
      }

      // Step 1: Launch target app if not already connected
      this.handoffState = 'LAUNCHING';
      if (!session || session.connectionStatus !== 'CONNECTED') {
        const isInstalled = await adapter.isInstalled();
        if (!isInstalled) {
          throw new Error(`Application ${adapter.displayName} is not installed or available.`);
        }
        await adapter.launch(false);
      }

      // Step 2: Transition window to COMPANION mode first
      this.handoffState = 'ENTERING_COMPANION';
      if (typeof window !== 'undefined') {
        const bounds = await invoke<WindowBounds>('window_set_companion_mode', {
          options: {
            width: this.config.width,
            height: this.config.height,
            anchor: this.config.anchor,
          },
        });
        if (bounds) {
          this.savedBounds = bounds;
        }
      }

      this.windowState = 'COMPANION';
      this.handoffState = 'COMPANION';
      this.emit('window_mode_changed', { mode: 'COMPANION' });

      // Step 3: Focus target application AFTER Rezel is in stable companion mode
      this.handoffState = 'FOCUSING';
      try {
        await adapter.focus();
      } catch (focusErr) {
        console.warn('[HandoffController] Adapter focus warning:', focusErr);
      }

      this.handoffState = 'COMPANION';
      this.emit('handoff_completed', { appId, state: this.handoffState });
    } catch (err: any) {
      console.error('[HandoffController] Handoff failed:', err);
      this.handoffState = 'FAILED';
      this.emit('handoff_failed', { appId, error: err?.message ?? String(err) });
      
      // Graceful rollback to FULL mode
      await this.restoreFullMode();
      throw err;
    }
  }

  /**
   * restoreFullMode
   * Restores window from COMPANION back to FULL mode.
   */
  public async restoreFullMode(): Promise<void> {
    // Idempotency guards
    if (this.windowState === 'FULL') {
      return;
    }

    this.windowState = 'TRANSITIONING';
    this.handoffState = 'RESTORING';
    this.emit('window_mode_changed', { mode: 'TRANSITIONING' });

    try {
      if (typeof window !== 'undefined') {
        await invoke<WindowBounds>('window_restore_full_mode');
      }
    } catch (err) {
      console.warn('[HandoffController] window_restore_full_mode failed:', err);
    }

    this.windowState = 'FULL';
    this.handoffState = 'IDLE';
    this.activeTargetApp = null;
    this.emit('window_mode_changed', { mode: 'FULL' });
  }

  // ── Preferences Persistence ────────────────────────────────────────────────

  private loadPreferences(): void {
    try {
      const anchorEntry = LocalMemory.getEntry('companion_window_anchor');
      if (anchorEntry?.value) {
        this.config.anchor = anchorEntry.value as any;
      }
    } catch {
      // ignore
    }
  }

  private savePreferences(): void {
    try {
      LocalMemory.setEntry('companion_window_anchor', this.config.anchor, 'preference');
    } catch {
      // ignore
    }
  }
}
