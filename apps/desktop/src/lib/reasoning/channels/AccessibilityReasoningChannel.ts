import type { ReasoningRequest, ReasoningProviderResult } from '../types';
import {
  ReasoningChannelError,
  type ReasoningChannelAdapter,
  type ReasoningChannelType,
} from './types';

export interface AccessibilityChannelOptions {
  targetAppId?: string;
  targetWindowName?: string;
  timeoutMs?: number;
  enabled?: boolean;
  userPermitted?: boolean;
  accessibilityExtractor?: (targetAppId?: string, signal?: AbortSignal) => Promise<string | null>;
}

/**
 * AccessibilityReasoningChannel
 *
 * STRUCTURED_UI transport channel for reading reasoning outputs from a supported application surface.
 *
 * REQUIREMENTS:
 * - Disabled by default; requires explicit user permission and opt-in.
 * - Reads only the designated reasoning surface with bounded extraction.
 * - MUST NOT execute UI actions, tool calls, or file mutations.
 */
export class AccessibilityReasoningChannel implements ReasoningChannelAdapter {
  readonly channelType: ReasoningChannelType = 'STRUCTURED_UI';
  readonly priority: number = 2;

  private targetAppId?: string;
  private targetWindowName?: string;
  private timeoutMs: number;
  private enabled: boolean;
  private userPermitted: boolean;
  private accessibilityExtractor?: (targetAppId?: string, signal?: AbortSignal) => Promise<string | null>;

  constructor(options: AccessibilityChannelOptions = {}) {
    this.targetAppId = options.targetAppId;
    this.targetWindowName = options.targetWindowName;
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.enabled = options.enabled ?? false;
    this.userPermitted = options.userPermitted ?? false;
    this.accessibilityExtractor = options.accessibilityExtractor;
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
        'Accessibility read cancelled before start'
      );
    }

    if (!this.enabled) {
      throw new ReasoningChannelError(
        'ACCESSIBILITY_UNAVAILABLE',
        this.channelType,
        'Structured UI accessibility channel is disabled'
      );
    }

    if (!this.userPermitted) {
      throw new ReasoningChannelError(
        'PERMISSION_DENIED',
        this.channelType,
        'User permission required to read structured UI reasoning surface'
      );
    }

    const startTime = Date.now();
    let timeoutId: any = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(
          new ReasoningChannelError(
            'TIMEOUT',
            this.channelType,
            `Accessibility extraction timed out after ${this.timeoutMs}ms`
          )
        );
      }, this.timeoutMs);
    });

    const extractionPromise = (async (): Promise<ReasoningProviderResult> => {
      if (!this.accessibilityExtractor) {
        throw new ReasoningChannelError(
          'ACCESSIBILITY_UNAVAILABLE',
          this.channelType,
          'No accessibility extraction provider registered on this platform'
        );
      }

      const extractedText = await this.accessibilityExtractor(this.targetAppId, signal);

      if (signal?.aborted) {
        throw new ReasoningChannelError(
          'CANCELLED',
          this.channelType,
          'Accessibility extraction was cancelled'
        );
      }

      if (extractedText === null || extractedText === undefined || extractedText.trim() === '') {
        throw new ReasoningChannelError(
          'NO_RESPONSE',
          this.channelType,
          `No content could be extracted from accessibility surface '${this.targetAppId || this.targetWindowName || 'default'}'`
        );
      }

      const durationMs = Date.now() - startTime;
      return {
        raw: extractedText.trim(),
        tokenUsage: { input: 0, output: 0 },
        latencyMs: durationMs,
        providerId: this.targetAppId || 'accessibility',
      };
    })();

    try {
      return await Promise.race([extractionPromise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
