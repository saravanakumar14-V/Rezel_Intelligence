/**
 * Rezel OS — Cost Guard (Milestone 11.2A)
 *
 * Pre-execution token and financial estimation safety guard.
 * Strictly non-authoritative estimation to prevent surprise large expenditures.
 */

import type { ModelPricing, CostEstimate, UserProviderAuthorization } from './types';

export class CostGuardImpl {
  /**
   * Estimates cost of a request prior to provider dispatch.
   */
  estimate(
    pricing: ModelPricing,
    estimatedInputTokens: number,
    maxOutputTokens: number = 4096,
    auth: UserProviderAuthorization
  ): CostEstimate {
    if (pricing.costTier === 'FREE' || (pricing.inputPerMillionUSD === 0 && pricing.outputPerMillionUSD === 0)) {
      return {
        estimatedCostUSD: 0,
        isExceedingRequestLimit: false,
        isExceedingDailyLimit: false,
        costTier: 'FREE',
      };
    }

    const inputCost = (estimatedInputTokens / 1_000_000) * pricing.inputPerMillionUSD;
    const outputCost = (maxOutputTokens / 1_000_000) * pricing.outputPerMillionUSD;
    const totalEstimate = Math.round((inputCost + outputCost) * 100_000) / 100_000;

    const isExceedingRequestLimit = totalEstimate > auth.maxCostPerRequestUSD;
    const isExceedingDailyLimit = (auth.currentDailySpentUSD + totalEstimate) > auth.maxDailyCostUSD;

    return {
      estimatedCostUSD: totalEstimate,
      isExceedingRequestLimit,
      isExceedingDailyLimit,
      costTier: pricing.costTier,
    };
  }
}

export const CostGuard = new CostGuardImpl();
