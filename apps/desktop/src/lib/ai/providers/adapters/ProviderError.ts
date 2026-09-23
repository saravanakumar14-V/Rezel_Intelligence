/**
 * Rezel OS — Normalized Provider Error Contract (Milestone 11.2B)
 *
 * Maps provider-specific exceptions, HTTP codes, and rate-limits into a unified,
 * sanitized error contract without leaking credentials or internal request tokens.
 */

import type { ProviderVendor } from '../types';

export type ProviderErrorCode =
  | 'RATE_LIMIT'
  | 'QUOTA_EXHAUSTED'
  | 'AUTHENTICATION_FAILURE'
  | 'INVALID_REQUEST'
  | 'SERVICE_UNAVAILABLE'
  | 'TIMEOUT'
  | 'NETWORK_FAILURE'
  | 'OFFLINE'
  | 'POLICY_VIOLATION'
  | 'UNKNOWN_PROVIDER_ERROR';

export interface ProviderErrorDetails {
  readonly code: ProviderErrorCode;
  readonly message: string;
  readonly vendor: ProviderVendor;
  readonly modelId?: string;
  readonly httpStatus?: number;
  readonly retryAfterMs?: number;
  readonly resetAt?: string;
  readonly rawError?: unknown;
}

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;
  readonly vendor: ProviderVendor;
  readonly modelId?: string;
  readonly httpStatus?: number;
  readonly retryAfterMs?: number;
  readonly resetAt?: string;

  constructor(details: ProviderErrorDetails) {
    const safeMessage = ProviderError.sanitizeMessage(details.message);
    super(`[${details.vendor}::${details.code}]${details.modelId ? ` (${details.modelId})` : ''}: ${safeMessage}`);
    this.name = 'ProviderError';
    this.code = details.code;
    this.vendor = details.vendor;
    this.modelId = details.modelId;
    this.httpStatus = details.httpStatus;
    this.retryAfterMs = details.retryAfterMs;
    this.resetAt = details.resetAt;
  }

  /**
   * Strips potential secret keys (sk-..., AIza..., Bearer tokens) from error strings.
   */
  static sanitizeMessage(raw: string): string {
    if (!raw) return 'Unknown provider error';
    return raw
      .replace(/(AIza[0-9A-Za-z-_]{15,}|TEST_GEMINI_KEY(?:_[A-Z0-9]+)?)/g, '[REDACTED_API_KEY]')
      .replace(/sk-[a-zA-Z0-9_-]{15,}/g, '[REDACTED_API_KEY]')
      .replace(/sk-ant-[a-zA-Z0-9_-]{15,}/g, '[REDACTED_API_KEY]')
      .replace(/Bearer\s+[a-zA-Z0-9_.-]+/gi, 'Bearer [REDACTED_TOKEN]');
  }

  static isRetryable(err: unknown): boolean {
    if (err instanceof ProviderError) {
      return (
        err.code === 'RATE_LIMIT' ||
        err.code === 'QUOTA_EXHAUSTED' ||
        err.code === 'SERVICE_UNAVAILABLE' ||
        err.code === 'TIMEOUT' ||
        err.code === 'NETWORK_FAILURE' ||
        err.code === 'OFFLINE'
      );
    }
    return false;
  }
}
