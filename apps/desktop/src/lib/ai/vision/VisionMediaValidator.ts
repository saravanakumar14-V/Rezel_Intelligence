/**
 * Rezel 11.5A — Multimodal Vision Media Validator
 *
 * Enforces payload limits, mime-type verification, dimension bounds,
 * and security constraints on visual inputs before routing to AI providers.
 */

import type { VisionInput } from './types';
import { VisionError } from './types';

export const SUPPORTED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
]);

export const MAX_VISION_PAYLOAD_BYTES = 20 * 1024 * 1024; // 20 MB max payload
export const MAX_DIMENSION = 8192; // 8192px width/height cap

export class VisionMediaValidator {
  /**
   * Validates a single visual input.
   */
  static validate(input: VisionInput): void {
    if (!input || !input.id || !input.type || !input.source) {
      throw new VisionError('VISION_INPUT_INVALID', 'Invalid vision input structure', { inputId: input?.id });
    }

    // 1. Mime-type check
    if (input.mimeType && !SUPPORTED_MIME_TYPES.has(input.mimeType.toLowerCase())) {
      throw new VisionError(
        'VISION_UNSUPPORTED_MEDIA',
        `Unsupported media type '${input.mimeType}'. Supported: ${Array.from(SUPPORTED_MIME_TYPES).join(', ')}`,
        { mimeType: input.mimeType }
      );
    }

    // 2. Payload size check
    if (input.sizeBytes && input.sizeBytes > MAX_VISION_PAYLOAD_BYTES) {
      throw new VisionError(
        'VISION_PAYLOAD_TOO_LARGE',
        `Vision payload exceeds maximum allowed size of 20MB (${input.sizeBytes} bytes)`,
        { sizeBytes: input.sizeBytes, limit: MAX_VISION_PAYLOAD_BYTES }
      );
    }

    // 3. Dimension bounds check
    if (input.width !== undefined) {
      if (input.width <= 0 || input.width > MAX_DIMENSION) {
        throw new VisionError('VISION_INPUT_INVALID', `Invalid image width: ${input.width}`, { width: input.width });
      }
    }
    if (input.height !== undefined) {
      if (input.height <= 0 || input.height > MAX_DIMENSION) {
        throw new VisionError('VISION_INPUT_INVALID', `Invalid image height: ${input.height}`, { height: input.height });
      }
    }

    // 4. Source specific checks
    const src = input.source;
    if (src.kind === 'FILE') {
      if (!src.path || typeof src.path !== 'string' || src.path.trim().length === 0) {
        throw new VisionError('VISION_INPUT_INVALID', 'Image file source path is empty', { inputId: input.id });
      }
    } else if (src.kind === 'BYTES') {
      const len = typeof src.data === 'string' ? src.data.length : src.data?.length ?? 0;
      if (len === 0) {
        throw new VisionError('VISION_INPUT_INVALID', 'Image byte payload is empty', { inputId: input.id });
      }
      if (len > MAX_VISION_PAYLOAD_BYTES) {
        throw new VisionError('VISION_PAYLOAD_TOO_LARGE', `Byte payload exceeds 20MB limit`, { len });
      }
    } else if (src.kind === 'URL') {
      if (!src.url || (!src.url.startsWith('http://') && !src.url.startsWith('https://') && !src.url.startsWith('data:image/'))) {
        throw new VisionError('VISION_INPUT_INVALID', `Invalid vision URL: ${src.url}`, { url: src.url });
      }
    } else if (src.kind === 'APPLICATION') {
      if (!src.applicationId) {
        throw new VisionError('VISION_INPUT_INVALID', 'Application source missing applicationId', { inputId: input.id });
      }
    }
  }

  /**
   * Validates a batch of visual inputs.
   */
  static validateAll(inputs: VisionInput[]): void {
    if (!inputs || inputs.length === 0) {
      throw new VisionError('VISION_INPUT_INVALID', 'Vision request must contain at least one visual input');
    }
    for (const input of inputs) {
      this.validate(input);
    }
  }
}
