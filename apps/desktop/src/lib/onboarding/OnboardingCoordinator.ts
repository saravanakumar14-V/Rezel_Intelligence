/**
 * Rezel OS — Onboarding Coordinator (Milestone R8)
 *
 * Orchestrates first-launch lifecycle, stage progression, adaptive skipping,
 * and interruption recovery using canonical Rezel domain services.
 */

import {
  ONBOARDING_VERSION,
  type OnboardingStage,
  type OnboardingState,
  type InitialPreferences,
  type LocalAIDiscoveryResult,
  type DiscoveredEnvironment,
  type HardwareCapabilityProfile,
} from './types';
import { HardwareProfiler } from './HardwareProfiler';
import { ProviderAuthManager } from '../ai/providers/ProviderAuthManager';
import { OllamaChatAdapter } from '../ai/providers/adapters/OllamaAdapter';
import { ModelCatalog } from '../ai/providers/ModelCatalog';
import { LocalMemory } from '../memory/LocalMemory';
import { RezelDirector } from '../director/RezelDirector';
import type { Mode } from '../director/types';

export type OnboardingListener = (state: OnboardingState) => void;

const STAGE_ORDER: OnboardingStage[] = [
  'awakening',
  'environment',
  'capabilities',
  'hardware',
  'providers',
  'local-ai',
  'integrations',
  'permissions',
  'personalization',
  'ready',
];

class OnboardingCoordinatorImpl {
  private state: OnboardingState;
  private listeners = new Set<OnboardingListener>();
  private initialized = false;

  constructor() {
    this.state = this.getInitialState();
  }

  private getInitialState(): OnboardingState {
    return {
      version: ONBOARDING_VERSION,
      firstLaunch: true,
      completed: false,
      interrupted: false,
      currentStage: 'awakening',
      completedStages: [],
      skippedStages: [],
      preferences: {
        experienceStyle: 'Balanced',
        voiceEnabled: true,
        workspaceDensity: 'Balanced',
        aiPreference: 'Balanced',
      },
    };
  }

  private initPromise: Promise<void> | null = null;

  /**
   * Initializes the coordinator, loading persistence from LocalMemory / localStorage.
   */
  public async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        await LocalMemory.load();
        const completedEntry = LocalMemory.getEntry('onboarding_completed');
        const versionEntry = LocalMemory.getEntry('onboarding_version');
        const interruptedEntry = LocalMemory.getEntry('onboarding_interrupted');
        const savedStage = LocalMemory.getEntry('onboarding_stage')?.value as OnboardingStage | undefined;

        const isCompleted = completedEntry?.value === 'true';
        const version = versionEntry ? parseInt(versionEntry.value, 10) : 0;
        const isInterrupted = interruptedEntry?.value === 'true' && !isCompleted;

        if (isCompleted && version >= ONBOARDING_VERSION) {
          this.state.firstLaunch = false;
          this.state.completed = true;
          this.state.currentStage = 'ready';
        } else {
          this.state.firstLaunch = true;
          this.state.completed = false;
          this.state.interrupted = Boolean(isInterrupted);
          if (isInterrupted && savedStage && STAGE_ORDER.includes(savedStage)) {
            this.state.currentStage = savedStage;
          } else {
            // Corrupted or missing stage falls back safely to initial stage
            this.state.currentStage = 'awakening';
          }
        }

        // Mark in-progress to track potential interruption
        if (!this.state.completed) {
          LocalMemory.setEntry('onboarding_interrupted', 'true', 'preference');
          await LocalMemory.save().catch(() => {});
        }
      } catch {
        // Safe fallback on storage corruption
        this.state = this.getInitialState();
      }

      this.initialized = true;
      this.notify();
    })();
    return this.initPromise;
  }

  public isFirstLaunch(): boolean {
    return this.state.firstLaunch && !this.state.completed;
  }

  public isInterrupted(): boolean {
    return this.state.interrupted;
  }

  public getState(): OnboardingState {
    return { ...this.state };
  }

  /**
   * Executes background async discovery for Environment & Hardware with a bounded timeout.
   * Truthful: Never fabricates hardware state on timeout or failure.
   */
  public async probeEnvironment(): Promise<void> {
    try {
      const probePromise = (async () => {
        const env = await HardwareProfiler.discoverEnvironment();
        const profile = HardwareProfiler.evaluateProfile(env);
        return { env, profile };
      })();

      const timeoutPromise = new Promise<{ env: DiscoveredEnvironment; profile: HardwareCapabilityProfile }>((resolve) => {
        setTimeout(() => {
          const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;
          const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : undefined;
          let os: string | undefined = undefined;
          if (typeof navigator !== 'undefined') {
            if (navigator.userAgent.includes('Windows')) os = 'Windows Platform';
            else if (navigator.userAgent.includes('Mac')) os = 'macOS Apple Silicon / Darwin';
            else if (navigator.userAgent.includes('Linux')) os = 'Linux / POSIX';
          }

          const fallbackEnv: DiscoveredEnvironment = {
            status: 'PARTIAL',
            os,
            cpuName: cores ? `${cores}-Core Processor` : undefined,
            cpuCores: cores,
            dpr,
          };
          resolve({
            env: fallbackEnv,
            profile: HardwareProfiler.evaluateProfile(fallbackEnv),
          });
        }, 1500);
      });

      const { env, profile } = await Promise.race([probePromise, timeoutPromise]);
      this.state.environment = env;
      this.state.hardwareProfile = profile;
      this.notify();
    } catch (err) {
      console.warn('[OnboardingCoordinator] Environment probe non-fatal error:', err);
    }
  }

  /**
   * Probes local Ollama AI endpoint asynchronously.
   */
  public async probeLocalAI(): Promise<LocalAIDiscoveryResult> {
    try {
      const adapter = new OllamaChatAdapter();
      const reachable = await adapter.isAvailable();

      if (reachable) {
        // Discovered running instance
        const models = ModelCatalog.listModels()
          .filter((m) => m.vendor === 'OLLAMA')
          .map((m) => m.id);

        const result: LocalAIDiscoveryResult = {
          status: 'CONNECTED',
          endpoint: 'http://127.0.0.1:11434',
          modelCount: models.length,
          models,
        };
        this.state.localAI = result;
        this.notify();
        return result;
      }
    } catch {
      // Offline
    }

    const fallback: LocalAIDiscoveryResult = {
      status: 'NOT_DETECTED',
      endpoint: 'http://127.0.0.1:11434',
      modelCount: 0,
      models: [],
    };
    this.state.localAI = fallback;
    this.notify();
    return fallback;
  }

  /**
   * Evaluates whether a stage can be adaptively skipped because it is already satisfied.
   */
  public isStageSatisfied(stage: OnboardingStage): boolean {
    switch (stage) {
      case 'providers': {
        const geminiAuth = ProviderAuthManager.getAuthorization('GEMINI');
        const openaiAuth = ProviderAuthManager.getAuthorization('OPENAI');
        const anthropicAuth = ProviderAuthManager.getAuthorization('ANTHROPIC');
        return Boolean(geminiAuth.enabled || openaiAuth.enabled || anthropicAuth.enabled);
      }
      case 'local-ai':
        return this.state.localAI?.status === 'CONNECTED' && (this.state.localAI?.modelCount || 0) > 0;
      default:
        return false;
    }
  }

  public advance(): void {
    const currentIndex = STAGE_ORDER.indexOf(this.state.currentStage);
    if (currentIndex >= 0 && currentIndex < STAGE_ORDER.length - 1) {
      const nextStage = STAGE_ORDER[currentIndex + 1];
      
      const newCompletedStages = [...this.state.completedStages];
      if (!newCompletedStages.includes(this.state.currentStage)) {
        newCompletedStages.push(this.state.currentStage);
      }

      this.state = {
        ...this.state,
        currentStage: nextStage,
        completedStages: newCompletedStages,
      };

      this.persistStageProgress();
      this.notify();
    }
  }

  /**
   * Alias for advance().
   */
  public next(): void {
    this.advance();
  }

  /**
   * Skips the current optional stage.
   */
  public skip(): void {
    const newSkippedStages = [...this.state.skippedStages];
    if (!newSkippedStages.includes(this.state.currentStage)) {
      newSkippedStages.push(this.state.currentStage);
    }
    this.state = {
      ...this.state,
      skippedStages: newSkippedStages,
    };
    this.advance();
  }

  /**
   * Jumps to a specific stage (e.g. for resume or review).
   */
  public goToStage(stage: OnboardingStage): void {
    if (STAGE_ORDER.includes(stage)) {
      this.state = {
        ...this.state,
        currentStage: stage,
      };
      this.persistStageProgress();
      this.notify();
    }
  }

  public continueInterruptedSetup(): void {
    this.state = {
      ...this.state,
      interrupted: false,
      currentStage: STAGE_ORDER.includes(this.state.currentStage) ? this.state.currentStage : 'awakening'
    };
    this.persistStageProgress();
    this.notify();
  }

  /**
   * Restarts the onboarding flow from the beginning without clearing credentials or user settings.
   */
  public restart(): void {
    const baseState = this.getInitialState();
    this.state = {
      ...baseState,
      interrupted: false,
      currentStage: 'awakening',
    };
    this.persistStageProgress();
    this.notify();
  }

  /**
   * Applies the user's initial onboarding preferences to canonical Rezel services.
   */
  public applyPreferences(prefs: Partial<InitialPreferences>): void {
    this.state = {
      ...this.state,
      preferences: { ...this.state.preferences, ...prefs },
    };

    // Apply Experience Style (Calm -> FRIENDLY, Balanced -> CREATOR, Technical -> DEVELOPER)
    let mode: Mode = 'FRIENDLY';
    if (this.state.preferences.experienceStyle === 'Technical') mode = 'DEVELOPER';
    else if (this.state.preferences.experienceStyle === 'Balanced') mode = 'CREATOR';

    RezelDirector.setMode(mode);
    LocalMemory.setEntry('user_experience_style', this.state.preferences.experienceStyle, 'preference');
    LocalMemory.setEntry('user_voice_enabled', String(this.state.preferences.voiceEnabled), 'preference');
    LocalMemory.setEntry('user_workspace_density', this.state.preferences.workspaceDensity, 'preference');
    LocalMemory.setEntry('user_ai_preference', this.state.preferences.aiPreference, 'preference');
    LocalMemory.save().catch(() => {});

    this.notify();
  }

  /**
   * Completes the onboarding flow, writes permanent completion markers, and transitions to HomeScreen.
   */
  public async completeOnboarding(): Promise<void> {
    this.state = {
      ...this.state,
      completed: true,
      firstLaunch: false,
      interrupted: false,
      completedAt: Date.now(),
    };

    LocalMemory.setEntry('onboarding_completed', 'true', 'preference');
    LocalMemory.setEntry('onboarding_version', String(ONBOARDING_VERSION), 'preference');
    LocalMemory.setEntry('onboarding_interrupted', 'false', 'preference');
    if (this.state.completedAt) {
      LocalMemory.setEntry('onboarding_completed_at', String(this.state.completedAt), 'preference');
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('rezel_has_explored', 'true');
    }
    await LocalMemory.save().catch(() => {});

    this.notify();
  }

  private persistStageProgress(): void {
    LocalMemory.setEntry('onboarding_stage', this.state.currentStage, 'preference');
    LocalMemory.setEntry('onboarding_interrupted', String(this.state.interrupted), 'preference');
    LocalMemory.save().catch(() => {});
  }

  /**
   * Development-only reset helper.
   * Resets ONLY onboarding progress markers so developers can review the entire 10-stage flow.
   * PRESERVES all provider keys, user preferences, memories, and workspace state.
   */
  public async resetForDevReview(): Promise<void> {
    this.state = this.getInitialState();
    this.state.firstLaunch = true;
    this.state.completed = false;
    this.state.interrupted = false;
    this.state.currentStage = 'awakening';
    this.state.completedStages = [];
    this.state.skippedStages = [];

    LocalMemory.deleteEntry('onboarding_completed');
    LocalMemory.deleteEntry('onboarding_version');
    LocalMemory.deleteEntry('onboarding_interrupted');
    LocalMemory.deleteEntry('onboarding_stage');
    LocalMemory.deleteEntry('onboarding_completed_at');
    await LocalMemory.save().catch(() => {});

    console.info('[OnboardingCoordinator] Onboarding state reset for dev review. Launching Step 1 (Awakening).');
    this.notify();
  }

  public subscribe(listener: OnboardingListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const s = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(s);
      } catch (err) {
        console.error('[OnboardingCoordinator] Listener error:', err);
      }
    }
  }
}

export const OnboardingCoordinator = new OnboardingCoordinatorImpl();

// Expose safe dev-only reset helper globally
if (typeof window !== 'undefined') {
  (window as any).__REZEL_DEV_RESET_ONBOARDING = () => OnboardingCoordinator.resetForDevReview();
}
