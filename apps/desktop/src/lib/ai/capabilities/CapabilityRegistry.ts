import type { Capability } from './types';
import { ToolSchemaTranslator } from '../providers/adapters/ToolSchemaTranslator';

export class CapabilityRegistryImpl {
  private readonly capabilities = new Map<string, Capability<any, any>>();

  register(capability: Capability<any, any>): void {
    if (this.capabilities.has(capability.id)) {
      throw new Error(`Capability with id '${capability.id}' is already registered.`);
    }
    this.capabilities.set(capability.id, capability);
  }

  unregister(id: string): boolean {
    return this.capabilities.delete(id);
  }

  get(id: string): Capability<any, any> | undefined {
    return this.capabilities.get(id);
  }

  has(id: string): boolean {
    return this.capabilities.has(id);
  }

  getAll(): Capability<any, any>[] {
    return Array.from(this.capabilities.values());
  }

  clear(): void {
    this.capabilities.clear();
  }

  get size(): number {
    return this.capabilities.size;
  }

  toGeminiFunctionDeclarations(): any[] {
    return ToolSchemaTranslator.toGemini(this.getAll())[0]?.functionDeclarations || [];
  }
}


export const CapabilityRegistry = new CapabilityRegistryImpl();
