import type { ParameterDef } from '../types';
import type { RiskLevel } from '../../security/PermissionManager';

export interface ResourceScope {
  type: 'filesystem' | 'domain' | 'application' | 'process';
  value: string;
  access: 'READ' | 'WRITE' | 'EXECUTE';
}

export interface ApprovalContext {
  approvedAt: string;
  workflowId: string;
}

export interface ExecutionContext {
  workflowId: string;
  executionId: string;
  userApproval?: ApprovalContext;
  scopes: ResourceScope[];
  signal?: AbortSignal;
  metadata: Record<string, unknown>;
  mode?: ExecutionMode;
}

export interface ScopeResult {
  allowed: boolean;
  reason?: string;
}

export type ExecutionMode = 'EXECUTE' | 'DRY_RUN' | 'COMPENSATE';

export type VerificationResult = 'SUCCESS' | 'FAILED' | 'UNKNOWN';

export interface DryRunResult {
  affectedResources: any[]; // Using any[] for now, will map to ResourceInfo later if needed
  estimatedSize: number;
  estimatedCount: number;
  risk: RiskLevel;
  reversibility: 'REVERSIBLE' | 'PARTIALLY_REVERSIBLE' | 'IRREVERSIBLE';
  reason?: string;
}

export interface CompensationIntent {
  capabilityId: string;
  args: Record<string, unknown>;
}

export interface ResourceRequirement {
  uri: string;
  access: 'READ' | 'WRITE' | 'EXCLUSIVE';
}

export interface ConcurrencyPolicy {
  maxConcurrent: number;
}

export interface Capability<TArgs = Record<string, unknown>, TResult = unknown> {
  readonly id: string;
  readonly description: string;

  readonly category:
    | 'system'
    | 'file'
    | 'network'
    | 'shell'
    | 'ai'
    | 'browser'
    | 'application'
    | 'media'
    | 'memory';

  readonly parameters: Record<string, ParameterDef>;

  // Trusted metadata
  readonly riskLevel: RiskLevel;
  readonly mutatesExternalState: boolean;
  readonly isReversible: boolean;
  readonly retryPolicy: 'AUTO' | 'NEVER';
  readonly concurrencyPolicy?: ConcurrencyPolicy;

  // For routing in the legacy SecurityToolExecutor
  readonly toolGroup: string;

  // Handlers
  validateScope(args: TArgs, context: ExecutionContext): ScopeResult;
  execute(args: TArgs, context: ExecutionContext): Promise<TResult>;
  
  dryRun?(args: TArgs, context: ExecutionContext): Promise<DryRunResult>;
  verify?(args: TArgs, result: TResult, context: ExecutionContext): Promise<VerificationResult>;
  getCompensationIntent?(args: TArgs, result: TResult, context: ExecutionContext): Promise<CompensationIntent | null>;
  getRequiredLocks?(args: TArgs, context: ExecutionContext): Promise<ResourceRequirement[]>;
}

export interface ProviderHealth {
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  latencyMs?: number;
  lastError?: string;
}

export interface CapabilityProvider {
  readonly id: string;
  readonly type: 'builtin' | 'filesystem' | 'browser' | 'application' | 'plugin' | 'legacy_adapter';
  
  capabilities(): Capability<any, any>[];
  health(): ProviderHealth;
  
  start?(): Promise<void>;
  stop?(): Promise<void>;
}
