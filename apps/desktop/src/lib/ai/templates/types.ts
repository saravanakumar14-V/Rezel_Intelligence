/**
 * Rezel 11.4A — Workflow Template Types & Contracts
 *
 * Defines reusable, parameterized, versioned workflow templates that can be
 * previewed, dry-run, instantiated into PlanEngine Plans, and executed safely.
 */

import type { TaskCategory, RoutingProfile } from '../providers/types';
import type { RiskLevel } from '../../security/PermissionManager';
import type { VerificationPredicate } from '../verification/types';
import type { Plan } from '../types';

export type WorkflowParameterType = 'string' | 'number' | 'boolean' | 'array' | 'object';

export interface WorkflowParameterDefinition {
  readonly name: string;
  readonly type: WorkflowParameterType;
  readonly description: string;
  readonly required: boolean;
  readonly defaultValue?: unknown;
  readonly allowedValues?: unknown[];
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly pattern?: string;
  readonly isSensitive?: boolean;
}

export interface WorkflowTemplateStepDefinition {
  readonly id: string;
  readonly description: string;
  readonly toolName?: string;
  readonly toolArgs?: Record<string, unknown> | ((params: Record<string, unknown>) => Record<string, unknown>);
  readonly dependsOn?: string[];
  readonly mutatesExternalState?: boolean;
  readonly category?: TaskCategory;
  readonly routingProfile?: RoutingProfile;
  readonly requiredLocks?: { uri: string; access: 'READ' | 'WRITE' }[];
  readonly verificationPredicate?: VerificationPredicate;
  readonly risk?: RiskLevel;
  readonly maxRetries?: number;
  readonly outputs?: import('../dataflow/types').WorkflowStepOutputDefinition[];
  readonly inputBindings?: Record<string, string>;
  readonly checkpoint?: { type: import('../checkpoints/types').CheckpointType };
}

export interface WorkflowTemplateMetadata {
  readonly author?: string;
  readonly tags?: string[];
  readonly category?: string;
  readonly estimatedDurationSec?: number;
  readonly targetApplications?: string[];
  readonly documentationUrl?: string;
}

export interface WorkflowTemplate {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly description: string;
  readonly parameters: WorkflowParameterDefinition[];
  readonly steps: WorkflowTemplateStepDefinition[];
  readonly requiredCapabilities?: string[];
  readonly requiredApplications?: string[];
  readonly defaultRoutingProfile?: RoutingProfile;
  readonly metadata?: WorkflowTemplateMetadata;
}

export interface WorkflowTemplatePreview {
  readonly templateId: string;
  readonly templateVersion: string;
  readonly templateName: string;
  readonly description: string;
  readonly resolvedParameters: Record<string, unknown>;
  readonly requiredApplications: string[];
  readonly requiredCapabilities: string[];
  readonly stepCount: number;
  readonly mutatingStepsCount: number;
  readonly estimatedLocks: { uri: string; access: 'READ' | 'WRITE' }[];
  readonly checkpointBoundaries?: Array<{ stepId: string; type: string }>;
  readonly steps: Array<{
    id: string;
    description: string;
    toolName?: string;
    mutatesExternalState: boolean;
    category?: string;
    risk?: RiskLevel;
  }>;
}

export interface WorkflowTemplateInstantiationOptions {
  readonly templateId: string;
  readonly version?: string;
  readonly parameters: Record<string, unknown>;
  readonly projectId?: string;
  readonly workflowId?: string;
  readonly routingProfileOverride?: RoutingProfile;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
  readonly resolvedParameters: Record<string, unknown>;
}

export interface DryRunResult {
  readonly valid: boolean;
  readonly preview: WorkflowTemplatePreview;
  readonly plan: Plan;
  readonly errors?: string[];
}
