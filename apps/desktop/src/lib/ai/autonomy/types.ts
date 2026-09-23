/**
 * REZEL PHASE 17 — CONTROLLED AUTONOMY: TYPES & CONTRACTS
 *
 * Defines bounded autonomy state machine states, safety budget specifications,
 * auditable decision trace structures, and goal execution interfaces.
 *
 * STRICT INVARIANTS:
 * - No chain-of-thought exposure (auditable structured decision traces only).
 * - No arbitrary execution / UI exploration types.
 * - Deterministic safety budgets with hard exhaustion triggers.
 */

export type AutonomyState =
  | 'IDLE'
  | 'ANALYZING_GOAL'
  | 'FORMULATING_BOUNDED_PLAN'
  | 'AWAITING_BUDGET_APPROVAL'
  | 'EXECUTING'
  | 'OBSERVING_STATE'
  | 'CORRECTION_REQUIRED'
  | 'EVALUATING_POLICY'
  | 'EXECUTING_CORRECTION'
  | 'ESCALATING_TO_USER'
  | 'PAUSED'
  | 'GOAL_MET'
  | 'BUDGET_EXHAUSTED'
  | 'ABORTED'
  | 'UNSUPPORTED_GOAL';

export type AutonomyClassification =
  | 'GOAL_ACCOMPLISHED'
  | 'UNSUPPORTED_GOAL'
  | 'OPERATION_UNAVAILABLE'
  | 'POLICY_DENIED'
  | 'BUDGET_EXHAUSTED'
  | 'VERIFICATION_FAILED'
  | 'ABORTED'
  | 'APPLICATION_DISCONNECTED'
  | 'CORRECTION_EXHAUSTED';

export interface SafetyBudgetConfig {
  maxOperations?: number;
  maxCorrections?: number;
  maxTokens?: number;
  maxDurationMs?: number;
}

export interface SafetyBudget {
  readonly maxOperations: number;
  readonly maxCorrections: number;
  readonly maxTokens: number;
  readonly maxDurationMs: number;
  operationsUsed: number;
  correctionsUsed: number;
  tokensUsed: number;
  startTime: number;
  durationMs: number;
  exhausted: boolean;
  exhaustionReason?: string;
}

export type DecisionType =
  | 'PLAN_SELECTION'
  | 'OPERATION_EXECUTION'
  | 'STATE_OBSERVATION'
  | 'CORRECTION_FORMULATION'
  | 'POLICY_EVALUATION'
  | 'ESCALATION'
  | 'TERMINATION'
  | 'DISCONNECTION_DETECTED';

export interface AuditableDecision {
  id: string;
  timestamp: number;
  sessionId: string;
  stepId?: string;
  decisionType: DecisionType;
  selectedOperation?: string;
  selectedTemplate?: string;
  policyResult?: 'APPROVED' | 'DENIED' | 'ESCALATION_REQUIRED';
  verificationResult?: 'VERIFIED' | 'NOT_VERIFIED' | 'UNKNOWN';
  recoveryDecision?: 'CORRECT' | 'HALT' | 'ESCALATE';
  budgetRemaining: {
    operations: number;
    corrections: number;
    tokens: number;
    durationMs: number;
  };
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface AutonomyGoal {
  goalId: string;
  rawQuery: string;
  targetApplication?: string;
  declaredInputs?: Record<string, unknown>;
  budget?: SafetyBudgetConfig;
  requireUserApprovalForHighRisk?: boolean;
  autoEscalateOnFailure?: boolean;
}

export interface AutonomyArtifact {
  name: string;
  type: 'FILE' | 'OBJECT_REFERENCE' | 'APPLICATION_RESOURCE' | 'METADATA';
  uri?: string;
  value?: unknown;
  description?: string;
}

export interface AutonomyResult {
  goalId: string;
  sessionId: string;
  state: AutonomyState;
  success: boolean;
  classification: AutonomyClassification;
  outputArtifacts: AutonomyArtifact[];
  decisions: AuditableDecision[];
  budget: SafetyBudget;
  activePlanId?: string;
  workflowId?: string;
  error?: string;
}

export type AutonomyEventType =
  | 'session_started'
  | 'state_changed'
  | 'decision_logged'
  | 'artifact_produced'
  | 'budget_updated'
  | 'session_completed';

export interface AutonomyEvent {
  type: AutonomyEventType;
  sessionId: string;
  goalId?: string;
  goal?: AutonomyGoal;
  state?: AutonomyState;
  previousState?: AutonomyState;
  reason?: string;
  decision?: AuditableDecision;
  artifact?: AutonomyArtifact;
  budget?: SafetyBudget;
  result?: AutonomyResult;
  timestamp: number;
}

export type AutonomyEventHandler = (event: AutonomyEvent) => void;

