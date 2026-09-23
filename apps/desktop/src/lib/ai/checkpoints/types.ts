/**
 * Rezel 11.4C — Workflow Checkpoints, Pause/Resume & Recovery Gates Types
 *
 * Defines typed contracts for workflow checkpoints, lifecycle states,
 * session references, route provenance snapshots, and classified error models.
 */

import type { PlanStatus } from '../types';
import type { WorkflowVariable } from '../dataflow/types';

export type CheckpointType =
  | 'BEFORE_MUTATION'
  | 'AFTER_MUTATION'
  | 'AFTER_VERIFICATION'
  | 'MANUAL_PAUSE'
  | 'RECOVERY_REQUIRED';

export type CheckpointState =
  | 'CREATING'
  | 'COMMITTED'
  | 'INVALID'
  | 'RESTORING'
  | 'RESTORED'
  | 'FAILED';

export interface ProviderRouteReference {
  readonly vendor: string;
  readonly modelId: string;
  readonly routingProfile: string;
  readonly taskProfileId: string;
  readonly selectionReason?: string;
  readonly selectedAt: number;
}

export interface ApplicationSessionReference {
  readonly applicationId: string;
  readonly sessionId: string;
  readonly launchId?: string;
  readonly processId?: number;
  readonly connectionId?: string;
  readonly lastActiveTimestamp?: number;
}

export interface WorkflowCheckpoint {
  readonly checkpointId: string;
  readonly workflowId: string;
  readonly stepId?: string;
  readonly checkpointType: CheckpointType;
  checkpointState: CheckpointState;
  readonly createdAt: number;
  readonly workflowStatus: PlanStatus;
  readonly templateId?: string;
  readonly templateVersion?: string;
  readonly completedSteps: string[];
  readonly pendingSteps: string[];
  readonly runtimeVariables: Record<string, WorkflowVariable>;
  readonly providerRoutes?: Record<string, ProviderRouteReference>;
  readonly applicationSessions?: ApplicationSessionReference[];
  readonly reason?: string;
  invalidationReason?: string;
}

export interface CheckpointInspection {
  readonly checkpointId: string;
  readonly workflowId: string;
  readonly workflowStatus: PlanStatus;
  readonly checkpointType: CheckpointType;
  readonly checkpointState: CheckpointState;
  readonly stepId?: string;
  readonly completedStepsCount: number;
  readonly pendingStepsCount: number;
  readonly variableCount: number;
  readonly templateId?: string;
  readonly templateVersion?: string;
  readonly hasUnknownMutations: boolean;
  readonly isResumable: boolean;
  readonly reason?: string;
}

export type CheckpointErrorCode =
  | 'CHECKPOINT_NOT_FOUND'
  | 'CHECKPOINT_INVALID'
  | 'CHECKPOINT_PERSISTENCE_FAILED'
  | 'WORKFLOW_NOT_PAUSABLE'
  | 'WORKFLOW_ALREADY_PAUSED'
  | 'WORKFLOW_NOT_RESUMABLE'
  | 'RECOVERY_REQUIRED'
  | 'RECOVERY_STATE_UNKNOWN'
  | 'RESUME_DEPENDENCY_UNAVAILABLE'
  | 'APPLICATION_SESSION_STALE'
  | 'LOCK_REACQUISITION_FAILED'
  | 'CHECKPOINT_VERSION_MISMATCH';

export class CheckpointError extends Error {
  readonly code: CheckpointErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: CheckpointErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[Checkpoint::${code}] ${message}`);
    this.name = 'CheckpointError';
    this.code = code;
    this.details = details;
  }
}
