/**
 * Rezel 11.7A — Governed Long-Term Memory Types
 *
 * Defines contracts for governed memory entries, provenance metadata,
 * scopes, sensitivities, retrieval queries, and memory error models.
 */

export type MemoryType =
  | 'USER_PREFERENCE'
  | 'PROJECT_FACT'
  | 'WORKFLOW_FACT'
  | 'DECISION'
  | 'PERSONAL_CONTEXT'
  | 'TECHNICAL_CONTEXT'
  | 'REFERENCE';

export type MemorySourceType =
  | 'USER'
  | 'WORKFLOW'
  | 'APPLICATION'
  | 'SYSTEM'
  | 'IMPORTED';

export type MemorySensitivity = 'NORMAL' | 'SENSITIVE' | 'SECRET';

export type MemoryScope = 'GLOBAL' | 'PROJECT' | 'WORKFLOW' | 'SESSION';

export interface MemorySourceReference {
  readonly sourceType: 'CONVERSATION' | 'WORKFLOW' | 'APPLICATION' | 'USER_INPUT' | 'SYSTEM';
  readonly sourceId?: string;
  readonly workflowId?: string;
  readonly stepId?: string;
  readonly createdAt: number;
}

export interface GovernedMemoryEntry {
  readonly memoryId: string;
  readonly type: MemoryType;
  readonly scope: MemoryScope;
  readonly projectId?: string;
  readonly workflowId?: string;
  readonly content: string;
  readonly source: MemorySourceType;
  readonly confidence?: number;
  readonly sensitivity: MemorySensitivity;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly expiresAt?: number;
  readonly sourceReference?: MemorySourceReference;
  readonly tags?: string[];
  readonly version: number;
  readonly isDeleted?: boolean;
  readonly lifecycleState?: 'CANDIDATE' | 'PENDING_CONFIRMATION' | 'ACTIVE' | 'STALE' | 'EXPIRED' | 'SUPERSEDED' | 'DELETED' | 'REJECTED';
  readonly confidenceMetadata?: {
    score: number;
    sourceReliability: number;
    stability: 'LOW' | 'MEDIUM' | 'HIGH';
    lastConfirmedAt?: number;
    confirmationCount: number;
    confidenceReason?: string;
  };
  readonly preferenceCategory?: 'COMMUNICATION' | 'UI' | 'CREATIVE' | 'WORKFLOW' | 'DEVELOPER' | 'AUTOMATION';
  readonly supersededBy?: string;
  readonly staleReason?: string;
}

export interface MemoryQuery {
  readonly text?: string;
  readonly type?: MemoryType;
  readonly scope?: MemoryScope;
  readonly projectId?: string;
  readonly workflowId?: string;
  readonly includeSensitive?: boolean;
  readonly limit?: number;
}

export interface MemoryRetrievalResult {
  readonly memories: GovernedMemoryEntry[];
  readonly query: MemoryQuery;
  readonly totalCount: number;
  readonly retrievedAt: number;
}

export type MemoryErrorCode =
  | 'MEMORY_NOT_FOUND'
  | 'MEMORY_INVALID'
  | 'MEMORY_PERMISSION_DENIED'
  | 'MEMORY_SENSITIVE'
  | 'MEMORY_EXPIRED'
  | 'MEMORY_CONFLICT'
  | 'MEMORY_RETRIEVAL_FAILED'
  | 'MEMORY_STORAGE_FAILED'
  | 'MEMORY_SECRET_REJECTED';

export class GovernedMemoryError extends Error {
  readonly code: MemoryErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: MemoryErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[Memory::${code}] ${message}`);
    this.name = 'GovernedMemoryError';
    this.code = code;
    this.details = details;
  }
}
