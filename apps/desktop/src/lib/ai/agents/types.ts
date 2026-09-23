/**
 * Rezel 11.8D — Long-Running Agents & Durable Autonomous Workflows Types
 *
 * Defines contracts for durable agent sessions, lifecycle state machines,
 * wait conditions, progress tracking, execution limits, and audit traces.
 */

export type AgentLifecycleState =
  | 'CREATED'
  | 'PLANNING'
  | 'READY'
  | 'RUNNING'
  | 'WAITING'
  | 'PAUSED'
  | 'WAITING_FOR_APPROVAL'
  | 'WAITING_FOR_APPLICATION'
  | 'WAITING_FOR_PROVIDER'
  | 'WAITING_FOR_TIME'
  | 'RECOVERING'
  | 'RECOVERY_REQUIRED'
  | 'LIMIT_REACHED'
  | 'STALLED'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type AgentWaitType = 'APPROVAL' | 'APPLICATION' | 'PROVIDER' | 'TIME' | 'EXTERNAL_EVENT';

export interface AgentWaitCondition {
  readonly type: AgentWaitType;
  readonly targetId?: string;
  readonly nextWakeAt?: number;
  readonly reason?: string;
}

export interface AgentLimits {
  readonly maxDurationMs?: number;
  readonly maxActions?: number;
  readonly maxIterations?: number;
  readonly maxCost?: number;
  readonly maxRecoveryAttempts?: number;
}

export interface AgentProgress {
  readonly agentId: string;
  readonly phaseId?: string;
  readonly subgoalId?: string;
  readonly stepId?: string;
  readonly completedSteps: number;
  readonly totalSteps: number;
  readonly percent: number;
  readonly currentActivity?: string;
  readonly waitingReason?: string;
  readonly lastProgressAt: number;
}

export interface AgentTraceEvent {
  readonly eventId: string;
  readonly timestamp: number;
  readonly type: string;
  readonly phaseId?: string;
  readonly stepId?: string;
  readonly description: string;
  readonly metadata?: Record<string, unknown>;
}

export interface DurableAgentSession {
  readonly agentId: string;
  readonly workflowId: string;
  readonly planId: string;
  readonly planVersion: number;
  state: AgentLifecycleState;
  readonly createdAt: number;
  updatedAt: number;
  lastCheckpointId?: string;
  iteration: number;
  actionCount: number;
  completedStepIds: string[];
  currentStepId?: string;
  startedAt?: number;
  pausedAt?: number;
  completedAt?: number;
  nextWakeAt?: number;
  waitCondition?: AgentWaitCondition;
  limits?: AgentLimits;
  actualCost: number;
  providerCalls: number;
  lastHeartbeatAt: number;
  lastProgressAt: number;
  trace: AgentTraceEvent[];
  planUpdateAvailable?: boolean;
}

export type AgentErrorCode =
  | 'AGENT_LIMIT_REACHED'
  | 'AGENT_STALLED'
  | 'APPLICATION_SESSION_STALE'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_EXPIRED'
  | 'UNKNOWN_RECOVERY_GATE'
  | 'PLAN_VERSION_MISMATCH'
  | 'SESSION_NOT_FOUND'
  | 'INVALID_AGENT_TRANSITION';

export class AgentError extends Error {
  readonly code: AgentErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: AgentErrorCode, message: string, details?: Record<string, unknown>) {
    super(`[Agent::${code}] ${message}`);
    this.name = 'AgentError';
    this.code = code;
    this.details = details;
  }
}
