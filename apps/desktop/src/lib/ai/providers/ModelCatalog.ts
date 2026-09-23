/**
 * Rezel OS — Data-Driven Model Catalog (Milestone 11.2A)
 *
 * Provides extensible, declarative model metadata, capability matrices,
 * context limits, and token pricing rates without hardcoded routing checks.
 */

import type { ModelMetadata, ProviderVendor } from './types';

export class ModelCatalogImpl {
  private models = new Map<string, ModelMetadata>();

  constructor() {
    this.registerDefaultCatalog();
  }

  private registerDefaultCatalog(): void {
    // ─── Google Gemini ───────────────────────────────────────────────────────
    this.registerModel({
      id: 'gemini-3.6-flash',
      vendor: 'GEMINI',
      displayName: 'Gemini 3.6 Flash',
      capabilities: {
        text: true,
        vision: true,
        audioInput: true,
        audioOutput: true,
        toolCalling: true,
        structuredOutput: true,
        streaming: true,
        systemPrompt: true,
        extendedThinking: true,
        maxContextTokens: 1_048_576,
        maxOutputTokens: 8192,
        supportsComputerUse: false,
      },
      pricing: {
        inputPerMillionUSD: 0.075,
        outputPerMillionUSD: 0.30,
        costTier: 'LOW',
      },
      supportedTaskCategories: ['CONVERSATION', 'REASONING', 'CODING', 'VISION', 'AUTOMATION', 'SYSTEM'],
      isLocal: false,
    });

    this.registerModel({
      id: 'gemini-1.5-pro',
      vendor: 'GEMINI',
      displayName: 'Gemini 1.5 Pro',
      capabilities: {
        text: true,
        vision: true,
        audioInput: true,
        audioOutput: false,
        toolCalling: true,
        structuredOutput: true,
        streaming: true,
        systemPrompt: true,
        extendedThinking: true,
        maxContextTokens: 2_097_152,
        maxOutputTokens: 8192,
        supportsComputerUse: false,
      },
      pricing: {
        inputPerMillionUSD: 1.25,
        outputPerMillionUSD: 5.00,
        costTier: 'MEDIUM',
      },
      supportedTaskCategories: ['CONVERSATION', 'REASONING', 'CODING', 'VISION', 'AUTOMATION'],
      isLocal: false,
    });



    // ─── OpenAI ──────────────────────────────────────────────────────────────
    this.registerModel({
      id: 'gpt-4o',
      vendor: 'OPENAI',
      displayName: 'GPT-4o',
      capabilities: {
        text: true,
        vision: true,
        audioInput: false,
        audioOutput: false,
        toolCalling: true,
        structuredOutput: true,
        streaming: true,
        systemPrompt: true,
        extendedThinking: false,
        maxContextTokens: 128_000,
        maxOutputTokens: 16_384,
        supportsComputerUse: false,
      },
      pricing: {
        inputPerMillionUSD: 2.50,
        outputPerMillionUSD: 10.00,
        costTier: 'MEDIUM',
      },
      supportedTaskCategories: ['CONVERSATION', 'REASONING', 'CODING', 'VISION', 'AUTOMATION'],
      isLocal: false,
    });

    this.registerModel({
      id: 'gpt-4o-mini',
      vendor: 'OPENAI',
      displayName: 'GPT-4o Mini',
      capabilities: {
        text: true,
        vision: true,
        audioInput: false,
        audioOutput: false,
        toolCalling: true,
        structuredOutput: true,
        streaming: true,
        systemPrompt: true,
        extendedThinking: false,
        maxContextTokens: 128_000,
        maxOutputTokens: 16_384,
        supportsComputerUse: false,
      },
      pricing: {
        inputPerMillionUSD: 0.15,
        outputPerMillionUSD: 0.60,
        costTier: 'LOW',
      },
      supportedTaskCategories: ['CONVERSATION', 'CODING', 'VISION', 'SYSTEM'],
      isLocal: false,
    });

    this.registerModel({
      id: 'o3-mini',
      vendor: 'OPENAI',
      displayName: 'o3-mini (Reasoning)',
      capabilities: {
        text: true,
        vision: false,
        audioInput: false,
        audioOutput: false,
        toolCalling: true,
        structuredOutput: true,
        streaming: true,
        systemPrompt: true,
        extendedThinking: true,
        maxContextTokens: 200_000,
        maxOutputTokens: 100_000,
        supportsComputerUse: false,
      },
      pricing: {
        inputPerMillionUSD: 1.10,
        outputPerMillionUSD: 4.40,
        costTier: 'MEDIUM',
      },
      supportedTaskCategories: ['REASONING', 'CODING', 'AUTOMATION'],
      isLocal: false,
    });

    // ─── Anthropic Claude ────────────────────────────────────────────────────
    this.registerModel({
      id: 'claude-3-7-sonnet-20250219',
      vendor: 'ANTHROPIC',
      displayName: 'Claude 3.7 Sonnet',
      capabilities: {
        text: true,
        vision: true,
        audioInput: false,
        audioOutput: false,
        toolCalling: true,
        structuredOutput: true,
        streaming: true,
        systemPrompt: true,
        extendedThinking: true,
        maxContextTokens: 200_000,
        maxOutputTokens: 64_000,
        supportsComputerUse: true,
      },
      pricing: {
        inputPerMillionUSD: 3.00,
        outputPerMillionUSD: 15.00,
        costTier: 'HIGH',
      },
      supportedTaskCategories: ['CONVERSATION', 'REASONING', 'CODING', 'VISION', 'AUTOMATION', 'SYSTEM'],
      isLocal: false,
    });

    this.registerModel({
      id: 'claude-3-5-haiku-20241022',
      vendor: 'ANTHROPIC',
      displayName: 'Claude 3.5 Haiku',
      capabilities: {
        text: true,
        vision: false,
        audioInput: false,
        audioOutput: false,
        toolCalling: true,
        structuredOutput: true,
        streaming: true,
        systemPrompt: true,
        extendedThinking: false,
        maxContextTokens: 200_000,
        maxOutputTokens: 8192,
        supportsComputerUse: false,
      },
      pricing: {
        inputPerMillionUSD: 0.80,
        outputPerMillionUSD: 4.00,
        costTier: 'LOW',
      },
      supportedTaskCategories: ['CONVERSATION', 'CODING', 'FAST' as any],
      isLocal: false,
    });


  }

  registerModel(model: ModelMetadata): void {
    this.models.set(model.id, model);
  }

  getModel(id: string): ModelMetadata | undefined {
    return this.models.get(id);
  }

  listModels(): ModelMetadata[] {
    return Array.from(this.models.values());
  }

  getModelsByVendor(vendor: ProviderVendor): ModelMetadata[] {
    return this.listModels().filter((m) => m.vendor === vendor && !m.isDeprecated);
  }

  filterModels(predicate: (m: ModelMetadata) => boolean): ModelMetadata[] {
    return this.listModels().filter(predicate);
  }

  getDefaultModel(vendor: ProviderVendor): ModelMetadata | undefined {
    const models = this.getModelsByVendor(vendor);
    return models[0];
  }
}

export const ModelCatalog = new ModelCatalogImpl();
