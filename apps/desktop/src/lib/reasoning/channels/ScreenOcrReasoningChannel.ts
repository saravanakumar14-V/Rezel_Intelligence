import type { ReasoningRequest, ReasoningProviderResult } from '../types';
import {
  ReasoningChannelError,
  type CaptureRegion,
  type LocalOcrProvider,
  type ReasoningChannelAdapter,
  type ReasoningChannelType,
  type ScreenCaptureProvider,
} from './types';
import { DefaultScreenCaptureProvider } from './ScreenCaptureProvider';
import { DefaultLocalOcrProvider } from './LocalOcrProvider';

export interface ScreenOcrChannelOptions {
  captureRegion?: CaptureRegion;
  windowId?: string;
  timeoutMs?: number;
  enabled?: boolean;
  userPermitted?: boolean;
  screenCaptureProvider?: ScreenCaptureProvider;
  localOcrProvider?: LocalOcrProvider;
}

/**
 * ScreenOcrReasoningChannel
 *
 * Last-resort SCREEN_OCR transport channel reading reasoning output from a bounded screen region.
 *
 * PRIVACY & SECURITY RULES:
 * - Disabled by default; requires explicit opt-in and user consent.
 * - Bounded region only (NO unrestricted full-desktop capture by default).
 * - Strictly local OCR; NO external network OCR services.
 * - NO raw screenshot persistence to disk or logs.
 * - NEVER automatically selected as a silent fallback from API failure.
 */
export class ScreenOcrReasoningChannel implements ReasoningChannelAdapter {
  readonly channelType: ReasoningChannelType = 'SCREEN_OCR';
  readonly priority: number = 4;

  private captureRegion?: CaptureRegion;
  private windowId?: string;
  private timeoutMs: number;
  private enabled: boolean;
  private userPermitted: boolean;
  private screenCapture: ScreenCaptureProvider;
  private localOcr: LocalOcrProvider;

  constructor(options: ScreenOcrChannelOptions = {}) {
    this.captureRegion = options.captureRegion;
    this.windowId = options.windowId;
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.enabled = options.enabled ?? false;
    this.userPermitted = options.userPermitted ?? false;
    this.screenCapture = options.screenCaptureProvider ?? new DefaultScreenCaptureProvider();
    this.localOcr = options.localOcrProvider ?? new DefaultLocalOcrProvider();
  }

  async isAvailable(): Promise<boolean> {
    return this.enabled && this.userPermitted && !!this.captureRegion;
  }

  async sendAndReceive(
    _request: ReasoningRequest,
    signal?: AbortSignal
  ): Promise<ReasoningProviderResult> {
    if (signal?.aborted) {
      throw new ReasoningChannelError(
        'CANCELLED',
        this.channelType,
        'Screen OCR read cancelled before start'
      );
    }

    if (!this.enabled) {
      throw new ReasoningChannelError(
        'CHANNEL_UNAVAILABLE',
        this.channelType,
        'Screen OCR channel is disabled'
      );
    }

    if (!this.userPermitted) {
      throw new ReasoningChannelError(
        'PERMISSION_DENIED',
        this.channelType,
        'Explicit user consent required for screen OCR capture'
      );
    }

    if (!this.captureRegion || this.captureRegion.width <= 0 || this.captureRegion.height <= 0) {
      throw new ReasoningChannelError(
        'SCREEN_CAPTURE_UNAVAILABLE',
        this.channelType,
        'A valid bounded capture region is required for screen OCR (full desktop capture is disabled)'
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
            `Screen OCR timed out after ${this.timeoutMs}ms`
          )
        );
      }, this.timeoutMs);
    });

    const ocrPromise = (async (): Promise<ReasoningProviderResult> => {
      try {
        const capture = await this.screenCapture.captureRegion(this.captureRegion!, signal);

        if (signal?.aborted) {
          throw new ReasoningChannelError(
            'CANCELLED',
            this.channelType,
            'Screen OCR was cancelled during capture'
          );
        }

        const ocrResult = await this.localOcr.recognize(capture, signal);

        if (signal?.aborted) {
          throw new ReasoningChannelError(
            'CANCELLED',
            this.channelType,
            'Screen OCR was cancelled during recognition'
          );
        }

        if (!ocrResult.text || ocrResult.text.trim().length === 0) {
          throw new ReasoningChannelError(
            'NO_RESPONSE',
            this.channelType,
            'No readable text extracted by OCR from configured region'
          );
        }

        const durationMs = Date.now() - startTime;
        return {
          raw: ocrResult.text.trim(),
          tokenUsage: { input: 0, output: 0 },
          latencyMs: durationMs,
          providerId: this.windowId || 'screen_ocr',
        };
      } finally {
        this.screenCapture.release();
      }
    })();

    try {
      return await Promise.race([ocrPromise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
