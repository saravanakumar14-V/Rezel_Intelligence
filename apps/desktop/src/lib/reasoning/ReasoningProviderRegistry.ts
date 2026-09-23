import type { ReasoningProvider } from './types';
import { GeminiReasoningProvider } from './providers/GeminiReasoningProvider';
import { OpenAIReasoningProvider } from './providers/OpenAIReasoningProvider';
import { LocalReasoningProvider } from './providers/LocalReasoningProvider';
import { DeterministicDevelopmentProvider } from './providers/DeterministicDevelopmentProvider';

export class ReasoningProviderRegistryImpl {
  private providers = new Map<string, ReasoningProvider>();

  constructor() {
    this.registerDefaults();
  }

  /**
   * Registers default production providers and checks for dev injection flag.
   */
  registerDefaults(): void {
    if (!this.providers.has('gemini-default')) {
      this.providers.set('gemini-default', new GeminiReasoningProvider());
    }
    if (!this.providers.has('openai-default')) {
      this.providers.set('openai-default', new OpenAIReasoningProvider());
    }
    if (!this.providers.has('local-default')) {
      this.providers.set('local-default', new LocalReasoningProvider());
    }

    this.checkAndRegisterDevProvider();
  }

  /**
   * Checks if development reasoning injection flag is active.
   * If active, registers DeterministicDevelopmentProvider (priority 999).
   */
  checkAndRegisterDevProvider(force?: boolean): boolean {
    const proc = typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined;
    const isDevFlagEnabled =
      force ||
      Boolean(
        (typeof import.meta !== 'undefined' &&
          (import.meta.env?.VITE_REZEL_DEV_REASONING_PROVIDER === 'true' ||
           import.meta.env?.VITE_REZEL_DEV_REASONING_PROVIDER === true)) ||
        (typeof window !== 'undefined' &&
          (window as any).__REZEL_DEV_REASONING__ === true) ||
        (proc &&
          (proc.env?.VITE_REZEL_DEV_REASONING_PROVIDER === 'true' ||
           proc.env?.REZEL_DEV_REASONING_PROVIDER === 'true'))
      );

    if (isDevFlagEnabled) {
      if (!this.providers.has('dev-deterministic')) {
        this.providers.set('dev-deterministic', new DeterministicDevelopmentProvider());
      }
      return true;
    }
    return false;
  }

  /**
   * Registers a reasoning provider.
   * Throws an error if a provider with the same ID is already registered.
   */
  register(provider: ReasoningProvider): void {
    if (!provider || !provider.id) {
      throw new Error('[ReasoningProviderRegistry] Invalid provider object');
    }
    if (this.providers.has(provider.id)) {
      throw new Error(`[ReasoningProviderRegistry] Provider already registered: ${provider.id}`);
    }
    this.providers.set(provider.id, provider);
  }

  /**
   * Safely unregisters a provider by ID.
   * Returns true if provider was found and removed, false otherwise.
   */
  unregister(id: string): boolean {
    return this.providers.delete(id);
  }

  /**
   * Retrieves a provider by ID.
   */
  get(id: string): ReasoningProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Returns all registered providers in deterministic order.
   */
  getAll(): ReasoningProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Asynchronously retrieves all currently available providers,
   * sorted deterministically by priority (lower priority number = higher precedence).
   */
  async getAvailable(): Promise<ReasoningProvider[]> {
    const all = this.getAll();
    const availabilityChecks = await Promise.all(
      all.map(async (provider) => {
        try {
          const available = await provider.isAvailable();
          return available ? provider : null;
        } catch {
          return null;
        }
      })
    );

    const availableProviders = availabilityChecks.filter(
      (p): p is ReasoningProvider => p !== null
    );

    // Sort by priority ascending (1 = highest priority, 10 = lower priority)
    return availableProviders.sort((a, b) => a.config.priority - b.config.priority);
  }

  /**
   * Clears all registered providers (primarily for unit tests).
   */
  clear(): void {
    this.providers.clear();
  }
}

export const ReasoningProviderRegistry = new ReasoningProviderRegistryImpl();
