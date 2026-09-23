/**
 * Rezel OS — Provider Tool-Name Policy & Canonical Identity Registry (Milestone 11.2B / P0-5)
 *
 * Enforces provider-specific function-calling naming rules:
 * - Gemini: ^[a-zA-Z_][a-zA-Z0-9_.:-]{0,127}$ (max 128 chars)
 * - OpenAI: ^[a-zA-Z0-9_-]{1,64}$ (max 64 chars)
 * - Anthropic: ^[a-zA-Z0-9_-]{1,64}$ (max 64 chars)
 * - Ollama: ^[a-zA-Z0-9_.:-]{1,128}$ (max 128 chars)
 *
 * Responsibilities:
 * 1. Validates tool names against provider contracts prior to dispatch.
 * 2. Normalizes canonical Rezel tool IDs into provider-compliant names without mutating canonical identity.
 * 3. Detects collisions (when different canonical IDs normalize to the same provider function name).
 * 4. Maintains bidirectional mapping (canonical ID <-> provider name) for reverse lookup upon function return.
 */

import { ProviderError } from './adapters/ProviderError';
import type { ProviderVendor } from './types';

export interface ToolNameValidationResult {
  valid: boolean;
  reason?: string;
}

export class ProviderToolNamePolicy {
  // Global bidirectional cache per vendor: vendor -> (providerName -> canonicalId)
  private static providerToCanonical = new Map<string, Map<string, string>>();
  private static canonicalToProvider = new Map<string, Map<string, string>>();

  /**
   * Validates a tool name against provider naming constraints.
   */
  static validate(name: string, vendor: ProviderVendor): ToolNameValidationResult {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return { valid: false, reason: 'Tool name cannot be empty or undefined' };
    }

    switch (vendor) {
      case 'GEMINI': {
        if (name.length > 128) {
          return { valid: false, reason: `Gemini tool name exceeds 128 characters (length: ${name.length})` };
        }
        if (!/^[a-zA-Z_]/.test(name)) {
          return { valid: false, reason: `Gemini tool name must start with a letter or underscore: "${name}"` };
        }
        if (!/^[a-zA-Z_][a-zA-Z0-9_.:-]*$/.test(name)) {
          return { valid: false, reason: `Gemini tool name contains invalid characters: "${name}" (allowed: [a-zA-Z0-9_.:-])` };
        }
        return { valid: true };
      }

      case 'OPENAI': {
        if (name.length > 64) {
          return { valid: false, reason: `OpenAI tool name exceeds 64 characters (length: ${name.length})` };
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
          return { valid: false, reason: `OpenAI tool name contains invalid characters: "${name}" (allowed: [a-zA-Z0-9_-])` };
        }
        return { valid: true };
      }

      case 'ANTHROPIC': {
        if (name.length > 64) {
          return { valid: false, reason: `Anthropic tool name exceeds 64 characters (length: ${name.length})` };
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
          return { valid: false, reason: `Anthropic tool name contains invalid characters: "${name}" (allowed: [a-zA-Z0-9_-])` };
        }
        return { valid: true };
      }

      case 'OLLAMA':
      case 'LOCAL': {
        if (name.length > 128) {
          return { valid: false, reason: `Ollama tool name exceeds 128 characters (length: ${name.length})` };
        }
        if (!/^[a-zA-Z0-9_.:-]+$/.test(name)) {
          return { valid: false, reason: `Ollama tool name contains invalid characters: "${name}"` };
        }
        return { valid: true };
      }

      default:
        return { valid: true };
    }
  }

  /**
   * Asserts that a tool name is valid for a provider, throwing ProviderError if invalid.
   */
  static assertValid(name: string, vendor: ProviderVendor): void {
    const res = this.validate(name, vendor);
    if (!res.valid) {
      throw new ProviderError({
        code: 'INVALID_REQUEST',
        message: `[${vendor}::INVALID_TOOL_SCHEMA] ${res.reason}`,
        vendor,
      });
    }
  }

  /**
   * Normalizes a canonical Rezel tool identifier to a provider-compliant function name.
   */
  static normalize(canonicalId: string, vendor: ProviderVendor): string {
    if (!canonicalId || typeof canonicalId !== 'string' || canonicalId.trim().length === 0) {
      throw new ProviderError({
        code: 'INVALID_REQUEST',
        message: `[${vendor}::INVALID_TOOL_SCHEMA] Cannot normalize empty tool identifier`,
        vendor,
      });
    }

    let cleaned = canonicalId.trim();

    switch (vendor) {
      case 'GEMINI': {
        // Replace disallowed characters with underscore (allow a-z, A-Z, 0-9, _, ., :, -)
        cleaned = cleaned.replace(/[^a-zA-Z0-9_.:-]/g, '_');
        // Must start with letter or underscore
        if (!/^[a-zA-Z_]/.test(cleaned)) {
          cleaned = '_' + cleaned;
        }
        // Max 128 characters
        if (cleaned.length > 128) {
          cleaned = cleaned.slice(0, 128);
        }
        break;
      }

      case 'OPENAI':
      case 'ANTHROPIC': {
        // Replace disallowed characters with underscore (allow a-z, A-Z, 0-9, _, -)
        cleaned = cleaned.replace(/[^a-zA-Z0-9_-]/g, '_');
        // Max 64 characters
        if (cleaned.length > 64) {
          cleaned = cleaned.slice(0, 64);
        }
        break;
      }

      case 'OLLAMA':
      case 'LOCAL': {
        cleaned = cleaned.replace(/[^a-zA-Z0-9_.:-]/g, '_');
        if (cleaned.length > 128) {
          cleaned = cleaned.slice(0, 128);
        }
        break;
      }
    }

    // Final assertion
    this.assertValid(cleaned, vendor);
    return cleaned;
  }

  /**
   * Registers a batch of tools for a vendor, validating schemas and detecting naming collisions.
   * Returns a map of canonicalId -> providerFunctionName.
   */
  static registerTools(
    tools: Array<{ id?: string; name?: string }>,
    vendor: ProviderVendor
  ): Map<string, string> {
    if (!this.providerToCanonical.has(vendor)) {
      this.providerToCanonical.set(vendor, new Map());
      this.canonicalToProvider.set(vendor, new Map());
    }

    const p2c = this.providerToCanonical.get(vendor)!;
    const c2p = this.canonicalToProvider.get(vendor)!;
    const batchResult = new Map<string, string>();
    const seenInBatch = new Map<string, string>(); // providerName -> canonicalId

    for (const tool of tools) {
      const canonicalId = tool.id || tool.name;
      if (!canonicalId) {
        throw new ProviderError({
          code: 'INVALID_REQUEST',
          message: `[${vendor}::INVALID_TOOL_SCHEMA] Tool missing canonical id and name`,
          vendor,
        });
      }

      const providerName = this.normalize(canonicalId, vendor);

      // Collision check within batch
      if (seenInBatch.has(providerName) && seenInBatch.get(providerName) !== canonicalId) {
        throw new ProviderError({
          code: 'INVALID_REQUEST',
          message: `[${vendor}::TOOL_NAME_COLLISION] Tools "${seenInBatch.get(providerName)}" and "${canonicalId}" both normalize to provider function name "${providerName}"`,
          vendor,
        });
      }

      seenInBatch.set(providerName, canonicalId);
      p2c.set(providerName, canonicalId);
      c2p.set(canonicalId, providerName);
      batchResult.set(canonicalId, providerName);
    }

    return batchResult;
  }

  /**
   * Resolves a provider function name returned by an LLM back to the canonical Rezel tool ID.
   */
  static resolveCanonicalId(providerFunctionName: string, vendor?: ProviderVendor): string {
    if (!providerFunctionName) return providerFunctionName;

    if (vendor && this.providerToCanonical.has(vendor)) {
      const mapped = this.providerToCanonical.get(vendor)!.get(providerFunctionName);
      if (mapped) return mapped;
    }

    // Search across all vendors if vendor is omitted
    for (const p2c of this.providerToCanonical.values()) {
      if (p2c.has(providerFunctionName)) {
        return p2c.get(providerFunctionName)!;
      }
    }

    return providerFunctionName;
  }

  /**
   * Resolves a canonical Rezel tool ID to the provider-compliant function name.
   */
  static getProviderName(canonicalId: string, vendor: ProviderVendor): string {
    if (this.canonicalToProvider.has(vendor)) {
      const mapped = this.canonicalToProvider.get(vendor)!.get(canonicalId);
      if (mapped) return mapped;
    }
    return this.normalize(canonicalId, vendor);
  }

  /**
   * Clears registered tool mappings (primarily for testing).
   */
  static clear(): void {
    this.providerToCanonical.clear();
    this.canonicalToProvider.clear();
  }
}
