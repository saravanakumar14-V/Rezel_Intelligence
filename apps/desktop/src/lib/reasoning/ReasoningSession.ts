import type {
  ReasoningSessionStatus,
  ReasoningWorkflowAssociationStatus,
  ReasoningCycle,
  ReasoningSessionRecord,
  ApprovalPolicyLevel,
  CycleResult,
  UnknownMutationRecord,
} from './types';

export interface ReasoningSessionOptions {
  sessionId?: string;
  goal: string;
  projectId?: string;
  providerId: string;
  approvalPolicy?: ApprovalPolicyLevel;
  maxCycles?: number;
  maxTotalTokens?: number;
  timeoutMs?: number;
  maxConsecutiveFailedCycles?: number;
}

export class ReasoningSession {
  readonly sessionId: string;
  readonly goal: string;
  readonly projectId?: string;
  providerId: string;
  status: ReasoningSessionStatus;
  approvalPolicy: ApprovalPolicyLevel;

  readonly createdAt: string;
  updatedAt: string;

  readonly maxCycles: number;
  readonly maxTotalTokens: number;
  readonly timeoutMs: number;
  readonly maxConsecutiveFailedCycles: number;

  currentCycle: number;
  totalTokensUsed: number;
  elapsedMs: number;

  cycles: ReasoningCycle[];
  lastCycleResult?: CycleResult;
  workflowId?: string;
  checkpointId?: string;
  associationStatus: ReasoningWorkflowAssociationStatus;

  unknownMutationRecords: UnknownMutationRecord[];
  consecutiveFailedCycles: number;

  constructor(options: ReasoningSessionOptions) {
    this.sessionId = options.sessionId ?? `rs_${crypto.randomUUID()}`;
    this.goal = options.goal;
    this.projectId = options.projectId;
    this.providerId = options.providerId;
    this.approvalPolicy = options.approvalPolicy ?? 'BALANCED';

    this.status = 'INITIALIZED';
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();

    this.maxCycles = options.maxCycles ?? 10;
    this.maxTotalTokens = options.maxTotalTokens ?? 100000;
    this.timeoutMs = options.timeoutMs ?? 300000;
    this.maxConsecutiveFailedCycles = options.maxConsecutiveFailedCycles ?? 3;

    this.currentCycle = 0;
    this.totalTokensUsed = 0;
    this.elapsedMs = 0;

    this.cycles = [];
    this.associationStatus = 'NONE';
    this.unknownMutationRecords = [];
    this.consecutiveFailedCycles = 0;
  }

  transitionStatus(newStatus: ReasoningSessionStatus): void {
    this.status = newStatus;
    this.updatedAt = new Date().toISOString();
  }

  associateWorkflowPending(): void {
    this.associationStatus = 'PENDING';
    this.updatedAt = new Date().toISOString();
  }

  associateWorkflowStarted(workflowId: string): void {
    this.workflowId = workflowId;
    this.associationStatus = 'STARTED';
    this.updatedAt = new Date().toISOString();
  }

  associateWorkflowCompleted(outcome: 'SUCCEEDED' | 'FAILED' | 'CANCELLED'): void {
    if (outcome === 'SUCCEEDED') {
      this.associationStatus = 'COMPLETED';
    } else if (outcome === 'CANCELLED') {
      this.associationStatus = 'FAILED';
    } else {
      this.associationStatus = 'FAILED';
    }
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Recovers two-phase workflow association state on restart/crash boundary.
   */
  recoverAssociation(existingWorkflow?: { id: string; status: string } | null): void {
    if (this.associationStatus === 'PENDING') {
      // PENDING + no workflow -> safely abort stale association
      this.associationStatus = 'FAILED';
      this.status = 'RECOVERY_REQUIRED';
    } else if (this.associationStatus === 'STARTED') {
      if (existingWorkflow && existingWorkflow.id === this.workflowId) {
        // STARTED + workflow exists -> reattach
        this.associationStatus = 'STARTED';
      } else {
        // STARTED + workflow missing -> RECOVERY_REQUIRED
        this.associationStatus = 'FAILED';
        this.status = 'RECOVERY_REQUIRED';
      }
    }
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Reconciles an UNKNOWN mutation outcome upon observation/recovery.
   */
  reconcileUnknown(
    fingerprintHash: string,
    outcome: 'VERIFIED' | 'NOT_VERIFIED' | 'UNKNOWN'
  ): void {
    if (outcome === 'VERIFIED') {
      // Reconciled as verified — remove from active unknown mutation block list
      this.unknownMutationRecords = this.unknownMutationRecords.filter(
        (r) => r.fingerprint.hash !== fingerprintHash
      );
    }
    // NOT_VERIFIED and UNKNOWN remain unresolved/blocked from auto-retry
    this.updatedAt = new Date().toISOString();
  }

  /**
   * Returns a safe recovery state summary without exposing hidden CoT.
   */
  getRecoveryStateSummary(): Record<string, unknown> {
    return {
      sessionId: this.sessionId,
      goal: this.goal,
      projectId: this.projectId,
      status: this.status,
      currentCycle: this.currentCycle,
      workflowId: this.workflowId,
      associationStatus: this.associationStatus,
      lastOutcome: this.lastCycleResult?.workflowOutcome,
      verificationSummary: this.lastCycleResult?.verificationSummary,
      unknownMutationCount: this.unknownMutationRecords.length,
      checkpointId: this.checkpointId,
    };
  }

  recordTokenUsage(input: number, output: number): void {
    this.totalTokensUsed += input + output;
    this.updatedAt = new Date().toISOString();
  }

  addCycleResult(result: CycleResult): void {
    const cycleRecord: ReasoningCycle = {
      cycleIndex: result.cycleIndex,
      startedAt: new Date(Date.now() - result.durationMs).toISOString(),
      completedAt: new Date().toISOString(),
      providerId: this.providerId,
      tokenUsage: result.tokenUsage,
      proposedActionCount: result.acceptedActions.length + result.rejectedActionSummaries.length,
      acceptedActionCount: result.acceptedActions.length,
      rejectedActionCount: result.rejectedActionSummaries.length,
      workflowId: this.workflowId,
      workflowOutcome: result.workflowOutcome,
      verificationSummary: result.verificationSummary,
      errors: result.errors,
    };

    this.cycles.push(cycleRecord);
    this.lastCycleResult = result;
    this.currentCycle = result.cycleIndex;
    this.recordTokenUsage(result.tokenUsage.input, result.tokenUsage.output);

    // Track UNKNOWN mutation records for H-04 block
    if (result.unknownMutations && result.unknownMutations.length > 0) {
      this.unknownMutationRecords.push(...result.unknownMutations);
    }

    // Track consecutive failures
    if (result.workflowOutcome === 'FAILED' || (result.errors && result.errors.length > 0)) {
      this.consecutiveFailedCycles++;
    } else if (result.workflowOutcome === 'SUCCEEDED') {
      this.consecutiveFailedCycles = 0;
    }

    this.updatedAt = new Date().toISOString();
  }

  checkBudget(): { exhausted: boolean; reason?: string } {
    if (this.currentCycle >= this.maxCycles) {
      return { exhausted: true, reason: `Max cycles limit reached (${this.maxCycles})` };
    }
    if (this.totalTokensUsed >= this.maxTotalTokens) {
      return { exhausted: true, reason: `Max token budget exceeded (${this.totalTokensUsed}/${this.maxTotalTokens})` };
    }
    if (this.elapsedMs >= this.timeoutMs) {
      return { exhausted: true, reason: `Session timeout reached (${this.elapsedMs}ms)` };
    }
    if (this.consecutiveFailedCycles >= this.maxConsecutiveFailedCycles) {
      return { exhausted: true, reason: `Max consecutive cycle failures reached (${this.consecutiveFailedCycles})` };
    }
    return { exhausted: false };
  }

  toRecord(): ReasoningSessionRecord {
    return {
      sessionId: this.sessionId,
      goal: this.goal,
      projectId: this.projectId,
      providerId: this.providerId,
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      maxCycles: this.maxCycles,
      maxTotalTokens: this.maxTotalTokens,
      timeoutMs: this.timeoutMs,
      currentCycle: this.currentCycle,
      totalTokensUsed: this.totalTokensUsed,
      elapsedMs: this.elapsedMs,
      cycles: [...this.cycles],
      approvalPolicy: this.approvalPolicy,
      workflowId: this.workflowId,
      associationStatus: this.associationStatus,
    };
  }
}
