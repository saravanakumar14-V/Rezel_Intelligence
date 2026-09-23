import type { ReasoningRequest, ReasoningProviderResult } from '../types';

export type ReasoningChannelType =
  | 'DIRECT_API'
  | 'STRUCTURED_UI'
  | 'CLIPBOARD'
  | 'SCREEN_OCR';

export type ReasoningChannelErrorCode =
  | 'CHANNEL_UNAVAILABLE'
  | 'PERMISSION_DENIED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'NO_RESPONSE'
  | 'OCR_FAILED'
  | 'ACCESSIBILITY_UNAVAILABLE'
  | 'CLIPBOARD_UNAVAILABLE'
  | 'SCREEN_CAPTURE_UNAVAILABLE';

export class ReasoningChannelError extends Error {
  readonly code: ReasoningChannelErrorCode;
  readonly channelType: ReasoningChannelType;

  constructor(
    code: ReasoningChannelErrorCode,
    channelType: ReasoningChannelType,
    message: string
  ) {
    super(`[${channelType}:${code}] ${message}`);
    this.name = 'ReasoningChannelError';
    this.code = code;
    this.channelType = channelType;
  }
}

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenCaptureResult {
  imageBuffer: Uint8Array | ArrayBuffer;
  width: number;
  height: number;
  timestamp: number;
}

export interface ScreenCaptureProvider {
  captureRegion(region: CaptureRegion, signal?: AbortSignal): Promise<ScreenCaptureResult>;
  release(): void;
}

export interface OcrResult {
  text: string;
  confidence: number;
  timestamp: number;
}

export interface LocalOcrProvider {
  recognize(capture: ScreenCaptureResult, signal?: AbortSignal): Promise<OcrResult>;
}

/**
 * ReasoningChannelAdapter
 *
 * Transport-only abstraction for acquiring reasoning responses across different channels.
 *
 * MUST NOT:
 * - Interpret actions or parse JSON payloads (handled by ResponseInterpreter)
 * - Execute tools or capabilities directly
 * - Modify project files or state
 * - Bypass PolicyEngine or SecurityToolExecutor
 */
export interface ReasoningChannelAdapter {
  readonly channelType: ReasoningChannelType;
  readonly priority: number;

  isAvailable(): Promise<boolean>;

  sendAndReceive(
    request: ReasoningRequest,
    signal?: AbortSignal
  ): Promise<ReasoningProviderResult>;
}

