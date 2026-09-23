/**
 * Rezel 11.5A — Multimodal Vision Integration & Visual Context Intelligence Types
 *
 * Defines contracts for normalized visual inputs, sources, requests,
 * normalized vision results, verification evidence types, and error models.
 */

import type { ProviderVendor, ProviderRoute } from '../providers/types';

export type VisionInputType = 'IMAGE' | 'SCREENSHOT' | 'APPLICATION_VIEW' | 'RENDERED_FRAME';

export type VisionInputSource =
  | { readonly kind: 'FILE'; readonly path: string }
  | { readonly kind: 'BYTES'; readonly data: Uint8Array | string; readonly mimeType?: string }
  | { readonly kind: 'URL'; readonly url: string }
  | { readonly kind: 'APPLICATION'; readonly applicationId: string; readonly sessionId?: string; readonly viewType?: string };

export interface VisionInput {
  readonly id: string;
  readonly type: VisionInputType;
  readonly mimeType?: string;
  readonly source: VisionInputSource;
  readonly width?: number;
  readonly height?: number;
  readonly sizeBytes?: number;
  readonly isSensitive?: boolean;
  readonly metadata?: Record<string, unknown>;
}

export interface VisionRequest {
  readonly inputs: VisionInput[];
  readonly prompt: string;
  readonly responseFormat?: 'TEXT' | 'STRUCTURED';
  readonly expectedCapabilities?: {
    readonly reasoning?: boolean;
    readonly structuredOutput?: boolean;
  };
  readonly context?: {
    readonly workflowId?: string;
    readonly stepId?: string;
  };
}

export type VisionEvidenceType = 'STRUCTURED_EVIDENCE' | 'VISUAL_EVIDENCE' | 'COMBINED_EVIDENCE';

export interface VisionResult {
  readonly text?: string;
  readonly structured?: unknown;
  readonly provider: ProviderVendor;
  readonly modelId: string;
  readonly usage?: {
    readonly inputTokens?: number;
    readonly outputTokens?: number;
  };
  readonly route?: ProviderRoute;
  readonly durationMs?: number;
  readonly evidenceType?: VisionEvidenceType;
}

export type VisionErrorCode =
  | 'VISION_INPUT_INVALID'
  | 'VISION_UNSUPPORTED_MEDIA'
  | 'VISION_CAPABILITY_UNAVAILABLE'
  | 'VISION_PAYLOAD_TOO_LARGE'
  | 'VISION_DECODE_FAILED'
  | 'VISION_PROVIDER_FAILED'
  | 'VISION_RESULT_INVALID'
  | 'VISION_LOCAL_MODEL_UNAVAILABLE';

export class VisionError extends Error {
  readonly code: VisionErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: VisionErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[Vision::${code}] ${message}`);
    this.name = 'VisionError';
    this.code = code;
    this.details = details;
  }
}
