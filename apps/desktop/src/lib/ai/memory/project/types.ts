/**
 * Rezel 11.7B — Project Memory & Context Spaces Types
 *
 * Defines contracts for project context spaces, project memory policies,
 * structured project decisions, supersession links, and error models.
 */

export interface ProjectMemoryPolicy {
  readonly allowAutoCapture: boolean;
  readonly allowWorkflowFacts: boolean;
  readonly allowApplicationFacts: boolean;
  readonly allowSensitiveMemory: boolean;
  readonly defaultExpirationMs?: number;
}

export type ProjectStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED';

export interface ProjectContextSpace {
  readonly projectId: string;
  readonly name: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: ProjectStatus;
  readonly memoryPolicy: ProjectMemoryPolicy;
  readonly metadata?: Record<string, unknown>;
}

export type DecisionStatus = 'ACTIVE' | 'SUPERSEDED';

export interface ProjectDecision {
  readonly decisionId: string;
  readonly projectId: string;
  readonly title: string;
  readonly decision: string;
  readonly rationale?: string;
  readonly sourceMemoryId?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: DecisionStatus;
  readonly supersededBy?: string;
}

export type ProjectErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'PROJECT_CONTEXT_AMBIGUOUS'
  | 'PROJECT_MEMORY_ACCESS_DENIED'
  | 'PROJECT_MEMORY_SCOPE_VIOLATION'
  | 'PROJECT_MEMORY_CONFLICT'
  | 'PROJECT_ARCHIVED'
  | 'PROJECT_DELETED'
  | 'PROJECT_DECISION_NOT_FOUND';

export class ProjectContextError extends Error {
  readonly code: ProjectErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ProjectErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[ProjectContext::${code}] ${message}`);
    this.name = 'ProjectContextError';
    this.code = code;
    this.details = details;
  }
}
