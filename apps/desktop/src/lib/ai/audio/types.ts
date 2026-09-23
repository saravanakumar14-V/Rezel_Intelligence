/**
 * Rezel 11.5B — Multimodal Audio, STT, TTS & Voice Workflow Integration Types
 *
 * Defines contracts for normalized audio inputs, speech recognition requests/results,
 * transcript segments, speech synthesis requests/results, audio outputs, and error models.
 */

import type { ProviderVendor, ProviderRoute } from '../providers/types';

export type AudioInputType = 'MICROPHONE' | 'AUDIO_FILE' | 'STREAM';

export type AudioInputSource =
  | { readonly kind: 'FILE'; readonly path: string }
  | { readonly kind: 'BYTES'; readonly data: Uint8Array | string; readonly mimeType?: string }
  | { readonly kind: 'STREAM'; readonly streamId: string };

export interface AudioInput {
  readonly id: string;
  readonly type: AudioInputType;
  readonly mimeType?: string;
  readonly source: AudioInputSource;
  readonly durationMs?: number;
  readonly sampleRate?: number;
  readonly channels?: number;
  readonly sizeBytes?: number;
  readonly isSensitive?: boolean;
  readonly metadata?: Record<string, unknown>;
}

export interface AudioTranscriptSegment {
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
  readonly confidence?: number;
  readonly speakerId?: string;
}

export interface SpeechToTextRequest {
  readonly input: AudioInput;
  readonly language?: string;
  readonly responseFormat?: 'TEXT' | 'STRUCTURED';
  readonly timestamps?: boolean;
  readonly context?: {
    readonly workflowId?: string;
    readonly stepId?: string;
  };
}

export interface SpeechToTextResult {
  readonly text: string;
  readonly language?: string;
  readonly segments?: AudioTranscriptSegment[];
  readonly confidence?: number;
  readonly provider: ProviderVendor;
  readonly modelId: string;
  readonly durationMs?: number;
  readonly route?: ProviderRoute;
}

export interface SpeechSynthesisRequest {
  readonly text: string;
  readonly voiceId?: string;
  readonly language?: string;
  readonly speed?: number;
  readonly pitch?: number;
  readonly format?: string;
}

export interface AudioOutput {
  readonly id: string;
  readonly mimeType: string;
  readonly durationMs?: number;
  readonly source:
    | { readonly kind: 'BYTES'; readonly data: Uint8Array | string }
    | { readonly kind: 'FILE'; readonly path: string }
    | { readonly kind: 'STREAM'; readonly streamId: string };
}

export interface SpeechSynthesisResult {
  readonly audio: AudioOutput;
  readonly provider: ProviderVendor;
  readonly modelId: string;
  readonly durationMs?: number;
  readonly route?: ProviderRoute;
}

export type AudioErrorCode =
  | 'AUDIO_INPUT_INVALID'
  | 'AUDIO_UNSUPPORTED_FORMAT'
  | 'AUDIO_PAYLOAD_TOO_LARGE'
  | 'AUDIO_DEVICE_UNAVAILABLE'
  | 'MIC_PERMISSION_DENIED'
  | 'STT_CAPABILITY_UNAVAILABLE'
  | 'TTS_CAPABILITY_UNAVAILABLE'
  | 'LOCAL_AUDIO_UNAVAILABLE'
  | 'AUDIO_PROVIDER_FAILED'
  | 'AUDIO_RESULT_INVALID'
  | 'TTS_PLAYBACK_FAILED';

export class AudioError extends Error {
  readonly code: AudioErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AudioErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[Audio::${code}] ${message}`);
    this.name = 'AudioError';
    this.code = code;
    this.details = details;
  }
}
