import type { VerificationPredicate } from '../ai/verification/types';
import type { ProjectContextSnapshot } from '../workspace/types';

// ─── 1. Provider Types ────────────────────────────────────────────────────────

export type ReasoningProviderType = 'OPENAI' | 'GEMINI' | 'QWEN' | 'LOCAL' | 'CUSTOM';

export interface ReasoningProviderConfig {
  readonly id: string;
  readonly type: ReasoningProviderType;
  readonly displayName: string;
  readonly apiEndpoint?: string;
  readonly modelId?: string;
  readonly maxContextTokens: number;
  readonly supportsStructuredOutput: boolean;
  readonly supportsStreaming: boolean;
  readonly costTier: 'FREE' | 'LOW' | 'MEDIUM' | 'HIGH';
  readonly priority: number;
}

export interface ReasoningRequest {
  readonly goal: string;
  readonly context: ReasoningContext;
  readonly previousCycleResult?: CycleResult;
  readonly structuredOutputSchema?: Record<string, unknown>;
  readonly maxResponseTokens?: number;
}

export interface ReasoningProviderResult {
  readonly raw: string;
  readonly structured?: ReasoningResponse;
  readonly tokenUsage: { input: number; output: number };
  readonly latencyMs: number;
  readonly providerId: string;
}

export interface ReasoningProvider {
  readonly id: string;
  readonly type: ReasoningProviderType;
  readonly config: ReasoningProviderConfig;

  isAvailable(): Promise<boolean>;
  reason(request: ReasoningRequest, signal?: AbortSignal): Promise<ReasoningProviderResult>;
}

export type ReasoningProviderErrorCode =
  | 'UNAVAILABLE'
  | 'AUTHENTICATION_FAILURE'
  | 'RATE_LIMIT'
  | 'TIMEOUT'
  | 'MALFORMED_RESPONSE'
  | 'NETWORK_FAILURE'
  | 'ABORTED'
  | 'NO_ELIGIBLE_PROVIDER'
  | 'CONFIGURATION_ERROR';

export class ReasoningProviderError extends Error {
  readonly code: ReasoningProviderErrorCode;
  readonly providerId?: string;

  constructor(code: ReasoningProviderErrorCode, message: string, providerId?: string) {
    super(`[${code}]${providerId ? ` (${providerId})` : ''}: ${message}`);
    this.name = 'ReasoningProviderError';
    this.code = code;
    this.providerId = providerId;
  }
}


// ─── 2. Reasoning Context ─────────────────────────────────────────────────────

/**
 * Sanitized Reasoning Context
 *
 * MUST NOT contain:
 * - Credentials / API keys
 * - Active locks
 * - PIDs / HWNDs / raw process handles
 * - Hidden chain-of-thought
 * - Raw full file contents
 * - PolicyEngine internals
 */
export interface ReasoningContext {
  readonly projectSnapshot: ProjectContextSnapshot | null;
  readonly conversationSummary: {
    readonly messageCount: number;
    readonly recentMessages: Array<{ role: string; content: string }>;
  };
  readonly applicationContext: {
    readonly appId: string;
    readonly connectionStatus: string;
    readonly capabilities: string[];
  } | null;
  readonly availableCapabilities: Array<{
    readonly id: string;
    readonly description: string;
    readonly category: string;
  }>;
  readonly previousCycleResult?: CycleResult;
  readonly currentCycle: number;
  readonly remainingBudget: {
    readonly cycles: number;
    readonly tokens: number;
  };
}

// ─── 3. Session Types ─────────────────────────────────────────────────────────

export type ReasoningSessionStatus =
  | 'INITIALIZED'
  | 'REASONING'
  | 'INTERPRETING'
  | 'EXECUTING'
  | 'OBSERVING'
  | 'AWAITING_APPROVAL'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'BUDGET_EXHAUSTED'
  | 'RECOVERY_REQUIRED';

export type ReasoningWorkflowAssociationStatus =
  | 'NONE'
  | 'PENDING'
  | 'STARTED'
  | 'COMPLETED'
  | 'FAILED'
  | 'RECOVERY_REQUIRED';

export interface ReasoningCycle {
  readonly cycleIndex: number;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly providerId: string;
  readonly tokenUsage: { input: number; output: number };
  readonly proposedActionCount: number;
  readonly acceptedActionCount: number;
  readonly rejectedActionCount: number;
  readonly workflowId?: string;
  readonly workflowOutcome?: 'SUCCEEDED' | 'FAILED' | 'PARTIALLY_SUCCEEDED' | 'CANCELLED';
  readonly verificationSummary?: string;
  readonly errors?: SanitizedErrorContext[];
}

export interface ReasoningSession {
  readonly sessionId: string;
  readonly goal: string;
  readonly projectId?: string;
  readonly providerId: string;
  readonly status: ReasoningSessionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly maxCycles: number;
  readonly maxTotalTokens: number;
  readonly timeoutMs: number;
  readonly currentCycle: number;
  readonly totalTokensUsed: number;
  readonly elapsedMs: number;
  readonly cycles: ReasoningCycle[];
  readonly approvalPolicy: ApprovalPolicyLevel;
  readonly workflowId?: string;
  readonly associationStatus: ReasoningWorkflowAssociationStatus;
}

// ─── 4. Structured Response ───────────────────────────────────────────────────

export type ReasoningResponseStatus = 'ACTIONS' | 'COMPLETE' | 'NEED_INFO' | 'ERROR' | 'ABORT';

export interface ReasoningResponse {
  readonly status: ReasoningResponseStatus;
  readonly summary: string;
  readonly actions: AgentAction[];
  readonly observationsNeeded?: string[];
  readonly questionsForUser?: string[];
  readonly verificationPredicates?: VerificationPredicate[];
  readonly nextStepHint?: string;
  /** Self-assessed model confidence (0-1). Treated strictly as metadata, never authority. */
  readonly confidence?: number;
}

// ─── 5. Action Types ──────────────────────────────────────────────────────────

export type AgentActionType =
  | 'READ_FILE'
  | 'WRITE_FILE'
  | 'CREATE_FILE'
  | 'DELETE_FILE'
  | 'RUN_COMMAND'
  | 'SEARCH_PROJECT'
  | 'INSPECT_APPLICATION'
  | 'MODIFY_APPLICATION'
  | 'REQUEST_USER_APPROVAL'
  | 'OBSERVE'
  | 'VERIFY'
  | 'COMPLETE';

export interface AgentAction {
  /** Rezel-generated normalized ID. Model-provided IDs are non-authoritative. */
  readonly id: string;
  readonly type: AgentActionType;
  readonly capabilityId?: string;
  readonly args: Record<string, unknown>;
  readonly description: string;
  readonly dependsOn?: string[];
  readonly expectedOutcome?: string;
  readonly verificationPredicate?: VerificationPredicate;
  /** Risk hint provided by model. Metadata only — PolicyEngine is the real risk authority. */
  readonly riskHint?: 'LOW' | 'MEDIUM' | 'HIGH';
}

// ─── 6. Action Rejection Types ────────────────────────────────────────────────

export type RejectionCode =
  | 'UNKNOWN_ACTION'
  | 'UNKNOWN_CAPABILITY'
  | 'INVALID_ARGUMENTS'
  | 'PATH_OUT_OF_SCOPE'
  | 'DEPENDENCY_ERROR'
  | 'DUPLICATE_ACTION_ID'
  | 'SECURITY_VALIDATION_FAILED'
  | 'UNKNOWN_MUTATION_BLOCKED';

export interface RejectedAction {
  readonly actionId: string;
  readonly reason: string;
  readonly code: RejectionCode;
}

// ─── 7. Dependency Graph Types ────────────────────────────────────────────────

export interface NormalizedActionNode {
  readonly id: string;
  readonly action: AgentAction;
  readonly dependsOn: string[];
}

export interface ActionGraphValidationResult {
  readonly valid: boolean;
  readonly reason?: string;
  readonly cycleNodes?: string[];
  readonly missingReferences?: string[];
}

// ─── 8. Mutation Fingerprint Types (H-04 Protection) ──────────────────────────

/**
 * Mutation Fingerprint
 *
 * Used to detect and block ambiguous/unverified external mutations (UNKNOWN)
 * from being automatically retried in subsequent reasoning cycles.
 */
export interface MutationFingerprint {
  readonly capabilityId: string;
  readonly canonicalArgs: Record<string, unknown>;
  readonly projectId?: string;
  readonly applicationId?: string;
  readonly resourceScope?: string;
  readonly hash: string;
}

export interface UnknownMutationRecord {
  readonly fingerprint: MutationFingerprint;
  readonly workflowId: string;
  readonly cycleIndex: number;
  readonly timestamp: string;
  readonly reason: string;
}

// ─── 9. Approval Policy Types ─────────────────────────────────────────────────

export type ApprovalPolicyLevel = 'SUPERVISED' | 'BALANCED' | 'AUTONOMOUS';

/**
 * Approval Policy Config
 *
 * IMPORTANT: ApprovalPolicy != PolicyEngine.
 * AUTONOMOUS mode controls loop checkpointing frequency only, and NEVER disables
 * per-action PolicyEngine / SafetyValidator security enforcement.
 */
export interface ApprovalPolicyConfig {
  readonly level: ApprovalPolicyLevel;
  readonly maxConsecutiveAutoCycles: number;
}

// ─── 10. Error Types ──────────────────────────────────────────────────────────

export type ErrorCategory =
  | 'CAPABILITY_NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'SECURITY_BLOCKED'
  | 'USER_DENIED'
  | 'EXECUTION_FAILED'
  | 'TIMEOUT'
  | 'VERIFICATION_FAILED'
  | 'APPLICATION_DISCONNECTED'
  | 'UNKNOWN';

/**
 * Sanitized Error Context
 *
 * Future ErrorContextBuilder MUST strip:
 * - Absolute external paths
 * - Stack traces
 * - Process IDs / HWNDs
 * - Environment variables
 * - Credentials / Tokens
 */
export interface SanitizedErrorContext {
  readonly actionId: string;
  readonly actionType: AgentActionType;
  readonly capabilityId: string;
  readonly errorCategory: ErrorCategory;
  readonly errorMessage: string;
  readonly projectContext?: string;
  readonly commandSummary?: string;
  readonly changedFiles?: string[];
  readonly verificationResult?: 'VERIFIED' | 'NOT_VERIFIED' | 'UNKNOWN';
  readonly isRetryable: boolean;
  readonly suggestedRecovery?: string;
}

// ─── 11. Cycle Result ─────────────────────────────────────────────────────────

export interface CycleResult {
  readonly cycleIndex: number;
  readonly acceptedActions: AgentAction[];
  readonly rejectedActionSummaries: RejectedAction[];
  readonly workflowOutcome?: 'SUCCEEDED' | 'FAILED' | 'PARTIALLY_SUCCEEDED' | 'CANCELLED';
  readonly verificationSummary?: string;
  readonly errors?: SanitizedErrorContext[];
  readonly unknownMutations?: UnknownMutationRecord[];
  readonly tokenUsage: { input: number; output: number };
  readonly durationMs: number;
}

// ─── 12. Persistence Contract ─────────────────────────────────────────────────

/**
 * Serializable Reasoning Session Record
 *
 * MUST NOT INCLUDE:
 * - Raw model reasoning
 * - Raw chain-of-thought
 * - Raw full reasoning context
 * - API keys / tokens
 * - AbortController
 * - Runtime promises
 * - Tool execution functions
 * - Locks / Resource handles
 */
export interface ReasoningSessionRecord {
  readonly sessionId: string;
  readonly goal: string;
  readonly projectId?: string;
  readonly providerId: string;
  readonly status: ReasoningSessionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly maxCycles: number;
  readonly maxTotalTokens: number;
  readonly timeoutMs: number;
  readonly currentCycle: number;
  readonly totalTokensUsed: number;
  readonly elapsedMs: number;
  readonly cycles: ReasoningCycle[];
  readonly approvalPolicy: ApprovalPolicyLevel;
  readonly workflowId?: string;
  readonly associationStatus: ReasoningWorkflowAssociationStatus;
  readonly checkpointId?: string;
}

// ─── 13. Checkpoint Metadata Types ───────────────────────────────────────────

export interface CheckpointRecord {
  readonly checkpointId: string;
  readonly sessionId: string;
  readonly cycleIndex: number;
  readonly projectId: string;
  readonly fileHashes: Record<string, string>;
  readonly workflowSummary?: string;
  readonly createdAt: string;
}

export interface CheckpointRollbackResult {
  readonly success: boolean;
  readonly restoredCheckpointId: string;
  readonly warning?: string;
}

// ─── 13. Audit Event Types ────────────────────────────────────────────────────

export type ReasoningAuditEventType =
  | 'reasoning_session_started'
  | 'reasoning_provider_selected'
  | 'reasoning_cycle_started'
  | 'reasoning_response_received'
  | 'reasoning_action_proposed'
  | 'reasoning_action_validated'
  | 'reasoning_action_rejected'
  | 'reasoning_workflow_started'
  | 'reasoning_workflow_completed'
  | 'reasoning_action_executed'
  | 'reasoning_observation_completed'
  | 'reasoning_verification_completed'
  | 'reasoning_error'
  | 'reasoning_provider_fallback'
  | 'reasoning_approval_required'
  | 'reasoning_approval_granted'
  | 'reasoning_approval_denied'
  | 'reasoning_cycle_completed'
  | 'reasoning_session_completed'
  | 'reasoning_session_failed'
  | 'reasoning_session_cancelled'
  | 'reasoning_budget_exhausted'
  | 'reasoning_checkpoint_created'
  | 'reasoning_checkpoint_rolled_back'
  | 'reasoning_recovery_required';

export interface ReasoningAuditEvent {
  readonly eventType: ReasoningAuditEventType;
  readonly sessionId: string;
  readonly cycleIndex?: number;
  readonly timestamp: string;
  readonly payload: Record<string, unknown>;
}

