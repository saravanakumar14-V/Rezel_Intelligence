/**
 * Rezel OS — Anthropic Claude Provider Adapter (Milestone 11.2B)
 *
 * Implements ChatAIProvider and ReasoningAIProvider for Anthropic Claude models (Claude 3.7 Sonnet).
 * Handles streaming messages API, tool use blocks, input JSON delta accumulation, and structured output.
 */

import { ProviderAuthManager } from '../ProviderAuthManager';
import { ProviderHealthManager } from '../ProviderHealthManager';
import { ModelCatalog } from '../ModelCatalog';
import { ToolSchemaTranslator } from './ToolSchemaTranslator';
import { fetchWithTimeout } from '../utils/fetchTimeout';
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

export class AnthropicChatAdapter implements ChatAIProvider {
  readonly vendor = 'ANTHROPIC' as const;
  readonly displayName = 'Anthropic Claude Chat Adapter';
  private fetchFn: typeof fetch;

  constructor(options?: { fetchFn?: typeof fetch }) {
    this.fetchFn = getSafeFetch(options?.fetchFn);
  }

  async isAvailable(): Promise<boolean> {
    const key = await ProviderAuthManager.getKey('ANTHROPIC');
    return Boolean(key && key.length > 0);
  }

  getHealth(): AvailabilityRecord {
    return ProviderHealthManager.getProviderHealth('ANTHROPIC');
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

    const apiKey = await ProviderAuthManager.getKey('ANTHROPIC');
    if (!apiKey) {
      const err = new ProviderError({
        code: 'AUTHENTICATION_FAILURE',
        message: 'Anthropic API key is not configured in settings',
        vendor: 'ANTHROPIC',
        modelId,
        httpStatus: 401,
      });
      ProviderHealthManager.recordFailure({
        vendor: 'ANTHROPIC',
        modelId,
        errorCode: err.code,
        errorMessage: err.message,
        httpStatus: 401,
      });
      yield { type: 'error', error: err.message };
      return;
    }

    const effectiveModel = modelId || 'claude-3-7-sonnet-20250219';
    const url = 'https://api.anthropic.com/v1/messages';

    const formattedMessages: any[] = [];
    for (const m of messages) {
      if (m.role === 'tool' && m.toolResults) {
        const content = m.toolResults.map((tr) => ({
          type: 'tool_result',
          tool_use_id: tr.callId,
          content: tr.output,
        }));
        formattedMessages.push({ role: 'user', content });
      } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        const content: any[] = [];
        if (m.content) content.push({ type: 'text', text: m.content });
        for (const tc of m.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.args || {},
          });
        }
        formattedMessages.push({ role: 'assistant', content });
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
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
      stream: true,
    };

    if (options.systemPrompt) {
      payload.system = options.systemPrompt;
    }

    if (options.tools && options.tools.length > 0) {
      payload.tools = ToolSchemaTranslator.toAnthropic(options.tools);
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(this.fetchFn, url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
        signal: options.signal,
      }, 60000);
    } catch (netErr: any) {
      const isTimeout = netErr?.message === 'TIMEOUT' || options.signal?.aborted;
      const err = new ProviderError({
        code: isTimeout ? 'TIMEOUT' : 'NETWORK_FAILURE',
        message: netErr?.message || 'Anthropic network connection failed',
        vendor: 'ANTHROPIC',
        modelId: effectiveModel,
      });
      ProviderHealthManager.recordFailure({
        vendor: 'ANTHROPIC',
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
      const retryAfter = response.headers.get('retry-after') || undefined;

      let code: import('./ProviderError').ProviderErrorCode = 'SERVICE_UNAVAILABLE';
      if (status === 401 || status === 403) code = 'AUTHENTICATION_FAILURE';
      else if (status === 429) code = 'RATE_LIMIT';
      else if (status === 400) code = 'INVALID_REQUEST';

      const providerErr = new ProviderError({
        code,
        message: rawText || `Anthropic returned HTTP ${status}`,
        vendor: 'ANTHROPIC',
        modelId: effectiveModel,
        httpStatus: status,
      });

      ProviderHealthManager.recordFailure({
        vendor: 'ANTHROPIC',
        modelId: effectiveModel,
        errorCode: code,
        errorMessage: providerErr.message,
        httpStatus: status,
        retryAfterHeader: retryAfter,
      });

      yield { type: 'error', error: providerErr.message };
      return;
    }

    ProviderHealthManager.recordSuccess('ANTHROPIC', effectiveModel);

    if (!response.body) {
      yield { type: 'done' };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    let currentToolCall: { id: string; name: string; inputJson: string } | null = null;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const dataStr = trimmed.slice(6);
            try {
              const event = JSON.parse(dataStr);
              if (event.type === 'content_block_start') {
                if (event.content_block?.type === 'tool_use') {
                  currentToolCall = {
                    id: event.content_block.id,
                    name: event.content_block.name,
                    inputJson: '',
                  };
                }
              } else if (event.type === 'content_block_delta') {
                if (event.delta?.type === 'text_delta') {
                  yield { type: 'text', text: event.delta.text };
                } else if (event.delta?.type === 'input_json_delta' && currentToolCall) {
                  currentToolCall.inputJson += event.delta.partial_json;
                }
              } else if (event.type === 'content_block_stop') {
                if (currentToolCall) {
                  let parsedArgs = {};
                  try {
                    parsedArgs = JSON.parse(currentToolCall.inputJson);
                  } catch {}
                  yield {
                    type: 'tool_call',
                    toolCall: {
                      id: currentToolCall.id,
                      name: currentToolCall.name,
                      args: parsedArgs,
                    },
                  };
                  currentToolCall = null;
                }
              }
            } catch {}
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done' };
  }
}

export class AnthropicReasoningAdapter implements ReasoningAIProvider {
  readonly vendor = 'ANTHROPIC' as const;
  readonly displayName = 'Anthropic Claude Reasoning Adapter';
  private fetchFn: typeof fetch;

  constructor(options?: { fetchFn?: typeof fetch }) {
    this.fetchFn = getSafeFetch(options?.fetchFn);
  }

  async isAvailable(): Promise<boolean> {
    const key = await ProviderAuthManager.getKey('ANTHROPIC');
    return Boolean(key && key.length > 0);
  }

  getHealth(): AvailabilityRecord {
    return ProviderHealthManager.getProviderHealth('ANTHROPIC');
  }

  async reason(
    modelId: string,
    request: UnifiedReasoningRequest,
    signal?: AbortSignal
  ): Promise<UnifiedReasoningResult> {
    const apiKey = await ProviderAuthManager.getKey('ANTHROPIC');
    if (!apiKey) {
      throw new ProviderError({
        code: 'AUTHENTICATION_FAILURE',
        message: 'Anthropic API key is not configured',
        vendor: 'ANTHROPIC',
        modelId,
        httpStatus: 401,
      });
    }

    const effectiveModel = modelId || 'claude-3-7-sonnet-20250219';
    const url = 'https://api.anthropic.com/v1/messages';

    const systemPrompt = `You are a high-assurance reasoning model for Rezel AI Desktop OS.
Respond strictly with valid JSON. No conversational wrapper.
Goal: ${request.goal}`;

    const userPrompt = JSON.stringify({
      goal: request.goal,
      context: request.context,
      previousCycleResult: request.previousCycleResult ?? null,
    });

    const payload = {
      model: effectiveModel,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: request.maxResponseTokens ?? 8192,
      temperature: 0.2,
    };

    const startTime = Date.now();
    let response: Response;

    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (netErr: any) {
      throw new ProviderError({
        code: signal?.aborted ? 'TIMEOUT' : 'NETWORK_FAILURE',
        message: netErr?.message || 'Anthropic network connection failed',
        vendor: 'ANTHROPIC',
        modelId: effectiveModel,
      });
    }

    if (!response.ok) {
      const status = response.status;
      const rawText = await response.text().catch(() => '');
      throw new ProviderError({
        code: status === 429 ? 'RATE_LIMIT' : (status === 401 ? 'AUTHENTICATION_FAILURE' : 'SERVICE_UNAVAILABLE'),
        message: rawText || `Anthropic returned HTTP ${status}`,
        vendor: 'ANTHROPIC',
        modelId: effectiveModel,
        httpStatus: status,
      });
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;
    const rawText = data.content?.[0]?.text || '';

    let structured: any = undefined;
    try {
      structured = JSON.parse(rawText);
    } catch {}

    return {
      raw: rawText,
      structured,
      tokenUsage: {
        input: data.usage?.input_tokens ?? 0,
        output: data.usage?.output_tokens ?? 0,
      },
      latencyMs,
      providerId: 'ANTHROPIC',
      modelId: effectiveModel,
    };
  }
}

export class AnthropicVendorPackage implements VendorProviderPackage {
  readonly vendor = 'ANTHROPIC' as const;
  readonly displayName = 'Anthropic Claude';
  readonly chat: ChatAIProvider;
  readonly reasoning: ReasoningAIProvider;

  constructor(options?: { fetchFn?: typeof fetch }) {
    this.chat = new AnthropicChatAdapter(options);
    this.reasoning = new AnthropicReasoningAdapter(options);
  }

  async getModels(): Promise<ModelMetadata[]> {
    return ModelCatalog.getModelsByVendor('ANTHROPIC');
  }

  getHealth(): AvailabilityRecord {
    return ProviderHealthManager.getProviderHealth('ANTHROPIC');
  }
}
