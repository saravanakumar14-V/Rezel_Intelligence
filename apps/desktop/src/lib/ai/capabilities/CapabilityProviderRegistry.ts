import type { CapabilityProvider } from './types';
import { CapabilityRegistry } from './CapabilityRegistry';

export class CapabilityProviderRegistryImpl {
  private readonly providers = new Map<string, CapabilityProvider>();

  register(provider: CapabilityProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`Provider with id '${provider.id}' is already registered.`);
    }
    
    // Register the provider
    this.providers.set(provider.id, provider);

    // Register all its capabilities
    const capabilities = provider.capabilities();
    for (const cap of capabilities) {
      // If a capability registration fails (e.g. duplicate), we should probably
      // roll back or log, but for now we let it throw.
      CapabilityRegistry.register(cap);
    }
  }

  unregister(providerId: string): boolean {
    const provider = this.providers.get(providerId);
    if (!provider) {
      return false;
    }

    // Unregister all its capabilities
    const capabilities = provider.capabilities();
    for (const cap of capabilities) {
      CapabilityRegistry.unregister(cap.id);
    }

    // Remove the provider
    return this.providers.delete(providerId);
  }

  get(providerId: string): CapabilityProvider | undefined {
    return this.providers.get(providerId);
  }

  has(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  getAll(): CapabilityProvider[] {
    return Array.from(this.providers.values());
  }

  clear(): void {
    // Unregister all capabilities from all providers
    for (const provider of this.providers.values()) {
      for (const cap of provider.capabilities()) {
        CapabilityRegistry.unregister(cap.id);
      }
    }
    this.providers.clear();
  }
}

export const CapabilityProviderRegistry = new CapabilityProviderRegistryImpl();
