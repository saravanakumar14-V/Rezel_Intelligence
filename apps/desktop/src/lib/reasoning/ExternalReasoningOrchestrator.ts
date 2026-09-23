import { WorkflowRuntime } from '../ai/WorkflowRuntime';
import { WorkflowRecoveryManager } from '../ai/persistence/WorkflowRecoveryManager';
import type { Plan, PlanStep, Workflow } from '../ai/types';
import { ReasoningRouter, ReasoningRouterImpl } from './ReasoningRouter';
import { ResponseInterpreter } from './ResponseInterpreter';
import { ActionNormalizer } from './ActionNormalizer';
import { ActionValidator } from './ActionValidator';
import { ResultCollector } from './ResultCollector';
import { ContextAssembler } from './ContextAssembler';
import { ApprovalPolicyManager } from './ApprovalPolicyManager';
import { CheckpointManager } from './CheckpointManager';
import { ReasoningSession, type ReasoningSessionOptions } from './ReasoningSession';
import { getReasoningSessionStore, ReasoningSessionStore } from './ReasoningSessionStore';
import { getReasoningAuditLogger, ReasoningAuditLogger } from './ReasoningAuditLogger';
import type {
  AgentAction,
  ReasoningRequest,
  CycleResult,
  ReasoningProviderResult,
} from './types';

export class ExternalReasoningOrchestrator {
  private router: ReasoningRouterImpl;
  private store: ReasoningSessionStore;
  private logger: ReasoningAuditLogger;

  constructor(
    router: ReasoningRouterImpl = ReasoningRouter,
    store: ReasoningSessionStore = getReasoningSessionStore(),
    logger: ReasoningAuditLogger = getReasoningAuditLogger()
  ) {
    this.router = router;
    this.store = store;
    this.logger = logger;
  }

  /**
   * Recovers a reasoning session across a crash/restart boundary using WorkflowRecoveryManager.
   * DOES NOT automatically resume execution.
   */
  async recoverSession(session: ReasoningSession): Promise<ReasoningSession> {
    const recoveredWorkflows = await WorkflowRecoveryManager.recoverWorkflows();
    const existingWorkflow = session.workflowId
      ? recoveredWorkflows.find((w) => w.id === session.workflowId) ?? null
      : null;

    session.recoverAssociation(existingWorkflow);
    if (session.status === 'RECOVERY_REQUIRED') {
      this.logger.log({
        eventType: 'reasoning_recovery_required',
        sessionId: session.sessionId,
        workflowId: session.workflowId,
        payload: session.getRecoveryStateSummary(),
      });
    }
    await this.store.saveSession(session);
    return session;
  }

  /**
   * Converts validated AgentAction[] into an existing Plan structure.
   */
  static convertActionsToPlan(
    goal: string,
    actions: AgentAction[],
    projectId?: string,
    options?: {
      taskProfile?: import('../ai/providers/types').TaskProfile;
      planningRoute?: import('../ai/providers/types').ProviderRoute;
    }
  ): Plan {
    const steps: PlanStep[] = actions.map((action) => {
      return {
        id: action.id, // Preserves normalized ID
        description: action.description,
        toolName: action.capabilityId,
        toolArgs: action.args,
        dependsOn: action.dependsOn,
        status: 'PENDING',
        attempts: 0,
        maxRetries: 1,
        verificationPredicate: action.verificationPredicate,
        // riskHint is NOT converted to risk classification; the security policy engine evaluates real risk at runtime
      };
    });

    return {
      id: `plan_${crypto.randomUUID()}`,
      projectId,
      goal,
      steps,
      status: 'PLANNED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      taskProfile: options?.taskProfile,
      planningRoute: options?.planningRoute,
    };
  }

  /**
   * Creates a new ReasoningSession
   */
  createSession(options: ReasoningSessionOptions): ReasoningSession {
    return new ReasoningSession(options);
  }

  /**
   * Resumes an AWAITING_APPROVAL session with user answer without losing cycle history.
   */
  async resumeSessionWithAnswer(
    session: ReasoningSession,
    answer: string,
    signal?: AbortSignal
  ): Promise<CycleResult> {
    if (session.status !== 'AWAITING_APPROVAL' && session.status !== 'INITIALIZED') {
      throw new Error(`Cannot resume session in status '${session.status}'`);
    }

    session.transitionStatus('REASONING');
    return this.executeCycle(session, signal, answer);
  }

  /**
   * Runs a single reasoning cycle.
   */
  async executeCycle(
    session: ReasoningSession,
    signal?: AbortSignal,
    userAnswer?: string
  ): Promise<CycleResult> {
    const cycleStartTime = Date.now();
    const nextCycleIndex = session.currentCycle + 1;

    // Check budget limits
    const budgetCheck = session.checkBudget();
    if (budgetCheck.exhausted) {
      session.transitionStatus('BUDGET_EXHAUSTED');
      this.logger.log({
        eventType: 'reasoning_budget_exhausted',
        sessionId: session.sessionId,
        cycleIndex: nextCycleIndex,
        payload: { reason: budgetCheck.reason },
      });
      await this.store.saveSession(session);
      throw new Error(`Reasoning session budget exhausted: ${budgetCheck.reason}`);
    }

    if (signal?.aborted) {
      session.transitionStatus('CANCELLED');
      this.logger.log({
        eventType: 'reasoning_session_cancelled',
        sessionId: session.sessionId,
        cycleIndex: nextCycleIndex,
        payload: { reason: 'User cancellation' },
      });
      await this.store.saveSession(session);
      throw new Error('Reasoning session cancelled by user');
    }

    this.logger.log({
      eventType: 'reasoning_cycle_started',
      sessionId: session.sessionId,
      cycleIndex: nextCycleIndex,
      payload: { goal: session.goal, currentTokens: session.totalTokensUsed },
    });

    // 1. Select provider via ReasoningRouter with fallback support
    session.transitionStatus('REASONING');
    let provider = await this.router.selectProvider({
      preferredProvider: session.providerId,
    });
    this.logger.log({
      eventType: 'reasoning_provider_selected',
      sessionId: session.sessionId,
      cycleIndex: nextCycleIndex,
      payload: { providerId: provider.id },
    });

    // 2. Build sanitized context dynamically using ContextAssembler
    const context = ContextAssembler.build(session);

    const goalPrompt = userAnswer
      ? `${session.goal}\nUser Clarification: ${userAnswer}`
      : session.goal;

    const request: ReasoningRequest = {
      goal: goalPrompt,
      context,
    };

    let providerResult: ReasoningProviderResult;
    try {
      providerResult = await provider.reason(request, signal);
      this.logger.log({
        eventType: 'reasoning_response_received',
        sessionId: session.sessionId,
        cycleIndex: nextCycleIndex,
        payload: { providerId: provider.id, tokenUsage: providerResult.tokenUsage },
      });
    } catch (err: any) {
      // If primary provider failed, attempt fallback via B2 router
      try {
        const fallbackProvider = await this.router.selectProvider({
          requireStructuredOutput: true,
          excludeProviderIds: [provider.id],
        });
        if (fallbackProvider.id !== provider.id) {
          this.logger.log({
            eventType: 'reasoning_provider_fallback',
            sessionId: session.sessionId,
            cycleIndex: nextCycleIndex,
            payload: { from: provider.id, to: fallbackProvider.id },
          });
          provider = fallbackProvider;
          session.providerId = fallbackProvider.id;
          providerResult = await provider.reason(request, signal);
        } else {
          throw err;
        }
      } catch (finalErr: any) {
        session.transitionStatus('FAILED');
        this.logger.log({
          eventType: 'reasoning_error',
          sessionId: session.sessionId,
          cycleIndex: nextCycleIndex,
          payload: { error: finalErr.message || String(finalErr) },
        });
        await this.store.saveSession(session);
        throw finalErr;
      }
    }

    // 3. Interpret response
    session.transitionStatus('INTERPRETING');
    const response = ResponseInterpreter.parse(providerResult);

    if (response.status === 'NEED_INFO') {
      session.transitionStatus('AWAITING_APPROVAL');
      this.logger.log({
        eventType: 'reasoning_approval_required',
        sessionId: session.sessionId,
        cycleIndex: nextCycleIndex,
        payload: { reason: 'Model requested user clarification', questions: response.questionsForUser },
      });
      const cycleResult = ResultCollector.collect({
        cycleIndex: nextCycleIndex,
        acceptedActions: [],
        rejectedActionSummaries: [],
        tokenUsage: providerResult.tokenUsage,
        durationMs: Date.now() - cycleStartTime,
        projectId: session.projectId,
      });
      session.addCycleResult(cycleResult);
      await this.store.saveSession(session);
      return cycleResult;
    }

    if (response.status === 'COMPLETE') {
      session.transitionStatus('COMPLETED');
      this.logger.log({
        eventType: 'reasoning_session_completed',
        sessionId: session.sessionId,
        cycleIndex: nextCycleIndex,
        payload: { summary: response.summary },
      });
      const cycleResult = ResultCollector.collect({
        cycleIndex: nextCycleIndex,
        acceptedActions: [],
        rejectedActionSummaries: [],
        tokenUsage: providerResult.tokenUsage,
        durationMs: Date.now() - cycleStartTime,
        projectId: session.projectId,
      });
      session.addCycleResult(cycleResult);
      await this.store.saveSession(session);
      return cycleResult;
    }

    if (response.status === 'ABORT' || response.status === 'ERROR') {
      session.transitionStatus('FAILED');
      this.logger.log({
        eventType: 'reasoning_session_failed',
        sessionId: session.sessionId,
        cycleIndex: nextCycleIndex,
        payload: { reason: response.summary },
      });
      const cycleResult = ResultCollector.collect({
        cycleIndex: nextCycleIndex,
        acceptedActions: [],
        rejectedActionSummaries: [],
        tokenUsage: providerResult.tokenUsage,
        durationMs: Date.now() - cycleStartTime,
        projectId: session.projectId,
      });
      session.addCycleResult(cycleResult);
      await this.store.saveSession(session);
      return cycleResult;
    }

    // 4. Normalize actions
    for (const act of response.actions) {
      this.logger.log({
        eventType: 'reasoning_action_proposed',
        sessionId: session.sessionId,
        cycleIndex: nextCycleIndex,
        actionId: act.id,
        payload: { actionType: act.type, description: act.description },
      });
    }

    const { actions: rawActions, validationResult: normValidation } = ActionNormalizer.normalize(
      response.actions
    );

    if (!normValidation.valid) {
      this.logger.log({
        eventType: 'reasoning_action_rejected',
        sessionId: session.sessionId,
        cycleIndex: nextCycleIndex,
        payload: { reason: normValidation.reason || 'Normalization failed' },
      });
      const cycleResult = ResultCollector.collect({
        cycleIndex: nextCycleIndex,
        acceptedActions: [],
        rejectedActionSummaries: [
          {
            actionId: 'normalization',
            reason: normValidation.reason || 'Action graph normalization failed',
            code: 'DEPENDENCY_ERROR',
          },
        ],
        tokenUsage: providerResult.tokenUsage,
        durationMs: Date.now() - cycleStartTime,
        projectId: session.projectId,
      });
      session.addCycleResult(cycleResult);
      await this.store.saveSession(session);
      return cycleResult;
    }

    // 5. Validate actions (includes BLOCK 1 path safety and BLOCK 4 UNKNOWN block)
    const { accepted, rejected } = ActionValidator.validate(rawActions, {
      projectRootPath: session.projectId,
      unknownMutationRecords: session.unknownMutationRecords,
    });

    for (const acc of accepted) {
      this.logger.log({
        eventType: 'reasoning_action_validated',
        sessionId: session.sessionId,
        cycleIndex: nextCycleIndex,
        actionId: acc.id,
        payload: { actionType: acc.type },
      });
    }
    for (const rej of rejected) {
      this.logger.log({
        eventType: 'reasoning_action_rejected',
        sessionId: session.sessionId,
        cycleIndex: nextCycleIndex,
        actionId: rej.actionId,
        payload: { reason: rej.reason, code: rej.code },
      });
    }

    if (accepted.length === 0) {
      const cycleResult = ResultCollector.collect({
        cycleIndex: nextCycleIndex,
        acceptedActions: [],
        rejectedActionSummaries: rejected,
        tokenUsage: providerResult.tokenUsage,
        durationMs: Date.now() - cycleStartTime,
        projectId: session.projectId,
      });
      session.addCycleResult(cycleResult);
      await this.store.saveSession(session);
      return cycleResult;
    }

    // 6. ApprovalPolicy check (SUPERVISED / BALANCED / AUTONOMOUS)
    const shouldPause = ApprovalPolicyManager.shouldPauseForApproval({
      policyLevel: session.approvalPolicy,
      proposedActions: accepted,
      consecutiveAutoCycles: session.cycles.length,
      maxConsecutiveAutoCycles: 3,
    });

    if (shouldPause && !userAnswer) {
      session.transitionStatus('AWAITING_APPROVAL');
      this.logger.log({
        eventType: 'reasoning_approval_required',
        sessionId: session.sessionId,
        cycleIndex: nextCycleIndex,
        payload: { reason: `Approval policy '${session.approvalPolicy}' requested confirmation` },
      });
      const cycleResult = ResultCollector.collect({
        cycleIndex: nextCycleIndex,
        acceptedActions: accepted,
        rejectedActionSummaries: rejected,
        tokenUsage: providerResult.tokenUsage,
        durationMs: Date.now() - cycleStartTime,
        projectId: session.projectId,
      });
      session.addCycleResult(cycleResult);
      await this.store.saveSession(session);
      return cycleResult;
    }

    // 7. Map actions to Plan
    const plan = ExternalReasoningOrchestrator.convertActionsToPlan(
      session.goal,
      accepted,
      session.projectId
    );

    // Create project-level checkpoint metadata before executing risky actions
    if (session.projectId) {
      const chk = CheckpointManager.createCheckpoint({
        sessionId: session.sessionId,
        cycleIndex: nextCycleIndex,
        projectId: session.projectId,
        workflowSummary: `Cycle ${nextCycleIndex} executing ${accepted.length} actions`,
      });
      session.checkpointId = chk.checkpointId;
      this.logger.log({
        eventType: 'reasoning_checkpoint_created',
        sessionId: session.sessionId,
        cycleIndex: nextCycleIndex,
        payload: { checkpointId: chk.checkpointId },
      });
    }

    // 8. Two-Phase Workflow Association
    session.transitionStatus('EXECUTING');
    session.associateWorkflowPending();

    // Start workflow via existing WorkflowRuntime authority
    const workflow = WorkflowRuntime.start(plan);
    session.associateWorkflowStarted(workflow.id);
    this.logger.log({
      eventType: 'reasoning_workflow_started',
      sessionId: session.sessionId,
      cycleIndex: nextCycleIndex,
      workflowId: workflow.id,
      payload: { actionCount: accepted.length },
    });

    // 9. Await workflow completion
    const completedWorkflow = await this.awaitWorkflow(workflow.id, signal);

    session.associateWorkflowCompleted(
      completedWorkflow.status === 'SUCCEEDED'
        ? 'SUCCEEDED'
        : completedWorkflow.status === 'CANCELLED'
        ? 'CANCELLED'
        : 'FAILED'
    );
    this.logger.log({
      eventType: 'reasoning_workflow_completed',
      sessionId: session.sessionId,
      cycleIndex: nextCycleIndex,
      workflowId: completedWorkflow.id,
      payload: { status: completedWorkflow.status },
    });

    // 10. Collect results
    session.transitionStatus('OBSERVING');
    const cycleResult = ResultCollector.collect({
      cycleIndex: nextCycleIndex,
      acceptedActions: accepted,
      rejectedActionSummaries: rejected,
      workflow: completedWorkflow,
      tokenUsage: providerResult.tokenUsage,
      durationMs: Date.now() - cycleStartTime,
      projectId: session.projectId,
    });

    session.addCycleResult(cycleResult);

    if (cycleResult.verificationSummary) {
      this.logger.log({
        eventType: 'reasoning_verification_completed',
        sessionId: session.sessionId,
        cycleIndex: nextCycleIndex,
        workflowId: completedWorkflow.id,
        payload: { verificationSummary: cycleResult.verificationSummary },
      });
    }

    this.logger.log({
      eventType: 'reasoning_cycle_completed',
      sessionId: session.sessionId,
      cycleIndex: nextCycleIndex,
      workflowId: completedWorkflow.id,
      payload: { outcome: cycleResult.workflowOutcome },
    });

    await this.store.saveSession(session);
    return cycleResult;
  }

  /**
   * Listens for workflow completion or abort signal
   */
  private awaitWorkflow(workflowId: string, signal?: AbortSignal): Promise<Workflow> {
    return new Promise((resolve) => {
      const checkState = () => {
        const wf = WorkflowRuntime.get(workflowId);
        if (wf) {
          if (
            wf.status === 'SUCCEEDED' ||
            wf.status === 'FAILED' ||
            wf.status === 'PARTIALLY_SUCCEEDED' ||
            wf.status === 'CANCELLED' ||
            wf.status === 'RECOVERY_REQUIRED'
          ) {
            cleanup();
            return resolve(wf);
          }
        }
      };

      const handler = (event: any) => {
        if (event.workflowId === workflowId) {
          checkState();
        }
      };

      const abortHandler = () => {
        WorkflowRuntime.cancel(workflowId);
        checkState();
      };

      WorkflowRuntime.addEventHandler(handler);
      if (signal) {
        signal.addEventListener('abort', abortHandler);
      }

      const cleanup = () => {
        WorkflowRuntime.removeEventHandler(handler);
        if (signal) {
          signal.removeEventListener('abort', abortHandler);
        }
      };

      // Initial check
      checkState();
    });
  }
}
