/**
 * Rezel OS — Gemini Provider Adapter (Milestone 11.2B)
 *
 * Implements ChatAIProvider and ReasoningAIProvider for Google Gemini models.
 * Reuses verified SSE streaming, function calling, thought signatures, and
 * structured JSON output mechanics while integrating with the 11.2A contracts.
 */

import { ProviderAuthManager } from '../ProviderAuthManager';
import { ProviderHealthManager } from '../ProviderHealthManager';
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
import { ProviderToolNamePolicy } from '../ProviderToolName';
import { fetchWithTimeout } from '../utils/fetchTimeout';

function getSafeFetch(customFetch?: typeof fetch): typeof fetch {
  if (customFetch) {
    return (input: RequestInfo | URL, init?: RequestInit) => customFetch(input, init);
  }
  return (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init);
}

export class GeminiChatAdapter implements ChatAIProvider {
  readonly vendor = 'GEMINI' as const;
  readonly displayName = 'Google Gemini Chat Adapter';
  private fetchFn: typeof fetch;

  constructor(options?: { fetchFn?: typeof fetch }) {
    this.fetchFn = getSafeFetch(options?.fetchFn);
  }

  async isAvailable(): Promise<boolean> {
    const key = await ProviderAuthManager.getKey('GEMINI');
    return Boolean(key && key.length > 0);
  }

  getHealth(): AvailabilityRecord {
    return ProviderHealthManager.getProviderHealth('GEMINI');
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

    const apiKey = await ProviderAuthManager.getKey('GEMINI');
    if (!apiKey) {
      const err = new ProviderError({
        code: 'AUTHENTICATION_FAILURE',
        message: 'Gemini API key is not configured in settings',
        vendor: 'GEMINI',
        modelId,
        httpStatus: 401,
      });
      ProviderHealthManager.recordFailure({
        vendor: 'GEMINI',
        modelId,
        errorCode: err.code,
        errorMessage: err.message,
        httpStatus: 401,
      });
      yield { type: 'error', error: err.message };
      return;
    }

    const effectiveModel = modelId || 'gemini-3.6-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${effectiveModel}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const formattedContents = messages.map((m) => {
      if (m.role === 'tool') {
        const parts = (m.toolResults || []).map((res) => {
          const providerName = ProviderToolNamePolicy.getProviderName(res.name, 'GEMINI') || res.name;
          let contentObj: any = { output: res.output, success: res.success !== false };
          try {
            if (typeof res.output === 'string' && (res.output.trim().startsWith('{') || res.output.trim().startsWith('['))) {
              contentObj = JSON.parse(res.output);
            }
          } catch {}
          console.info(`[CHAT_TRACE] { stage: 'gemini_function_response_formatted', provider: 'GEMINI', model: '${effectiveModel}', canonicalId: '${res.name}', providerName: '${providerName}', success: ${res.success !== false} }`);
          return {
            functionResponse: {
              name: providerName,
              response: {
                name: providerName,
                content: contentObj,
              },
            },
          };
        });
        return { role: 'user', parts: parts.length > 0 ? parts : [{ text: m.content }] };
      }

      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        const parts: any[] = [];
        for (const tc of m.toolCalls) {
          const providerName = ProviderToolNamePolicy.getProviderName(tc.name, 'GEMINI') || tc.name;
          // Gemini 3.x: if we have the raw part from the original response, use it
          // directly to preserve thought_signature and any other opaque fields
          if (tc.rawPart) {
            parts.push(tc.rawPart);
          } else {
            const fcPart: any = {
              functionCall: {
                name: providerName,
                args: tc.args || {},
              },
            };
            // Gemini 3.x: echo thought_signature if captured
            if (tc.thoughtSignature) {
              fcPart.thought_signature = tc.thoughtSignature;
            }
            parts.push(fcPart);
          }
        }
        if (m.content) parts.push({ text: m.content });
        return { role: 'model', parts };
      }

      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      };
    });

    const payload: any = {
      contents: formattedContents,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 4096,
      },
    };

    if (options.systemPrompt) {
      payload.systemInstruction = {
        parts: [{ text: options.systemPrompt }],
      };
    }

    if (options.tools && options.tools.length > 0) {
      payload.tools = ToolSchemaTranslator.toGemini(options.tools);
    }

    let response: Response;
    try {
      response = await fetchWithTimeout(this.fetchFn, url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: options.signal,
      }, 60000);
    } catch (networkErr: any) {
      const isTimeout = networkErr?.message === 'TIMEOUT' || options.signal?.aborted;
      const err = new ProviderError({
        code: isTimeout ? 'TIMEOUT' : 'NETWORK_FAILURE',
        message: networkErr?.message || 'Gemini network connection failed',
        vendor: 'GEMINI',
        modelId: effectiveModel,
      });
      ProviderHealthManager.recordFailure({
        vendor: 'GEMINI',
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
        message: rawText || `Gemini returned HTTP ${status}`,
        vendor: 'GEMINI',
        modelId: effectiveModel,
        httpStatus: status,
      });

      ProviderHealthManager.recordFailure({
        vendor: 'GEMINI',
        modelId: effectiveModel,
        errorCode: code,
        errorMessage: providerErr.message,
        httpStatus: status,
        retryAfterHeader: retryAfter,
      });

      yield { type: 'error', error: providerErr.message };
      return;
    }

    // Success response
    ProviderHealthManager.recordSuccess('GEMINI', effectiveModel);

    // Read SSE stream
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
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            if (jsonStr === '[DONE]') continue;
            try {
              const data = JSON.parse(jsonStr);
              const candidate = data.candidates?.[0];
              if (!candidate) continue;

              const parts = candidate.content?.parts || [];
              for (const part of parts) {
                if (part.text) {
                  yield { type: 'text', text: part.text };
                }
                if (part.functionCall) {
                  const rawProviderName = part.functionCall.name;
                  const canonicalName = ProviderToolNamePolicy.resolveCanonicalId(rawProviderName, 'GEMINI');
                  // Gemini 3.x: capture thought_signature for multi-turn tool use
                  const thoughtSig = part.thought_signature || part.functionCall.thought_signature;
                  if (thoughtSig) {
                    console.info(`[CHAT_TRACE] { stage: 'gemini_captured_thought_signature', provider: 'GEMINI', model: '${effectiveModel}', canonicalId: '${canonicalName}', signatureLength: ${thoughtSig.length} }`);
                  }
                  console.info(`[CHAT_TRACE] { stage: 'gemini_yielded_function_call', provider: 'GEMINI', model: '${effectiveModel}', providerName: '${rawProviderName}', canonicalId: '${canonicalName}' }`);
                  yield {
                    type: 'tool_call',
                    toolCall: {
                      id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                      name: canonicalName,
                      args: part.functionCall.args || {},
                      thoughtSignature: thoughtSig,
                      rawPart: part,
                    },
                  };
                }
              }
            } catch {
              // Ignore chunk parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done' };
  }
}

export class GeminiReasoningAdapter implements ReasoningAIProvider {
  readonly vendor = 'GEMINI' as const;
  readonly displayName = 'Google Gemini Reasoning Adapter';
  private fetchFn: typeof fetch;

  constructor(options?: { fetchFn?: typeof fetch }) {
    this.fetchFn = getSafeFetch(options?.fetchFn);
  }

  async isAvailable(): Promise<boolean> {
    const key = await ProviderAuthManager.getKey('GEMINI');
    return Boolean(key && key.length > 0);
  }

  getHealth(): AvailabilityRecord {
    return ProviderHealthManager.getProviderHealth('GEMINI');
  }

  async reason(
    modelId: string,
    request: UnifiedReasoningRequest,
    signal?: AbortSignal
  ): Promise<UnifiedReasoningResult> {
    const apiKey = await ProviderAuthManager.getKey('GEMINI');
    if (!apiKey) {
      throw new ProviderError({
        code: 'AUTHENTICATION_FAILURE',
        message: 'Gemini API key is not configured',
        vendor: 'GEMINI',
        modelId,
        httpStatus: 401,
      });
    }

    const effectiveModel = modelId || 'gemini-3.6-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${effectiveModel}:generateContent?key=${apiKey}`;

    const systemInstruction = `You are a high-assurance reasoning model for Rezel AI Desktop OS.
Respond strictly in JSON format.
Goal: ${request.goal}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: JSON.stringify({
                goal: request.goal,
                context: request.context,
                previousCycleResult: request.previousCycleResult ?? null,
              }),
            },
          ],
        },
      ],
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: request.maxResponseTokens ?? 8192,
        responseMimeType: 'application/json',
      },
    };

    const startTime = Date.now();
    let response: Response;

    try {
      response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });
    } catch (netErr: any) {
      throw new ProviderError({
        code: signal?.aborted ? 'TIMEOUT' : 'NETWORK_FAILURE',
        message: netErr?.message || 'Gemini reasoning network connection failed',
        vendor: 'GEMINI',
        modelId: effectiveModel,
      });
    }

    if (!response.ok) {
      const status = response.status;
      const rawText = await response.text().catch(() => '');
      throw new ProviderError({
        code: status === 429 ? 'RATE_LIMIT' : (status === 401 ? 'AUTHENTICATION_FAILURE' : 'SERVICE_UNAVAILABLE'),
        message: rawText || `Gemini returned HTTP ${status}`,
        vendor: 'GEMINI',
        modelId: effectiveModel,
        httpStatus: status,
      });
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTime;
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text ?? '';

    let structured: any = undefined;
    try {
      structured = JSON.parse(text);
    } catch {
      // Structured JSON error handling left for consumer interpreter
    }

    return {
      raw: text,
      structured,
      tokenUsage: {
        input: data.usageMetadata?.promptTokenCount ?? 0,
        output: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
      latencyMs,
      providerId: 'GEMINI',
      modelId: effectiveModel,
    };
  }
}

export class GeminiVendorPackage implements VendorProviderPackage {
  readonly vendor = 'GEMINI' as const;
  readonly displayName = 'Google Gemini';
  readonly chat: ChatAIProvider;
  readonly reasoning: ReasoningAIProvider;

  constructor(options?: { fetchFn?: typeof fetch }) {
    this.chat = new GeminiChatAdapter(options);
    this.reasoning = new GeminiReasoningAdapter(options);
  }

  async getModels(): Promise<ModelMetadata[]> {
    return ModelCatalog.getModelsByVendor('GEMINI');
  }

  getHealth(): AvailabilityRecord {
    return ProviderHealthManager.getProviderHealth('GEMINI');
  }
}
