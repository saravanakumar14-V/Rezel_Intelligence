import type { ReasoningProvider, ReasoningRequest, ReasoningProviderResult } from '../types';
import {
  ReasoningChannelError,
  type ReasoningChannelAdapter,
  type ReasoningChannelType,
} from './types';

export interface ApiReasoningChannelOptions {
  timeoutMs?: number;
}

/**
 * ApiReasoningChannel
 *
 * Primary DIRECT_API transport channel communicating directly with a ReasoningProvider.
 *
 * MUST NOT:
 * - Interpret actions or parse JSON payloads (handled by ResponseInterpreter)
 * - Execute tools or capabilities directly
 * - Modify project files or state
 * - Bypass PolicyEngine or SecurityToolExecutor
 */
export class ApiReasoningChannel implements ReasoningChannelAdapter {
  readonly channelType: ReasoningChannelType = 'DIRECT_API';
  readonly priority: number = 1;

  private provider: ReasoningProvider;
  private timeoutMs: number;

  constructor(provider: ReasoningProvider, options: ApiReasoningChannelOptions = {}) {
    this.provider = provider;
    this.timeoutMs = options.timeoutMs ?? 120000;
  }

  async isAvailable(): Promise<boolean> {
    try {
      return await this.provider.isAvailable();
    } catch {
      return false;
    }
  }

  async sendAndReceive(
    request: ReasoningRequest,
    signal?: AbortSignal
  ): Promise<ReasoningProviderResult> {
    if (signal?.aborted) {
      throw new ReasoningChannelError('CANCELLED', this.channelType, 'Reasoning request was cancelled before transmission');
    }

    const available = await this.isAvailable();
    if (!available) {
      throw new ReasoningChannelError(
        'CHANNEL_UNAVAILABLE',
        this.channelType,
        `Provider '${this.provider.id}' is currently unavailable`
      );
    }

    const startTime = Date.now();
    const abortCtrl = new AbortController();

    const onParentAbort = () => {
      abortCtrl.abort();
    };

    if (signal) {
      signal.addEventListener('abort', onParentAbort);
    }

    let timeoutId: any = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        abortCtrl.abort();
        reject(
          new ReasoningChannelError(
            'TIMEOUT',
            this.channelType,
            `DIRECT_API reasoning timed out after ${this.timeoutMs}ms`
          )
        );
      }, this.timeoutMs);
    });

    try {
      const result = await Promise.race([
        this.provider.reason(request, abortCtrl.signal),
        timeoutPromise,
      ]);

      const durationMs = Date.now() - startTime;
      return {
        ...result,
        latencyMs: durationMs,
      };
    } catch (err: any) {
      if (signal?.aborted) {
        throw new ReasoningChannelError('CANCELLED', this.channelType, 'Reasoning request was cancelled by client');
      }
      if (err instanceof ReasoningChannelError) {
        throw err;
      }
      throw new ReasoningChannelError(
        'NO_RESPONSE',
        this.channelType,
        `Direct API communication failed: ${err.message || String(err)}`
      );
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      if (signal) {
        signal.removeEventListener('abort', onParentAbort);
      }
    }
  }
}
