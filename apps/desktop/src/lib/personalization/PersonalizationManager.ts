import type {
  PersonalizationProfile,
  PersonalizationListener,
  VisualPreferences,
  MotionPreferences,
  AudioPreferences,
  AIPreferences,
  WorkspacePreferences,
  NotificationPreferences,
  AccessibilityPreferences,
} from './types';
import { NotificationIntelligenceCenter } from '../notifications/NotificationIntelligenceCenter';

const STORAGE_KEY = 'rezel_personalization_v1';
const CURRENT_SCHEMA_VERSION = 1;

export const DEFAULT_PERSONALIZATION_PROFILE: PersonalizationProfile = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  visual: {
    preset: 'DYNAMIC',
    density: 'COMFORTABLE',
    ambientIntensity: 0.8,
    accentGlow: true,
  },
  motion: {
    reducedMotion: false,
    transitionStyle: 'SMOOTH',
  },
  audio: {
    voiceEnabled: true,
    ttsEnabled: true,
    soundEffects: true,
    voicePace: 1.0,
    voiceTone: 'WARM',
  },
  ai: {
    preferredProvider: 'AUTO',
    reasoningMode: 'BALANCED',
    localFirst: false,
    costSensitivity: 'BALANCED',
  },
  workspace: {
    startupSpace: 'CORE',
    showBackgroundIndicators: true,
  },
  notifications: {
    density: 'ALL',
    soundCues: true,
  },
  accessibility: {
    highContrast: false,
    largeMonospace: false,
  },
};

class PersonalizationManagerImpl {
  private profile: PersonalizationProfile;
  private listeners = new Set<PersonalizationListener>();

  constructor() {
    this.profile = this.loadProfile();
  }

  private loadProfile(): PersonalizationProfile {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { ...DEFAULT_PERSONALIZATION_PROFILE };
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_PERSONALIZATION_PROFILE };

      const parsed = JSON.parse(raw);
      return this.migrateAndValidate(parsed);
    } catch (err) {
      console.warn('[PersonalizationManager] Failed to parse stored profile, using defaults:', err);
      return { ...DEFAULT_PERSONALIZATION_PROFILE };
    }
  }

  private migrateAndValidate(data: any): PersonalizationProfile {
    if (!data || typeof data !== 'object') {
      return { ...DEFAULT_PERSONALIZATION_PROFILE };
    }

    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      visual: {
        ...DEFAULT_PERSONALIZATION_PROFILE.visual,
        ...(data.visual || {}),
      },
      motion: {
        ...DEFAULT_PERSONALIZATION_PROFILE.motion,
        ...(data.motion || {}),
      },
      audio: {
        ...DEFAULT_PERSONALIZATION_PROFILE.audio,
        ...(data.audio || {}),
      },
      ai: {
        ...DEFAULT_PERSONALIZATION_PROFILE.ai,
        ...(data.ai || {}),
      },
      workspace: {
        ...DEFAULT_PERSONALIZATION_PROFILE.workspace,
        ...(data.workspace || {}),
      },
      notifications: {
        ...DEFAULT_PERSONALIZATION_PROFILE.notifications,
        ...(data.notifications || {}),
      },
      accessibility: {
        ...DEFAULT_PERSONALIZATION_PROFILE.accessibility,
        ...(data.accessibility || {}),
      },
    };
  }

  private save(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
      } catch (err) {
        console.error('[PersonalizationManager] Failed to persist profile:', err);
      }
    }
    this.notify();
  }

  public getProfile(): PersonalizationProfile {
    return { ...this.profile };
  }

  public updateVisual(prefs: Partial<VisualPreferences>): void {
    this.profile.visual = { ...this.profile.visual, ...prefs };
    this.save();
  }

  public updateMotion(prefs: Partial<MotionPreferences>): void {
    this.profile.motion = { ...this.profile.motion, ...prefs };
    this.save();
  }

  public updateAudio(prefs: Partial<AudioPreferences>): void {
    this.profile.audio = { ...this.profile.audio, ...prefs };
    this.save();
  }

  public updateAI(prefs: Partial<AIPreferences>): void {
    this.profile.ai = { ...this.profile.ai, ...prefs };
    this.save();
  }

  public updateWorkspace(prefs: Partial<WorkspacePreferences>): void {
    this.profile.workspace = { ...this.profile.workspace, ...prefs };
    this.save();
  }

  public updateNotifications(prefs: Partial<NotificationPreferences>): void {
    this.profile.notifications = { ...this.profile.notifications, ...prefs };
    this.save();
  }

  public updateAccessibility(prefs: Partial<AccessibilityPreferences>): void {
    this.profile.accessibility = { ...this.profile.accessibility, ...prefs };
    this.save();
  }

  public resetCategory(category: keyof Omit<PersonalizationProfile, 'schemaVersion'>): void {
    (this.profile as any)[category] = { ...(DEFAULT_PERSONALIZATION_PROFILE as any)[category] };
    this.save();
    NotificationIntelligenceCenter.emit({
      title: 'Preferences Reset',
      summary: `Reset ${String(category)} preferences to defaults`,
      severity: 'INFO',
      source: 'SYSTEM',
    });
  }

  public resetAll(): void {
    this.profile = { ...DEFAULT_PERSONALIZATION_PROFILE };
    this.save();
    NotificationIntelligenceCenter.emit({
      title: 'All Personalization Reset',
      summary: 'Restored all user preferences to default configuration',
      severity: 'INFO',
      source: 'SYSTEM',
    });
  }

  /**
   * Resolves natural language commands for personalization.
   */
  public resolveNaturalCommand(command: string): boolean {
    const lower = command.trim().toLowerCase();

    if (lower.includes('calm mode') || lower.includes('make rezel calmer')) {
      this.updateVisual({ preset: 'CALM', ambientIntensity: 0.3 });
      return true;
    }
    if (lower.includes('focus mode')) {
      this.updateVisual({ preset: 'FOCUS', density: 'COMPACT', ambientIntensity: 0.4 });
      return true;
    }
    if (lower.includes('dynamic mode') || lower.includes('full visual energy')) {
      this.updateVisual({ preset: 'DYNAMIC', ambientIntensity: 0.8 });
      return true;
    }
    if (lower.includes('minimal mode') || lower.includes('minimal visuals')) {
      this.updateVisual({ preset: 'MINIMAL', ambientIntensity: 0.1 });
      return true;
    }
    if (lower.includes('compact ui') || lower.includes('compact density')) {
      this.updateVisual({ density: 'COMPACT' });
      return true;
    }
    if (lower.includes('comfortable ui') || lower.includes('comfortable density')) {
      this.updateVisual({ density: 'COMFORTABLE' });
      return true;
    }
    if (lower.includes('prefer local') || lower.includes('prefer local models')) {
      this.updateAI({ localFirst: true, preferredProvider: 'LOCAL' });
      return true;
    }
    if (lower.includes('reduce animations') || lower.includes('turn down animations') || lower.includes('reduced motion')) {
      this.updateMotion({ reducedMotion: true, transitionStyle: 'INSTANT' });
      return true;
    }
    if (lower.includes('reduce notifications') || lower.includes('fewer notifications')) {
      this.updateNotifications({ density: 'IMPORTANT_ONLY' });
      return true;
    }
    if (lower.includes('reset visual') || lower.includes('reset theme')) {
      this.resetCategory('visual');
      return true;
    }
    if (lower.includes('reset personalization') || lower.includes('reset preferences')) {
      this.resetAll();
      return true;
    }

    return false;
  }

  public subscribe(listener: PersonalizationListener): () => void {
    this.listeners.add(listener);
    listener(this.getProfile());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const prof = this.getProfile();
    for (const listener of this.listeners) {
      try {
        listener(prof);
      } catch (err) {
        console.error('[PersonalizationManager] Listener error:', err);
      }
    }
  }
}

export const PersonalizationManager = new PersonalizationManagerImpl();
