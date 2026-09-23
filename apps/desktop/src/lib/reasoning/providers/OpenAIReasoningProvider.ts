import type {
  ReasoningProvider,
  ReasoningProviderConfig,
  ReasoningRequest,
  ReasoningProviderResult,
} from '../types';
import { ReasoningProviderError } from '../types';

export interface OpenAIReasoningProviderOptions {
  id?: string;
  displayName?: string;
  modelId?: string;
  apiKey?: string;
  apiEndpoint?: string;
  priority?: number;
  maxContextTokens?: number;
  costTier?: 'FREE' | 'LOW' | 'MEDIUM' | 'HIGH';
  /** Custom fetch handler for offline testing */
  fetchFn?: typeof fetch;
}

export class OpenAIReasoningProvider implements ReasoningProvider {
  readonly id: string;
  readonly type = 'OPENAI' as const;
  readonly config: ReasoningProviderConfig;
  private apiKey?: string;
  private apiEndpoint: string;
  private fetchFn: typeof fetch;

  constructor(options: OpenAIReasoningProviderOptions = {}) {
    this.id = options.id ?? 'openai-default';
    this.apiKey = options.apiKey;
    this.apiEndpoint = options.apiEndpoint ?? 'https://api.openai.com/v1';
    this.fetchFn = options.fetchFn ? ((input, init) => options.fetchFn!(input, init)) : ((input, init) => globalThis.fetch(input, init));

    this.config = {
      id: this.id,
      type: 'OPENAI',
      displayName: options.displayName ?? 'OpenAI GPT Reasoning Provider',
      apiEndpoint: this.apiEndpoint,
      modelId: options.modelId ?? 'gpt-4o',
      maxContextTokens: options.maxContextTokens ?? 128000,
      supportsStructuredOutput: true,
      supportsStreaming: true,
      costTier: options.costTier ?? 'HIGH',
      priority: options.priority ?? 20,
    };
  }

  async isAvailable(): Promise<boolean> {
    if (this.apiKey && this.apiKey.trim().length > 0) return true;
    try {
      const envKey = (import.meta.env && import.meta.env.VITE_OPENAI_API_KEY) as string | undefined;
      if (envKey && envKey.trim().length > 0) return true;
    } catch {
      // Ignore env check errors
    }
    return false;
  }

  async reason(
    request: ReasoningRequest,
    signal?: AbortSignal
  ): Promise<ReasoningProviderResult> {
    if (signal?.aborted) {
      throw new ReasoningProviderError('ABORTED', 'Request aborted before execution', this.id);
    }

    const available = await this.isAvailable();
    if (!available) {
      throw new ReasoningProviderError(
        'CONFIGURATION_ERROR',
        'OpenAI API key is missing or not configured',
        this.id
      );
    }

    const startTime = Date.now();

    try {
      const apiKey = this.apiKey || (import.meta.env && import.meta.env.VITE_OPENAI_API_KEY) || '';
      const url = `${this.apiEndpoint}/chat/completions`;

      const payload = {
        model: this.config.modelId,
        messages: [
          {
            role: 'system',
            content: 'You are a reasoning model for Rezel AI Desktop System. Respond in JSON format.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              goal: request.goal,
              context: request.context,
              previousCycleResult: request.previousCycleResult ?? null,
            }),
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: request.maxResponseTokens ?? 4096,
      };

      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new ReasoningProviderError(
            'AUTHENTICATION_FAILURE',
            `OpenAI API key rejected (${response.status})`,
            this.id
          );
        } else if (response.status === 429) {
          throw new ReasoningProviderError('RATE_LIMIT', 'OpenAI rate limit exceeded', this.id);
        } else {
          throw new ReasoningProviderError(
            'UNAVAILABLE',
            `OpenAI service returned HTTP ${response.status}`,
            this.id
          );
        }
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      const choice = data.choices?.[0];
      const text = choice?.message?.content ?? '';

      const inputTokens = data.usage?.prompt_tokens ?? 0;
      const outputTokens = data.usage?.completion_tokens ?? 0;

      let structured: any = undefined;
      try {
        structured = JSON.parse(text);
      } catch {
        // Fallback for non-JSON response
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
        err?.message ?? 'Network error calling OpenAI',
        this.id
      );
    }
  }
}
