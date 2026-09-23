/**
 * Rezel 11.7C — Memory Personalization & Lifecycle Types
 *
 * Defines contracts for memory confidence, lifecycle states,
 * personalization profiles, preference categories, import/export records,
 * and personalization errors.
 */

import type {
  MemoryType,
  MemoryScope,
  MemorySourceType,
  MemorySensitivity,
  MemorySourceReference,
} from '../types';

export type MemoryLifecycleState =
  | 'CANDIDATE'
  | 'PENDING_CONFIRMATION'
  | 'ACTIVE'
  | 'STALE'
  | 'EXPIRED'
  | 'SUPERSEDED'
  | 'DELETED'
  | 'REJECTED';

export type ConfidenceStability = 'LOW' | 'MEDIUM' | 'HIGH';

export interface MemoryConfidence {
  readonly score: number; // 0..1
  readonly sourceReliability: number;
  readonly stability: ConfidenceStability;
  readonly lastConfirmedAt?: number;
  readonly confirmationCount: number;
  readonly confidenceReason?: string;
}

export type PreferenceCategory =
  | 'COMMUNICATION'
  | 'UI'
  | 'CREATIVE'
  | 'WORKFLOW'
  | 'DEVELOPER'
  | 'AUTOMATION';

export interface ActivePreferenceRef {
  readonly memoryId: string;
  readonly category: PreferenceCategory;
  readonly preference: string;
  readonly scope: MemoryScope;
  readonly confidence: number;
}

export interface PersonalizationProfile {
  readonly userId?: string;
  readonly activePreferences: ActivePreferenceRef[];
  readonly communicationPreferences: string[];
  readonly uiPreferences: string[];
  readonly creativePreferences: string[];
  readonly workflowPreferences: string[];
  readonly developerPreferences: string[];
  readonly automationPreferences: string[];
}

export interface MemoryExportRecord {
  readonly memoryId: string;
  readonly type: MemoryType;
  readonly scope: MemoryScope;
  readonly projectId?: string;
  readonly workflowId?: string;
  readonly content: string;
  readonly source: MemorySourceType;
  readonly sensitivity: MemorySensitivity;
  readonly confidence?: MemoryConfidence;
  readonly lifecycleState: MemoryLifecycleState;
  readonly preferenceCategory?: PreferenceCategory;
  readonly sourceReference?: MemorySourceReference;
  readonly version: number;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export type PersonalizationErrorCode =
  | 'MEMORY_CONFIRMATION_REQUIRED'
  | 'MEMORY_STALE'
  | 'MEMORY_SUPERSEDED'
  | 'MEMORY_IMPORT_INVALID'
  | 'MEMORY_EXPORT_FAILED'
  | 'PERSONALIZATION_INVALID'
  | 'MEMORY_RETENTION_VIOLATION'
  | 'MEMORY_SCOPE_CONFLICT';

export class PersonalizationError extends Error {
  readonly code: PersonalizationErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: PersonalizationErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[Personalization::${code}] ${message}`);
    this.name = 'PersonalizationError';
    this.code = code;
    this.details = details;
  }
}
