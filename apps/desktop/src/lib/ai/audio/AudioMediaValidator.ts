/**
 * Rezel 11.5B — Multimodal Audio Media Validator
 *
 * Enforces payload bounds, MIME validation, duration limits, sample rate checks,
 * and security constraints on audio inputs before transcription or processing.
 */

import type { AudioInput } from './types';
import { AudioError } from './types';

export const SUPPORTED_AUDIO_MIME_TYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/mp3',
  'audio/mpeg',
  'audio/ogg',
  'audio/webm',
  'audio/flac',
  'audio/m4a',
  'audio/aac',
]);

export const MAX_AUDIO_PAYLOAD_BYTES = 50 * 1024 * 1024; // 50 MB max payload
export const MAX_AUDIO_DURATION_MS = 3600 * 1000; // 1 hour max duration
export const MIN_SAMPLE_RATE = 8000;
export const MAX_SAMPLE_RATE = 192000;

export class AudioMediaValidator {
  /**
   * Validates a single audio input.
   */
  static validate(input: AudioInput): void {
    if (!input || !input.id || !input.type || !input.source) {
      throw new AudioError('AUDIO_INPUT_INVALID', 'Invalid audio input structure', { inputId: input?.id });
    }

    // 1. Mime-type check
    if (input.mimeType && !SUPPORTED_AUDIO_MIME_TYPES.has(input.mimeType.toLowerCase())) {
      throw new AudioError(
        'AUDIO_UNSUPPORTED_FORMAT',
        `Unsupported audio format '${input.mimeType}'. Supported: ${Array.from(SUPPORTED_AUDIO_MIME_TYPES).join(', ')}`,
        { mimeType: input.mimeType }
      );
    }

    // 2. Payload size check
    if (input.sizeBytes && input.sizeBytes > MAX_AUDIO_PAYLOAD_BYTES) {
      throw new AudioError(
        'AUDIO_PAYLOAD_TOO_LARGE',
        `Audio payload exceeds maximum allowed size of 50MB (${input.sizeBytes} bytes)`,
        { sizeBytes: input.sizeBytes, limit: MAX_AUDIO_PAYLOAD_BYTES }
      );
    }

    // 3. Duration check
    if (input.durationMs !== undefined) {
      if (input.durationMs <= 0 || input.durationMs > MAX_AUDIO_DURATION_MS) {
        throw new AudioError('AUDIO_INPUT_INVALID', `Invalid audio duration: ${input.durationMs}ms`, {
          durationMs: input.durationMs,
        });
      }
    }

    // 4. Sample rate & channels check
    if (input.sampleRate !== undefined) {
      if (input.sampleRate < MIN_SAMPLE_RATE || input.sampleRate > MAX_SAMPLE_RATE) {
        throw new AudioError('AUDIO_INPUT_INVALID', `Invalid audio sample rate: ${input.sampleRate}Hz`, {
          sampleRate: input.sampleRate,
        });
      }
    }

    if (input.channels !== undefined) {
      if (input.channels <= 0 || input.channels > 8) {
        throw new AudioError('AUDIO_INPUT_INVALID', `Invalid audio channel count: ${input.channels}`, {
          channels: input.channels,
        });
      }
    }

    // 5. Source-specific validation
    const src = input.source;
    if (src.kind === 'FILE') {
      if (!src.path || typeof src.path !== 'string' || src.path.trim().length === 0) {
        throw new AudioError('AUDIO_INPUT_INVALID', 'Audio file source path is empty', { inputId: input.id });
      }
    } else if (src.kind === 'BYTES') {
      const len = typeof src.data === 'string' ? src.data.length : src.data?.length ?? 0;
      if (len === 0) {
        throw new AudioError('AUDIO_INPUT_INVALID', 'Audio byte payload is empty', { inputId: input.id });
      }
      if (len > MAX_AUDIO_PAYLOAD_BYTES) {
        throw new AudioError('AUDIO_PAYLOAD_TOO_LARGE', 'Audio byte payload exceeds 50MB limit', { len });
      }
    } else if (src.kind === 'STREAM') {
      if (!src.streamId || src.streamId.trim().length === 0) {
        throw new AudioError('AUDIO_INPUT_INVALID', 'Audio stream source missing streamId', { inputId: input.id });
      }
    }
  }
}
