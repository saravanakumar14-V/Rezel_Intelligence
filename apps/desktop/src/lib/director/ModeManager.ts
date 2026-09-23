import { LocalMemory } from '../memory/LocalMemory.js';
import type { Mode } from './types.js';

export class ModeManager {
  private persistentMode: Mode | null = null;
  private contextualMode: Mode | null = null;
  private defaultMode: Mode = 'FRIENDLY';

  init(): void {
    try {
      const persisted = LocalMemory.getEntry('persistent_mode')?.value;
      if (persisted && (persisted === 'FRIENDLY' || persisted === 'CREATOR' || persisted === 'DEVELOPER')) {
        this.persistentMode = persisted as Mode;
      }
    } catch (e) {
      this.persistentMode = null;
    }
  }

  setPersistentMode(mode: Mode | null): void {
    this.persistentMode = mode;
    try {
      if (mode) {
        LocalMemory.setEntry('persistent_mode', mode, 'preference');
      } else {
        LocalMemory.setEntry('persistent_mode', '', 'preference'); // clear
      }
    } catch (e) {
      console.warn('Failed to persist mode', e);
    }
  }

  setContextualMode(mode: Mode | null): void {
    this.contextualMode = mode;
  }

  getEffectiveMode(): Mode {
    if (this.persistentMode) {
      return this.persistentMode;
    }
    if (this.contextualMode) {
      return this.contextualMode;
    }
    return this.defaultMode;
  }

  clearContextualMode(): void {
    this.contextualMode = null;
  }
}
