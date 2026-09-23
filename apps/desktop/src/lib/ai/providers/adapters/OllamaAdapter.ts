/**
 * Rezel OS — Ollama Local Provider Adapter (Milestone 11.2B)
 *
 * Implements ChatAIProvider and ReasoningAIProvider for local Ollama endpoints.
 * Supports local model discovery, NDJSON streaming, JSON format constraints,
 * and capability-aware local tool calling.
 */

import { ProviderHealthManager } from '../ProviderHealthManager';
import { fetchWithTimeout } from '../utils/fetchTimeout';
import { ModelCatalog } from '../ModelCatalog';
import { ToolSchemaTranslator } from './ToolSchemaTranslator';
import { ProviderError } from './ProviderError';
import type {
  ChatAIProvider,
  ReasoningAIProvider,
  VendorProviderPackage,
  ModelMetadata,
  AvailabilityRecord,
  UnifiedMessage,
  UnifiedChatOptions,
  UnifiedStreamChunk,
  UnifiedReasoningRequest,
  UnifiedReasoningResult,
} from '../types';

function getSafeFetch(customFetch?: typeof fetch): typeof fetch {
  if (customFetch) {
    return (input: RequestInfo | URL, init?: RequestInit) => customFetch(input, init);
  }
  return (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init);
}

export class OllamaChatAdapter implements ChatAIProvider {
  readonly vendor = 'OLLAMA' as const;
  readonly displayName = 'Ollama Local Chat Adapter';
  private endpoint: string;
  private fetchFn: typeof fetch;

  constructor(options?: { endpoint?: string; fetchFn?: typeof fetch }) {
    this.endpoint = options?.endpoint || 'http://127.0.0.1:11434';
    this.fetchFn = getSafeFetch(options?.fetchFn);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await this.fetchFn(`${this.endpoint}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout ? AbortSignal.timeout(1500) : undefined,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  getHealth(): AvailabilityRecord {
    return ProviderHealthManager.getProviderHealth('OLLAMA');
  }

  async *chat(
    modelId: string,
    messages: UnifiedMessage[],
    options: UnifiedChatOptions = {}
  ): AsyncGenerator<UnifiedStreamChunk> {
    if (options.signal?.aborted) {
      yield { type: 'error', error: 'Request aborted before start' };
      return;
    }

    const effectiveModel = modelId || 'llama3.2:3b';
    const url = `${this.endpoint}/api/chat`;

    // 1. Capability check for tools
    const modelMeta = ModelCatalog.getModel(effectiveModel);
    const supportsTools = Boolean(modelMeta?.capabilities.toolCalling);

    const formattedMessages: any[] = [];
    if (options.systemPrompt) {
      formattedMessages.push({ role: 'system', content: options.systemPrompt });
    }

    for (const m of messages) {
      if (m.role === 'tool' && m.toolResults) {
        for (const res of m.toolResults) {
          formattedMessages.push({
            role: 'tool',
            content: res.output,
          });
        }
      } else {
        formattedMessages.push({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        });
      }
    }

    const payload: any = {
      model: effectiveModel,
      messages: formattedMessages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 4096,
      },
    };

    if (supportsTools && options.tools && options.tools.length > 0) {
      payload.tools = ToolSchemaTranslator.toOpenAI(options.tools);
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(this.fetchFn, url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: options.signal,
      }, 120000);
    } catch (netErr: any) {
      const isTimeout = netErr?.message === 'TIMEOUT' || options.signal?.aborted;
      const err = new ProviderError({
        code: isTimeout ? 'TIMEOUT' : 'OFFLINE',
        message: isTimeout ? 'Ollama request timed out' : 'Ollama local daemon is offline or unreachable at ' + this.endpoint,
        vendor: 'OLLAMA',
        modelId: effectiveModel,
      });
      ProviderHealthManager.recordFailure({
        vendor: 'OLLAMA',
        modelId: effectiveModel,
        errorCode: err.code,
        errorMessage: err.message,
      });
      yield { type: 'error', error: err.message };
      return;
    }

    if (!response.ok) {
      const status = response.status;
      const rawText = await response.text().catch(() => '');
      const providerErr = new ProviderError({
        code: status === 404 ? 'INVALID_REQUEST' : 'SERVICE_UNAVAILABLE',
        message: rawText || `Ollama returned HTTP ${status}`,
        vendor: 'OLLAMA',
        modelId: effectiveModel,
        httpStatus: status,
      });

      ProviderHealthManager.recordFailure({
        vendor: 'OLLAMA',
        modelId: effectiveModel,
        errorCode: providerErr.code,
        errorMessage: providerErr.message,
        httpStatus: status,
      });

      yield { type: 'error', error: providerErr.message };
      return;
    }

    ProviderHealthManager.recordSuccess('OLLAMA', effectiveModel);

    if (!response.body) {
      yield { type: 'done' };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const data = JSON.parse(trimmed);
            if (data.message?.content) {
              yield { type: 'text', text: data.message.content };
            }
            if (data.message?.tool_calls) {
              for (const tc of data.message.tool_calls) {
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                    name: tc.function?.name || 'unknown',
                    args: tc.function?.arguments || {},
                  },
                };
              }
            }
          } catch {}
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done' };
  }
}

export class OllamaReasoningAdapter implements ReasoningAIProvider {
  readonly vendor = 'OLLAMA' as const;
  readonly displayName = 'Ollama Local Reasoning Adapter';
  private endpoint: string;
  private fetchFn: typeof fetch;

  constructor(options?: { endpoint?: string; fetchFn?: typeof fetch }) {
    this.endpoint = options?.endpoint || 'http://127.0.0.1:11434';
    this.fetchFn = getSafeFetch(options?.fetchFn);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await this.fetchFn(`${this.endpoint}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout ? AbortSignal.timeout(1500) : undefined,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  getHealth(): AvailabilityRecord {
    return ProviderHealthManager.getProviderHealth('OLLAMA');
  }

  async reason(
    modelId: string,
    request: UnifiedReasoningRequest,
    signal?: AbortSignal
  ): Promise<UnifiedReasoningResult> {
    const effectiveModel = modelId || 'deepseek-r1:8b';
    const url = `${this.endpoint}/api/generate`;

    const prompt = `You are a deterministic reasoning engine. Return valid JSON only.
Goal: ${request.goal}
Context: ${JSON.stringify(request.context || {})}`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: effectiveModel,
          prompt,
          stream: false,
          format: 'json',
        }),
        signal,
      });
    } catch (networkErr: any) {
      const err = new ProviderError({
        code: signal?.aborted ? 'TIMEOUT' : 'OFFLINE',
        message: networkErr?.message || 'Ollama local service unreachable',
        vendor: 'OLLAMA',
        modelId: effectiveModel,
      });
      ProviderHealthManager.recordFailure({
        vendor: 'OLLAMA',
        modelId: effectiveModel,
        errorCode: err.code,
        errorMessage: err.message,
      });
      throw err;
    }

    if (!response.ok) {
      const status = response.status;
      const err = new ProviderError({
        code: status === 404 ? 'INVALID_REQUEST' : 'SERVICE_UNAVAILABLE',
        message: `Ollama local returned HTTP ${status}`,
        vendor: 'OLLAMA',
        modelId: effectiveModel,
        httpStatus: status,
      });
      ProviderHealthManager.recordFailure({
        vendor: 'OLLAMA',
        modelId: effectiveModel,
        errorCode: err.code,
        errorMessage: err.message,
        httpStatus: status,
      });
      throw err;
    }

    const data = await response.json();
    ProviderHealthManager.recordSuccess('OLLAMA', effectiveModel);

    let parsedPlan: any = {};
    try {
      parsedPlan = JSON.parse(data.response || '{}');
    } catch {
      parsedPlan = { text: data.response };
    }

    return {
      raw: data.response || '',
      structured: parsedPlan,
      tokenUsage: { input: 0, output: 0 },
      latencyMs: 0,
      providerId: 'OLLAMA',
      modelId: effectiveModel,
    };
  }
}

export class OllamaVendorPackage implements VendorProviderPackage {
  readonly vendor = 'OLLAMA' as const;
  readonly displayName = 'Ollama (Local)';
  readonly chat: ChatAIProvider;
  readonly reasoning: ReasoningAIProvider;
  private endpoint: string;
  private fetchFn: typeof fetch;

  constructor(options?: { endpoint?: string; fetchFn?: typeof fetch }) {
    this.endpoint = options?.endpoint || 'http://127.0.0.1:11434';
    this.fetchFn = getSafeFetch(options?.fetchFn);
    this.chat = new OllamaChatAdapter({ endpoint: this.endpoint, fetchFn: this.fetchFn });
    this.reasoning = new OllamaReasoningAdapter({ endpoint: this.endpoint, fetchFn: this.fetchFn });
  }

  async discoverModels(): Promise<ModelMetadata[]> {
    try {
      const res = await this.fetchFn(`${this.endpoint}/api/tags`, {
        method: 'GET',
        signal: AbortSignal.timeout ? AbortSignal.timeout(2000) : undefined,
      });
      if (!res.ok) return ModelCatalog.getModelsByVendor('OLLAMA');
      const data = await res.json();
      const discovered: ModelMetadata[] = [];

      for (const item of data.models || []) {
        const name = item.name || item.model;
        if (!name) continue;

        // Check if catalog already has specialized entry
        const existing = ModelCatalog.getModel(name);
        if (existing) {
          discovered.push(existing);
        } else {
          // Register dynamic model entry
          const dynamicMeta: ModelMetadata = {
            id: name,
            vendor: 'OLLAMA',
            displayName: `${name} (Local)`,
            capabilities: {
              text: true,
              vision: name.includes('vision') || name.includes('llava'),
              audioInput: false,
              audioOutput: false,
              toolCalling: name.includes('qwen') || name.includes('llama3'),
              structuredOutput: true,
              streaming: true,
              systemPrompt: true,
              extendedThinking: name.includes('r1') || name.includes('reasoner'),
              maxContextTokens: 32_768,
              maxOutputTokens: 4096,
              supportsComputerUse: false,
            },
            pricing: { inputPerMillionUSD: 0, outputPerMillionUSD: 0, costTier: 'FREE' },
            supportedTaskCategories: ['CONVERSATION', 'CODING'],
            isLocal: true,
          };
          ModelCatalog.registerModel(dynamicMeta);
          discovered.push(dynamicMeta);
        }
      }

      return discovered;
    } catch {
      return ModelCatalog.getModelsByVendor('OLLAMA');
    }
  }

  async getModels(): Promise<ModelMetadata[]> {
    return this.discoverModels();
  }

  getHealth(): AvailabilityRecord {
    return ProviderHealthManager.getProviderHealth('OLLAMA');
  }
}
