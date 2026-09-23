import type {
  ReasoningProvider,
  ReasoningProviderConfig,
  ReasoningRequest,
  ReasoningProviderResult,
} from '../types';
import { ReasoningProviderError } from '../types';

export interface GeminiReasoningProviderOptions {
  id?: string;
  displayName?: string;
  modelId?: string;
  apiKey?: string;
  priority?: number;
  maxContextTokens?: number;
  costTier?: 'FREE' | 'LOW' | 'MEDIUM' | 'HIGH';
  /** Optional custom fetch handler for testing / offline execution */
  fetchFn?: typeof fetch;
}

export class GeminiReasoningProvider implements ReasoningProvider {
  readonly id: string;
  readonly type = 'GEMINI' as const;
  readonly config: ReasoningProviderConfig;
  private apiKey?: string;
  private fetchFn: typeof fetch;

  constructor(options: GeminiReasoningProviderOptions = {}) {
    this.id = options.id ?? 'gemini-default';
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetchFn ? ((input, init) => options.fetchFn!(input, init)) : ((input, init) => globalThis.fetch(input, init));

    this.config = {
      id: this.id,
      type: 'GEMINI',
      displayName: options.displayName ?? 'Gemini Reasoning Provider',
      modelId: options.modelId ?? 'gemini-3.6-flash',
      maxContextTokens: options.maxContextTokens ?? 1000000,
      supportsStructuredOutput: true,
      supportsStreaming: true,
      costTier: options.costTier ?? 'MEDIUM',
      priority: options.priority ?? 10,
    };
  }

  async isAvailable(): Promise<boolean> {
    if (this.apiKey) return true;
    try {
      // Check environment variable or fallback
      const envKey = (import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) as string | undefined;
      if (envKey && envKey.trim().length > 0) {
        return true;
      }
    } catch {
      // Ignore env check errors in non-standard environments
    }
    return false;
  }

  async reason(
    request: ReasoningRequest,
    signal?: AbortSignal
  ): Promise<ReasoningProviderResult> {
    if (signal?.aborted) {
      throw new ReasoningProviderError('ABORTED', 'Request aborted before start', this.id);
    }

    const available = await this.isAvailable();
    if (!available) {
      throw new ReasoningProviderError(
        'AUTHENTICATION_FAILURE',
        'Gemini API key is missing or not configured',
        this.id
      );
    }

    const startTime = Date.now();

    try {
      const apiKey = this.apiKey || (import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) || '';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.modelId}:generateContent?key=${apiKey}`;

      const systemInstruction = `You are a reasoning model assisting Rezel AI Desktop System.
Respond strictly in JSON format matching the schema if provided.
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
          maxOutputTokens: request.maxResponseTokens ?? 4096,
          responseMimeType: 'application/json',
        },
      };

      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new ReasoningProviderError(
            'AUTHENTICATION_FAILURE',
            `API key rejected (${response.status})`,
            this.id
          );
        } else if (response.status === 429) {
          throw new ReasoningProviderError(
            'RATE_LIMIT',
            'Gemini API rate limit exceeded',
            this.id
          );
        } else {
          throw new ReasoningProviderError(
            'UNAVAILABLE',
            `Gemini service returned HTTP ${response.status}`,
            this.id
          );
        }
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text ?? '';

      const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
      const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

      let structured: any = undefined;
      try {
        structured = JSON.parse(text);
      } catch {
        // Structured parsing failure left for ResponseInterpreter
      }

      return {
        raw: text,
        structured,
        tokenUsage: { input: inputTokens, output: outputTokens },
        latencyMs,
        providerId: this.id,
      };
    } catch (err: any) {
      if (err instanceof ReasoningProviderError) {
        throw err;
      }
      if (err?.name === 'AbortError' || signal?.aborted) {
        throw new ReasoningProviderError('ABORTED', 'Reasoning request was aborted', this.id);
      }
      throw new ReasoningProviderError(
        'NETWORK_FAILURE',
        err?.message ?? 'Network request failed',
        this.id
      );
    }
  }
}
