import { ReasoningProviderRegistry, ReasoningProviderRegistryImpl } from './ReasoningProviderRegistry';
import type { ReasoningProvider } from './types';
import { ReasoningProviderError } from './types';

export interface ReasoningProviderSelectionOptions {
  preferredProvider?: string;
  requiredContextTokens?: number;
  requireStructuredOutput?: boolean;
  maxCostTier?: 'FREE' | 'LOW' | 'MEDIUM' | 'HIGH';
  excludeProviderIds?: string[];
}

const COST_TIER_RANK: Record<'FREE' | 'LOW' | 'MEDIUM' | 'HIGH', number> = {
  FREE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

export class ReasoningRouterImpl {
  private registry: ReasoningProviderRegistryImpl;

  constructor(registry: ReasoningProviderRegistryImpl = ReasoningProviderRegistry) {
    this.registry = registry;
  }

  private isDevReasoningEnabled(): boolean {
    const proc = typeof globalThis !== 'undefined' ? (globalThis as any).process : undefined;
    return Boolean(
      (typeof import.meta !== 'undefined' &&
        (import.meta.env?.VITE_REZEL_DEV_REASONING_PROVIDER === 'true' ||
         import.meta.env?.VITE_REZEL_DEV_REASONING_PROVIDER === true)) ||
      (typeof window !== 'undefined' &&
        (window as any).__REZEL_DEV_REASONING__ === true) ||
      (proc &&
        (proc.env?.VITE_REZEL_DEV_REASONING_PROVIDER === 'true' ||
         proc.env?.REZEL_DEV_REASONING_PROVIDER === 'true'))
    );
  }

  /**
   * Selects the best available reasoning provider based on constraints.
   *
   * Selection hierarchy:
   * 0. Development/test injection (if explicit DEV flag is active).
   * 1. Preferred provider (if specified, available, and compatible).
   * 2. Available providers filtered by context token capacity, structured output support, and cost tier.
   * 3. Sorted by priority (ascending).
   *
   * Throws ReasoningProviderError('NO_ELIGIBLE_PROVIDER') if no matching provider is found.
   */
  async selectProvider(
    options: ReasoningProviderSelectionOptions = {}
  ): Promise<ReasoningProvider> {
    const isDevEnabled = this.isDevReasoningEnabled();

    // 0. Development/Test provider routing
    if (isDevEnabled) {
      this.registry.checkAndRegisterDevProvider(true);
      const devProvider = this.registry.get('dev-deterministic');
      if (
        devProvider &&
        (!options.excludeProviderIds || !options.excludeProviderIds.includes('dev-deterministic')) &&
        (!options.preferredProvider ||
          options.preferredProvider === 'gemini-default' ||
          options.preferredProvider === 'dev-deterministic')
      ) {
        console.info(`[ReasoningRouter] Dev reasoning flag: ${isDevEnabled} | Selected provider: ${devProvider.id} (${devProvider.config.displayName})`);
        return devProvider;
      }
    }

    const rawAvailable = await this.registry.getAvailable();
    const available = options.excludeProviderIds && options.excludeProviderIds.length > 0
      ? rawAvailable.filter((p) => !options.excludeProviderIds!.includes(p.id))
      : rawAvailable;

    if (available.length === 0) {
      throw new ReasoningProviderError(
        'NO_ELIGIBLE_PROVIDER',
        'No reasoning providers are currently available'
      );
    }

    // 1. Try preferred provider first if requested
    if (options.preferredProvider) {
      const preferred = available.find((p) => p.id === options.preferredProvider);
      if (preferred) {
        const passesTokens =
          !options.requiredContextTokens ||
          preferred.config.maxContextTokens >= options.requiredContextTokens;
        const passesStructured =
          !options.requireStructuredOutput || preferred.config.supportsStructuredOutput;
        const passesCost =
          !options.maxCostTier ||
          COST_TIER_RANK[preferred.config.costTier] <= COST_TIER_RANK[options.maxCostTier];

        if (passesTokens && passesStructured && passesCost) {
          return preferred;
        }
      }
      // If preferred is unavailable or ineligible, fall through gracefully to selection
    }

    // 2. Filter remaining available providers
    const eligible = available.filter((provider) => {
      if (
        options.requiredContextTokens &&
        provider.config.maxContextTokens < options.requiredContextTokens
      ) {
        return false;
      }
      if (
        options.requireStructuredOutput &&
        !provider.config.supportsStructuredOutput
      ) {
        return false;
      }
      if (
        options.maxCostTier &&
        COST_TIER_RANK[provider.config.costTier] > COST_TIER_RANK[options.maxCostTier]
      ) {
        return false;
      }
      return true;
    });

    if (eligible.length === 0) {
      throw new ReasoningProviderError(
        'NO_ELIGIBLE_PROVIDER',
        'No eligible reasoning provider matched the requested criteria'
      );
    }

    // Sort by priority ascending (already sorted by getAvailable, but ensure deterministic top pick)
    eligible.sort((a, b) => a.config.priority - b.config.priority);

    return eligible[0];
  }
}

export const ReasoningRouter = new ReasoningRouterImpl();
