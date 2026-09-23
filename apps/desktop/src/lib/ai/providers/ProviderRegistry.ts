/**
 * Rezel OS — Unified Provider Registry (Milestone 11.2A)
 *
 * Central registry managing configured AI provider packages, adapters,
 * and capability discovery across Chat and Reasoning domains.
 */

import type { VendorProviderPackage, ProviderVendor } from './types';
import { ModelCatalog } from './ModelCatalog';
import { GeminiVendorPackage } from './adapters/GeminiAdapter';
import { OpenAIVendorPackage } from './adapters/OpenAIAdapter';
import { AnthropicVendorPackage } from './adapters/AnthropicAdapter';
import { OllamaVendorPackage } from './adapters/OllamaAdapter';

export class ProviderRegistryImpl {
  private packages = new Map<ProviderVendor, VendorProviderPackage>();

  constructor() {
    this.initDefaultPackages();
  }

  private initDefaultPackages(): void {
    this.registerPackage(new GeminiVendorPackage());
    this.registerPackage(new OpenAIVendorPackage());
    this.registerPackage(new AnthropicVendorPackage());
    this.registerPackage(new OllamaVendorPackage());
  }

  registerPackage(pkg: VendorProviderPackage): void {
    if (!pkg || !pkg.vendor) {
      throw new Error('[ProviderRegistry] Invalid vendor package');
    }
    this.packages.set(pkg.vendor, pkg);
  }

  getPackage(vendor: ProviderVendor): VendorProviderPackage | undefined {
    return this.packages.get(vendor);
  }

  listPackages(): VendorProviderPackage[] {
    return Array.from(this.packages.values());
  }

  hasPackage(vendor: ProviderVendor): boolean {
    return this.packages.has(vendor);
  }

  unregisterPackage(vendor: ProviderVendor): boolean {
    return this.packages.delete(vendor);
  }

  /**
   * Discovers all currently registered vendors and their available models.
   */
  async discoverAll(): Promise<Array<{ vendor: ProviderVendor; displayName: string; modelsCount: number }>> {
    const results: Array<{ vendor: ProviderVendor; displayName: string; modelsCount: number }> = [];
    const vendors: ProviderVendor[] = ['GEMINI', 'OPENAI', 'ANTHROPIC', 'OLLAMA', 'LOCAL'];

    for (const vendor of vendors) {
      const models = ModelCatalog.getModelsByVendor(vendor);
      results.push({
        vendor,
        displayName: vendor.charAt(0) + vendor.slice(1).toLowerCase(),
        modelsCount: models.length,
      });
    }

    return results;
  }
}

export const ProviderRegistry = new ProviderRegistryImpl();
