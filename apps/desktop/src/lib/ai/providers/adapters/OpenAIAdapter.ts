/**
 * Rezel OS — OpenAI Provider Adapter (Milestone 11.2B)
 *
 * Implements ChatAIProvider and ReasoningAIProvider for OpenAI models (GPT-4o, o3-mini).
 * Supports streaming chat completions, tool calling, and structured JSON output.
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

export class OpenAIChatAdapter implements ChatAIProvider {
  readonly vendor = 'OPENAI' as const;
  readonly displayName = 'OpenAI Chat Adapter';
  private fetchFn: typeof fetch;

  constructor(options?: { fetchFn?: typeof fetch }) {
    this.fetchFn = getSafeFetch(options?.fetchFn);
  }

  async isAvailable(): Promise<boolean> {
    const key = await ProviderAuthManager.getKey('OPENAI');
    return Boolean(key && key.length > 0);
  }

  getHealth(): AvailabilityRecord {
    return ProviderHealthManager.getProviderHealth('OPENAI');
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

    const apiKey = await ProviderAuthManager.getKey('OPENAI');
    if (!apiKey) {
      const err = new ProviderError({
        code: 'AUTHENTICATION_FAILURE',
        message: 'OpenAI API key is not configured in settings',
        vendor: 'OPENAI',
        modelId,
        httpStatus: 401,
      });
      ProviderHealthManager.recordFailure({
        vendor: 'OPENAI',
        modelId,
        errorCode: err.code,
        errorMessage: err.message,
        httpStatus: 401,
      });
      yield { type: 'error', error: err.message };
      return;
    }

    const effectiveModel = modelId || 'gpt-4o';
    const url = 'https://api.openai.com/v1/chat/completions';

    const formattedMessages: any[] = [];
    if (options.systemPrompt) {
      formattedMessages.push({ role: 'system', content: options.systemPrompt });
    }

    for (const m of messages) {
      if (m.role === 'tool' && m.toolResults) {
        for (const res of m.toolResults) {
          formattedMessages.push({
            role: 'tool',
            tool_call_id: res.callId,
            content: res.output,
          });
        }
      } else if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        formattedMessages.push({
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args || {}),
            },
          })),
        });
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
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: true,
    };

    if (options.tools && options.tools.length > 0) {
      payload.tools = ToolSchemaTranslator.toOpenAI(options.tools);
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(this.fetchFn, url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: options.signal,
      }, 60000);
    } catch (netErr: any) {
      const isTimeout = netErr?.message === 'TIMEOUT' || options.signal?.aborted;
      const err = new ProviderError({
        code: isTimeout ? 'TIMEOUT' : 'NETWORK_FAILURE',
        message: netErr?.message || 'OpenAI network connection failed',
        vendor: 'OPENAI',
        modelId: effectiveModel,
      });
      ProviderHealthManager.recordFailure({
        vendor: 'OPENAI',
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
      else if (status === 429) code = rawText.toLowerCase().includes('quota') ? 'QUOTA_EXHAUSTED' : 'RATE_LIMIT';
      else if (status === 400) code = 'INVALID_REQUEST';

      const providerErr = new ProviderError({
        code,
        message: rawText || `OpenAI returned HTTP ${status}`,
        vendor: 'OPENAI',
        modelId: effectiveModel,
        httpStatus: status,
      });

      ProviderHealthManager.recordFailure({
        vendor: 'OPENAI',
        modelId: effectiveModel,
        errorCode: code,
        errorMessage: providerErr.message,
        httpStatus: status,
        retryAfterHeader: retryAfter,
      });

      yield { type: 'error', error: providerErr.message };
      return;
    }

    ProviderHealthManager.recordSuccess('OPENAI', effectiveModel);

    if (!response.body) {
      yield { type: 'done' };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const pendingToolCalls = new Map<number, { id: string; name: string; argsText: string }>();

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
            if (dataStr === '[DONE]') {
              // Flush any accumulated tool calls
              for (const tc of pendingToolCalls.values()) {
                let parsedArgs = {};
                try {
                  parsedArgs = JSON.parse(tc.argsText);
                } catch {}
                yield {
                  type: 'tool_call',
                  toolCall: {
                    id: tc.id,
                    name: tc.name,
                    args: parsedArgs,
                  },
                };
              }
              pendingToolCalls.clear();
              continue;
            }

            try {
              const parsed = JSON.parse(dataStr);
              const delta = parsed.choices?.[0]?.delta;
              if (!delta) continue;

              if (delta.content) {
                yield { type: 'text', text: delta.content };
              }

              if (delta.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  const existing = pendingToolCalls.get(idx) || { id: '', name: '', argsText: '' };
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.name = tc.function.name;
                  if (tc.function?.arguments) existing.argsText += tc.function.arguments;
                  pendingToolCalls.set(idx, existing);
                }
              }
            } catch {
              // Ignore chunk parse error
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Flush any pending tool calls if [DONE] was not reached
    for (const tc of pendingToolCalls.values()) {
      let parsedArgs = {};
      try {
        parsedArgs = JSON.parse(tc.argsText);
      } catch {}
      yield {
        type: 'tool_call',
        toolCall: {
          id: tc.id || `call_${Date.now()}`,
          name: tc.name,
          args: parsedArgs,
        },
      };
    }
    pendingToolCalls.clear();

    yield { type: 'done' };
  }
}

export class OpenAIReasoningAdapter implements ReasoningAIProvider {
  readonly vendor = 'OPENAI' as const;
  readonly displayName = 'OpenAI Reasoning Adapter';
  private fetchFn: typeof fetch;

  constructor(options?: { fetchFn?: typeof fetch }) {
    this.fetchFn = getSafeFetch(options?.fetchFn);
  }

  async isAvailable(): Promise<boolean> {
    const key = await ProviderAuthManager.getKey('OPENAI');
    return Boolean(key && key.length > 0);
  }

  getHealth(): AvailabilityRecord {
    return ProviderHealthManager.getProviderHealth('OPENAI');
  }

  async reason(
    modelId: string,
    request: UnifiedReasoningRequest,
    signal?: AbortSignal
  ): Promise<UnifiedReasoningResult> {
    const apiKey = await ProviderAuthManager.getKey('OPENAI');
    if (!apiKey) {
      throw new ProviderError({
        code: 'AUTHENTICATION_FAILURE',
        message: 'OpenAI API key is not configured',
        vendor: 'OPENAI',
        modelId,
        httpStatus: 401,
      });
    }

    const effectiveModel = modelId || 'gpt-4o';
    const url = 'https://api.openai.com/v1/chat/completions';

    const systemPrompt = `You are a high-assurance reasoning model for Rezel AI Desktop OS.
Respond strictly in valid JSON matching the requested schema.
Goal: ${request.goal}`;

    const userContent = JSON.stringify({
      goal: request.goal,
      context: request.context,
      previousCycleResult: request.previousCycleResult ?? null,
    });

    const payload = {
      model: effectiveModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
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
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (netErr: any) {
      throw new ProviderError({
        code: signal?.aborted ? 'TIMEOUT' : 'NETWORK_FAILURE',
        message: netErr?.message || 'OpenAI reasoning network connection failed',
        vendor: 'OPENAI',
        modelId: effectiveModel,
      });
    }

    if (!response.ok) {
      const status = response.status;
      const rawText = await response.text().catch(() => '');
      throw new ProviderError({
        code: status === 429 ? 'RATE_LIMIT' : (status === 401 ? 'AUTHENTICATION_FAILURE' : 'SERVICE_UNAVAILABLE'),
        message: rawText || `OpenAI returned HTTP ${status}`,
        vendor: 'OPENAI',
        modelId: effectiveModel,
        httpStatus: status,
      });
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;
    const rawText = data.choices?.[0]?.message?.content || '';

    let structured: any = undefined;
    try {
      structured = JSON.parse(rawText);
    } catch {}

    return {
      raw: rawText,
      structured,
      tokenUsage: {
        input: data.usage?.prompt_tokens ?? 0,
        output: data.usage?.completion_tokens ?? 0,
      },
      latencyMs,
      providerId: 'OPENAI',
      modelId: effectiveModel,
    };
  }
}

export class OpenAIVendorPackage implements VendorProviderPackage {
  readonly vendor = 'OPENAI' as const;
  readonly displayName = 'OpenAI';
  readonly chat: ChatAIProvider;
  readonly reasoning: ReasoningAIProvider;

  constructor(options?: { fetchFn?: typeof fetch }) {
    this.chat = new OpenAIChatAdapter(options);
    this.reasoning = new OpenAIReasoningAdapter(options);
  }

  async getModels(): Promise<ModelMetadata[]> {
    return ModelCatalog.getModelsByVendor('OPENAI');
  }

  getHealth(): AvailabilityRecord {
    return ProviderHealthManager.getProviderHealth('OPENAI');
  }
}
