import type { ReasoningRequest, ReasoningProviderResult } from '../types';
import {
  ReasoningChannelError,
  type ReasoningChannelAdapter,
  type ReasoningChannelType,
} from './types';

export interface ClipboardChannelOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  enabled?: boolean;
  userPermitted?: boolean;
  clipboardReader?: () => Promise<string | null>;
}

/**
 * ClipboardReasoningChannel
 *
 * CLIPBOARD transport channel allowing Rezel to consume reasoning responses copied to the system clipboard.
 *
 * REQUIREMENTS:
 * - Explicit opt-in and user consent required.
 * - Bounded polling with timeout and immediate cancellation cleanup.
 * - NO clipboard persistence; NO background continuous harvesting.
 * - Raw clipboard data is treated as untrusted text.
 */
export class ClipboardReasoningChannel implements ReasoningChannelAdapter {
  readonly channelType: ReasoningChannelType = 'CLIPBOARD';
  readonly priority: number = 3;

  private timeoutMs: number;
  private pollIntervalMs: number;
  private enabled: boolean;
  private userPermitted: boolean;
  private clipboardReader?: () => Promise<string | null>;

  constructor(options: ClipboardChannelOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.enabled = options.enabled ?? false;
    this.userPermitted = options.userPermitted ?? false;
    this.clipboardReader = options.clipboardReader;
  }

  async isAvailable(): Promise<boolean> {
    return this.enabled && this.userPermitted;
  }

  async sendAndReceive(
    _request: ReasoningRequest,
    signal?: AbortSignal
  ): Promise<ReasoningProviderResult> {
    if (signal?.aborted) {
      throw new ReasoningChannelError(
        'CANCELLED',
        this.channelType,
        'Clipboard read cancelled before start'
      );
    }

    if (!this.enabled) {
      throw new ReasoningChannelError(
        'CLIPBOARD_UNAVAILABLE',
        this.channelType,
        'Clipboard reasoning channel is disabled'
      );
    }

    if (!this.userPermitted) {
      throw new ReasoningChannelError(
        'PERMISSION_DENIED',
        this.channelType,
        'User permission required to read reasoning output from clipboard'
      );
    }

    const reader = this.clipboardReader;
    if (!reader) {
      throw new ReasoningChannelError(
        'CLIPBOARD_UNAVAILABLE',
        this.channelType,
        'No clipboard reader registered on this platform'
      );
    }

    const startTime = Date.now();
    let initialText: string | null = null;
    try {
      initialText = await reader();
    } catch {
      initialText = null;
    }

    return new Promise<ReasoningProviderResult>((resolve, reject) => {
      let intervalId: any = null;
      let timeoutId: any = null;

      const cleanup = () => {
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (signal) {
          signal.removeEventListener('abort', onAbort);
        }
      };

      const onAbort = () => {
        cleanup();
        reject(
          new ReasoningChannelError(
            'CANCELLED',
            this.channelType,
            'Clipboard polling was cancelled by client'
          )
        );
      };

      if (signal) {
        signal.addEventListener('abort', onAbort);
      }

      timeoutId = setTimeout(() => {
        cleanup();
        reject(
          new ReasoningChannelError(
            'TIMEOUT',
            this.channelType,
            `Clipboard wait timed out after ${this.timeoutMs}ms without new content`
          )
        );
      }, this.timeoutMs);

      intervalId = setInterval(async () => {
        if (signal?.aborted) {
          onAbort();
          return;
        }

        try {
          const currentText = await reader();
          if (
            currentText !== null &&
            currentText !== undefined &&
            currentText.trim().length > 0 &&
            currentText !== initialText
          ) {
            cleanup();
            const durationMs = Date.now() - startTime;
            resolve({
              raw: currentText.trim(),
              tokenUsage: { input: 0, output: 0 },
              latencyMs: durationMs,
              providerId: 'clipboard',
            });
          }
        } catch (err: any) {
          cleanup();
          reject(
            new ReasoningChannelError(
              'CLIPBOARD_UNAVAILABLE',
              this.channelType,
              `Failed reading clipboard: ${err.message || String(err)}`
            )
          );
        }
      }, this.pollIntervalMs);
    });
  }
}
