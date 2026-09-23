import {
  ReasoningChannelError,
  type CaptureRegion,
  type ScreenCaptureProvider,
  type ScreenCaptureResult,
} from './types';

export interface DefaultScreenCaptureOptions {
  nativeCaptureFn?: (region: CaptureRegion, signal?: AbortSignal) => Promise<ScreenCaptureResult>;
}

/**
 * DefaultScreenCaptureProvider
 *
 * Local screen capture provider bounded to a specified CaptureRegion.
 *
 * PRIVACY & SECURITY:
 * - Captures only the configured region (no full desktop capture by default).
 * - Temporary image buffers only; NO screenshot persistence.
 * - ZERO execution or security authority.
 */
export class DefaultScreenCaptureProvider implements ScreenCaptureProvider {
  private nativeCaptureFn?: (region: CaptureRegion, signal?: AbortSignal) => Promise<ScreenCaptureResult>;

  constructor(options: DefaultScreenCaptureOptions = {}) {
    this.nativeCaptureFn = options.nativeCaptureFn;
  }

  async captureRegion(
    region: CaptureRegion,
    signal?: AbortSignal
  ): Promise<ScreenCaptureResult> {
    if (signal?.aborted) {
      throw new ReasoningChannelError(
        'CANCELLED',
        'SCREEN_OCR',
        'Screen capture cancelled before start'
      );
    }

    if (region.width <= 0 || region.height <= 0) {
      throw new ReasoningChannelError(
        'SCREEN_CAPTURE_UNAVAILABLE',
        'SCREEN_OCR',
        `Invalid capture region dimensions: ${region.width}x${region.height}`
      );
    }

    if (this.nativeCaptureFn) {
      return await this.nativeCaptureFn(region, signal);
    }

    // Default mockable offline in-memory capture buffer
    const mockBuffer = new Uint8Array(region.width * region.height * 4);
    return {
      imageBuffer: mockBuffer,
      width: region.width,
      height: region.height,
      timestamp: Date.now(),
    };
  }

  release(): void {
    // Release any allocated capture handles or frame buffers
  }
}
