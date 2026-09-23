/**
 * Rezel 11.6A — Safe Screen Observation & Desktop State Intelligence Types
 *
 * Defines contracts for read-only screen captures, display and window descriptors,
 * screen observations, analysis requests/results, and screen-specific error models.
 */

import type { VisionInput } from '../vision/types';
import type { ProviderVendor, ProviderRoute } from '../providers/types';

export type ScreenCaptureType = 'FULL_SCREEN' | 'WINDOW' | 'REGION';

export interface ScreenBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ScreenWindowDescriptor {
  readonly windowId: string;
  readonly processId?: number;
  readonly applicationId?: string;
  readonly sessionId?: string;
  readonly title: string;
  readonly bounds: ScreenBounds;
  readonly isFocused: boolean;
  readonly isVisible: boolean;
}

export interface ScreenDisplayDescriptor {
  readonly displayId: string;
  readonly name: string;
  readonly isPrimary: boolean;
  readonly bounds: ScreenBounds;
  readonly scaleFactor: number;
}

export interface ScreenObservation {
  readonly observationId: string;
  readonly type: ScreenCaptureType;
  readonly displayId?: string;
  readonly windowId?: string;
  readonly applicationId?: string;
  readonly sessionId?: string;
  readonly bounds?: ScreenBounds;
  readonly image: VisionInput;
  readonly capturedAt: number;
  readonly isSensitive?: boolean;
  readonly metadata?: Record<string, unknown>;
}

export interface ScreenRegionDescriptor {
  readonly id: string;
  readonly label: string;
  readonly bounds: ScreenBounds;
  readonly confidence?: number;
}

export interface ScreenAnalysisRequest {
  readonly observation: ScreenObservation;
  readonly prompt?: string;
  readonly detectWindows?: boolean;
  readonly detectApplications?: boolean;
  readonly detectRegions?: boolean;
  readonly context?: {
    readonly workflowId?: string;
    readonly stepId?: string;
  };
}

export interface ScreenAnalysisResult {
  readonly observationId: string;
  readonly summary?: string;
  readonly windows?: ScreenWindowDescriptor[];
  readonly applications?: Array<{
    readonly applicationId: string;
    readonly sessionId?: string;
    readonly name: string;
    readonly bounds?: ScreenBounds;
  }>;
  readonly regions?: ScreenRegionDescriptor[];
  readonly structured?: unknown;
  readonly evidenceType: 'VISUAL_EVIDENCE';
  readonly provider: ProviderVendor;
  readonly modelId: string;
  readonly route?: ProviderRoute;
  readonly durationMs?: number;
}

export type ScreenErrorCode =
  | 'SCREEN_CAPTURE_DENIED'
  | 'SCREEN_CAPTURE_UNAVAILABLE'
  | 'DISPLAY_NOT_FOUND'
  | 'WINDOW_NOT_FOUND'
  | 'WINDOW_ACCESS_DENIED'
  | 'APPLICATION_SESSION_STALE'
  | 'SCREEN_CAPTURE_INVALID'
  | 'SCREEN_CAPTURE_TOO_LARGE'
  | 'SCREEN_ANALYSIS_FAILED'
  | 'LOCAL_SCREEN_ANALYSIS_UNAVAILABLE'
  | 'SCREEN_OBSERVATION_NOT_FOUND';

export class ScreenError extends Error {
  readonly code: ScreenErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ScreenErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[Screen::${code}] ${message}`);
    this.name = 'ScreenError';
    this.code = code;
    this.details = details;
  }
}
