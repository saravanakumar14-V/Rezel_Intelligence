import type {
  ReasoningProvider,
  ReasoningProviderConfig,
  ReasoningRequest,
  ReasoningProviderResult,
} from '../types';
import { ReasoningProviderError } from '../types';

export interface LocalReasoningProviderOptions {
  id?: string;
  displayName?: string;
  apiEndpoint?: string;
  modelId?: string;
  priority?: number;
  maxContextTokens?: number;
  isAvailableOverride?: boolean;
  /** Custom fetch handler for offline testing */
  fetchFn?: typeof fetch;
}

export class LocalReasoningProvider implements ReasoningProvider {
  readonly id: string;
  readonly type = 'LOCAL' as const;
  readonly config: ReasoningProviderConfig;
  private apiEndpoint: string;
  private isAvailableOverride?: boolean;
  private fetchFn: typeof fetch;

  constructor(options: LocalReasoningProviderOptions = {}) {
    this.id = options.id ?? 'local-default';
    this.apiEndpoint = options.apiEndpoint ?? 'http://localhost:11434';
    this.isAvailableOverride = options.isAvailableOverride;
    this.fetchFn = options.fetchFn ? ((input, init) => options.fetchFn!(input, init)) : ((input, init) => globalThis.fetch(input, init));

    this.config = {
      id: this.id,
      type: 'LOCAL',
      displayName: options.displayName ?? 'Local Ollama Provider',
      apiEndpoint: this.apiEndpoint,
      modelId: options.modelId ?? 'llama3',
      maxContextTokens: options.maxContextTokens ?? 8192,
      supportsStructuredOutput: true,
      supportsStreaming: false,
      costTier: 'FREE',
      priority: options.priority ?? 30,
    };
  }

  async isAvailable(): Promise<boolean> {
    if (this.isAvailableOverride !== undefined) {
      return this.isAvailableOverride;
    }

    try {
      const response = await this.fetchFn(`${this.apiEndpoint}/api/tags`, {
        method: 'GET',
      });
      return response.ok;
    } catch {
      return false;
    }
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
        'UNAVAILABLE',
        `Local provider endpoint ${this.apiEndpoint} is not reachable`,
        this.id
      );
    }

    const startTime = Date.now();

    try {
      const url = `${this.apiEndpoint}/api/generate`;

      const prompt = `Goal: ${request.goal}\nContext: ${JSON.stringify(request.context)}`;

      const payload = {
        model: this.config.modelId,
        prompt,
        format: 'json',
        stream: false,
      };

      const response = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      });

      if (!response.ok) {
        throw new ReasoningProviderError(
          'UNAVAILABLE',
          `Local Ollama runtime returned HTTP ${response.status}`,
          this.id
        );
      }

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      const rawText = data.response ?? '';
      const inputTokens = data.prompt_eval_count ?? 0;
      const outputTokens = data.eval_count ?? 0;

      let structured: any = undefined;
      try {
        structured = JSON.parse(rawText);
      } catch {
        // Handled by ResponseInterpreter
      }

      return {
        raw: rawText,
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
        throw new ReasoningProviderError('ABORTED', 'Local reasoning request was aborted', this.id);
      }
      throw new ReasoningProviderError(
        'NETWORK_FAILURE',
        err?.message ?? 'Network error connecting to local provider',
        this.id
      );
    }
  }
}
