import {
  ReasoningChannelError,
  type LocalOcrProvider,
  type OcrResult,
  type ScreenCaptureResult,
} from './types';

export interface DefaultLocalOcrOptions {
  ocrEngineFn?: (capture: ScreenCaptureResult, signal?: AbortSignal) => Promise<OcrResult>;
}

/**
 * DefaultLocalOcrProvider
 *
 * Local OCR abstraction for extracting text from bounded screen capture buffers.
 *
 * PRIVACY & SECURITY:
 * - Strictly local processing (NO external network OCR calls).
 * - Temporary buffers only (NO image disk persistence).
 * - Preserves OCR recognition confidence score.
 */
export class DefaultLocalOcrProvider implements LocalOcrProvider {
  private ocrEngineFn?: (capture: ScreenCaptureResult, signal?: AbortSignal) => Promise<OcrResult>;

  constructor(options: DefaultLocalOcrOptions = {}) {
    this.ocrEngineFn = options.ocrEngineFn;
  }

  async recognize(
    capture: ScreenCaptureResult,
    signal?: AbortSignal
  ): Promise<OcrResult> {
    if (signal?.aborted) {
      throw new ReasoningChannelError(
        'CANCELLED',
        'SCREEN_OCR',
        'OCR recognition cancelled before start'
      );
    }

    if (!capture.imageBuffer || capture.width <= 0 || capture.height <= 0) {
      throw new ReasoningChannelError(
        'OCR_FAILED',
        'SCREEN_OCR',
        'Invalid screen capture buffer provided for OCR'
      );
    }

    if (this.ocrEngineFn) {
      return await this.ocrEngineFn(capture, signal);
    }

    // Default mockable offline response
    return {
      text: '',
      confidence: 1.0,
      timestamp: Date.now(),
    };
  }
}
