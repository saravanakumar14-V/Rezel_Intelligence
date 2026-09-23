/**
 * REZEL PHASE 14 — CROSS-APPLICATION WORKFLOW INTELLIGENCE
 * 
 * Typed Workflow Contract:
 * - WorkflowDefinition, WorkflowVersion, WorkflowStep, WorkflowDependency
 * - WorkflowInput, WorkflowOutput, WorkflowArtifact, WorkflowContext
 * - WorkflowExecution, WorkflowStepResult, WorkflowVerification, WorkflowFailure
 * - Deterministic State Machines for Workflow and Step
 */

import type { VerificationPredicate } from '../verification/types';

// ─── Workflow & Step States ──────────────────────────────────────────────────

export type WorkflowState =
  | 'DRAFT'
  | 'VALIDATING'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'WAITING_FOR_INPUT'
  | 'FAILED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'UNKNOWN';

export type WorkflowStepState =
  | 'PENDING'
  | 'VALIDATING'
  | 'READY'
  | 'RUNNING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'
  | 'CANCELLED'
  | 'UNKNOWN';

// ─── Artifact Contract ───────────────────────────────────────────────────────

export type WorkflowArtifactType =
  | 'FILE'
  | 'APPLICATION_RESOURCE'
  | 'OBJECT_REFERENCE'
  | 'COMPOSITION_REFERENCE'
  | 'LAYER_REFERENCE'
  | 'TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'STRUCTURED_METADATA';

export interface WorkflowArtifactProvenance {
  readonly artifactId: string;
  readonly workflowId: string;
  readonly producerApplication: string;
  readonly producerStep: string;
  readonly createdAt: number;
  readonly verified: boolean;
}

export interface WorkflowArtifact {
  readonly artifactId: string;
  readonly name: string;
  readonly type: WorkflowArtifactType;
  readonly producerApplication: string;
  readonly producerStep: string;
  readonly createdAt: number;
  readonly verified: boolean;
  readonly metadata: Record<string, unknown>;
  
  // Specific properties for FILE artifacts
  readonly path?: string;
  readonly size?: number;
  readonly mtime?: number;
  readonly contentHash?: string;
  
  // Specific reference identifiers for application objects
  readonly resourceId?: string;
  readonly compositionId?: string;
  readonly layerId?: string;
  readonly objectId?: string;
  
  // Primitive payload for TEXT/NUMBER/BOOLEAN/STRUCTURED_METADATA
  readonly value?: unknown;
}

export interface WorkflowArtifactDefinition {
  readonly name: string;
  readonly type: WorkflowArtifactType;
  readonly description?: string;
  readonly targetProperty?: string;
  readonly required?: boolean;
}

// ─── Workflow Step Contract ──────────────────────────────────────────────────

export interface WorkflowDependency {
  readonly stepId: string;
  readonly requiredStatus?: 'COMPLETED';
}

export interface WorkflowStep {
  readonly id: string;
  readonly name?: string;
  readonly description: string;
  readonly applicationId: string;
  readonly operationId: string;
  readonly parameters: Record<string, unknown>;
  readonly dependencies: string[];
  readonly preconditions?: string[];
  readonly postconditions?: VerificationPredicate[];
  readonly timeoutMs?: number;
  readonly outputArtifacts?: WorkflowArtifactDefinition[];
}

// ─── Workflow Definition Contract ────────────────────────────────────────────

export type WorkflowVersion = string | number;

export interface WorkflowInput {
  readonly name: string;
  readonly type: WorkflowArtifactType | 'string' | 'number' | 'boolean' | 'object' | 'array';
  readonly description?: string;
  readonly required?: boolean;
  readonly defaultValue?: unknown;
}

export interface WorkflowOutput {
  readonly name: string;
  readonly type: WorkflowArtifactType | 'string' | 'number' | 'boolean' | 'object' | 'array';
  readonly sourceStepId: string;
  readonly sourceArtifactName?: string;
  readonly sourceProperty?: string;
}

export interface WorkflowDefinition {
  readonly id: string;
  readonly version: WorkflowVersion;
  readonly name: string;
  readonly description?: string;
  readonly inputs?: WorkflowInput[];
  readonly outputs?: WorkflowOutput[];
  readonly steps: WorkflowStep[];
  readonly metadata?: Record<string, unknown>;
}

// ─── Execution & Results Contract ────────────────────────────────────────────

export interface WorkflowContext {
  readonly workflowId: string;
  readonly workflowVersion: WorkflowVersion;
  readonly executionId: string;
  readonly signal?: AbortSignal;
  readonly sessionId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface WorkflowVerification {
  readonly status: 'VERIFIED' | 'NOT_VERIFIED' | 'UNKNOWN';
  readonly reason?: string;
  readonly observedAt: number;
  readonly predicate?: VerificationPredicate;
  readonly details?: Record<string, unknown>;
}

export interface WorkflowFailure {
  readonly code: string;
  readonly message: string;
  readonly stepId?: string;
  readonly applicationId?: string;
  readonly details?: Record<string, unknown>;
  readonly recoveryAttempted?: boolean;
}

export interface WorkflowStepResult {
  readonly stepId: string;
  readonly applicationId: string;
  readonly operationId: string;
  status: WorkflowStepState;
  readonly output?: unknown;
  readonly producedArtifacts: WorkflowArtifact[];
  readonly verification?: WorkflowVerification;
  readonly failure?: WorkflowFailure;
  readonly recoveryAttempted?: boolean;
  readonly durationMs: number;
  readonly startedAt: number;
  readonly completedAt: number;
}

export interface WorkflowExecution {
  readonly workflowId: string;
  readonly definition: WorkflowDefinition;
  status: WorkflowState;
  readonly stepResults: Record<string, WorkflowStepResult>;
  readonly artifacts: Record<string, WorkflowArtifact>;
  readonly inputValues: Record<string, unknown>;
  readonly outputValues: Record<string, unknown>;
  readonly startedAt: number;
  updatedAt: number;
  completedAt?: number;
  failure?: WorkflowFailure;
}

// ─── Dry Run & Validation Contract ───────────────────────────────────────────

export interface WorkflowValidationError {
  readonly stepId?: string;
  readonly code: string;
  readonly message: string;
  readonly severity: 'ERROR' | 'WARNING';
}

export interface WorkflowDryRunResult {
  readonly valid: boolean;
  readonly definitionId: string;
  readonly version: WorkflowVersion;
  readonly errors: WorkflowValidationError[];
  readonly warnings: WorkflowValidationError[];
  readonly resolvedOrder: string[];
  readonly applications: Array<{
    appId: string;
    available: boolean;
    reason?: string;
  }>;
}

// ─── Phase 16: Universal Creative Workflow Template Contracts ────────────────

export type WorkflowCondition =
  | { readonly type: 'artifact_exists'; readonly artifactName: string }
  | { readonly type: 'state_equals'; readonly path: string; readonly expectedValue: unknown; readonly applicationId?: string }
  | { readonly type: 'step_successful'; readonly stepId: string };

export interface WorkflowParameter {
  readonly name: string;
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'FILE' | WorkflowArtifactType;
  readonly description?: string;
  readonly required?: boolean;
  readonly defaultValue?: unknown;
  readonly schema?: Record<string, unknown>;
}

export interface WorkflowTemplateStep {
  readonly id: string;
  readonly name?: string;
  readonly description: string;
  readonly applicationId: string;
  readonly operationId: string;
  readonly parameters: Record<string, unknown>;
  readonly dependencies: string[];
  readonly conditions?: WorkflowCondition[];
  readonly preconditions?: string[];
  readonly postconditions?: VerificationPredicate[];
  readonly timeoutMs?: number;
  readonly outputArtifacts?: WorkflowArtifactDefinition[];
}

export interface WorkflowTemplate {
  readonly id: string;
  readonly version: WorkflowVersion;
  readonly name: string;
  readonly description?: string;
  readonly parameters?: WorkflowParameter[];
  readonly inputs?: WorkflowInput[];
  readonly steps: WorkflowTemplateStep[];
  readonly outputs?: WorkflowOutput[];
  readonly metadata?: Record<string, unknown>;
}

export interface WorkflowObservabilitySnapshot {
  readonly workflowId: string;
  readonly templateId?: string;
  readonly templateVersion?: WorkflowVersion;
  readonly status: WorkflowState;
  readonly currentStep?: string;
  readonly stepStatus: Record<string, WorkflowStepState>;
  readonly applications: string[];
  readonly operations: Array<{
    readonly stepId: string;
    readonly applicationId: string;
    readonly operationId: string;
    readonly status: WorkflowStepState;
  }>;
  readonly artifacts: Array<{
    readonly artifactId: string;
    readonly name: string;
    readonly type: WorkflowArtifactType;
    readonly verified: boolean;
    readonly path?: string;
    readonly producerApplication: string;
  }>;
  readonly verificationResults: Record<string, WorkflowVerification>;
  readonly failure?: WorkflowFailure;
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly completedAt?: number;
}

