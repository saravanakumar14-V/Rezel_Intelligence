/**
 * Rezel 13.2.4 — Application Planning Adapter
 *
 * Central coordinator bridging high-level user intents with Application Intelligence:
 * 1. Intent resolution (ApplicationIntentResolver)
 * 2. Application profile resolution (ApplicationResolutionEngine)
 * 3. Operation selection (OperationSelectionEngine)
 * 4. Runtime state inference (ApplicationStateInferenceEngine)
 * 5. Precondition gating & Tri-State evaluation
 * 6. Compilation (DeclarativeOperationCompiler)
 * 7. Safe handoff to downstream execution pipeline (ComputerActionExecutor via PlanEngine/WorkflowRuntime)
 *
 * Strict Non-Autonomy Boundary:
 * - NEVER invents operations or actions outside profile.operations.
 * - NEVER autonomously explores the UI upon failure.
 * - Reports typed, explainable failures to the user.
 */

import { ApplicationStateInferenceEngine } from '../../inference/ApplicationStateInferenceEngine';
import { DeclarativeOperationCompiler } from '../../compiler/DeclarativeOperationCompiler';
import { ComputerActionExecutor } from '../../computer/ComputerActionExecutor';
import { EmergencyAbort } from '../../computer/EmergencyAbort';
import { ResourceLockManager } from '../../scheduler/ResourceLockManager';
import { ApplicationRegistry } from '../../../applications/ApplicationRegistry';
import { PolicyEngine } from '../../../security/policy/PolicyEngine';
import { ExecutionRecoveryCoordinator } from '../../adobe/ExecutionRecoveryCoordinator';
import { RenderFileVerifier } from '../../adobe/RenderFileVerifier';
import type { ComputerActionResult } from '../../computer/types';
import type { ApplicationSessionManager } from '../../../director/ApplicationSessionManager';
import type {
  ApplicationPlanningRequest,
  PlannerPlanningResult,
  PlannedApplicationOperation,
  PlanningDecisionRecord,
  ExecutionResult,
  PlannedOperationExecutionResult,
} from './types';
import { ApplicationIntentResolver } from './ApplicationIntentResolver';
import { ApplicationResolutionEngine } from './ApplicationResolutionEngine';
import { OperationSelectionEngine } from './OperationSelectionEngine';
import { PlannerErrorExplainer } from './PlannerErrorExplainer';
import type { PlanStep } from '../../types';

export class ApplicationPlanningAdapterImpl {
  private decisionHistory: PlanningDecisionRecord[] = [];
  private readonly maxHistorySize = 50;

  /**
   * Plans an application operation from a natural user prompt or request.
   * Pure Planning Guarantee: Does NOT execute computer actions.
   */
  async planOperation(
    request: ApplicationPlanningRequest,
    sessionManager?: ApplicationSessionManager
  ): Promise<PlannerPlanningResult> {
    const { query, source = 'USER', explicitAppId, parameters = {}, sessionId = 'default' } = request;

    // ─── 1. Resolve Intent ───────────────────────────────────────────────────
    const intent = ApplicationIntentResolver.resolveIntent(
      query,
      source,
      explicitAppId,
      parameters
    );

    // ─── 2. Resolve Application ──────────────────────────────────────────────
    const appRes = ApplicationResolutionEngine.resolveApplication(
      intent.explicitAppId,
      sessionManager
    );

    if (!appRes.success) {
      const explanation = PlannerErrorExplainer.explain({
        failureCode: appRes.failureCode,
        reason: appRes.reason,
        candidateAppIds: appRes.candidateAppIds,
      });

      this.recordDecision({
        query,
        intent,
        candidateOperations: [],
        runtimeStateObserved: false,
        compilationSuccess: false,
        executionHandoff: false,
        timestamp: Date.now(),
      });

      return {
        success: false,
        failureCode: appRes.failureCode,
        reason: appRes.reason,
        userExplanation: explanation,
        candidateAppIds: appRes.candidateAppIds,
      };
    }

    const profile = appRes.profile;

    // ─── 3. Select Registered Operation ───────────────────────────────────────
    const opRes = OperationSelectionEngine.selectOperation(
      intent.operationQuery,
      profile
    );

    if (!opRes.success) {
      const explanation = PlannerErrorExplainer.explain({
        failureCode: opRes.failureCode,
        reason: opRes.reason,
        appId: profile.appId,
        appName: profile.name,
        candidateOperationIds: opRes.candidateOperationIds,
      });

      this.recordDecision({
        query,
        intent,
        resolvedAppId: profile.appId,
        candidateOperations: opRes.candidateOperationIds || [],
        runtimeStateObserved: false,
        compilationSuccess: false,
        executionHandoff: false,
        timestamp: Date.now(),
      });

      return {
        success: false,
        failureCode: opRes.failureCode,
        reason: opRes.reason,
        userExplanation: explanation,
        appId: profile.appId,
        candidateOperationIds: opRes.candidateOperationIds,
      };
    }

    const operation = opRes.operation;

    // ─── 4. Runtime State Inference ───────────────────────────────────────────
    let runtimeState = request.runtimeState;
    if (!runtimeState) {
      try {
        runtimeState = await ApplicationStateInferenceEngine.inferState({
          applicationId: profile.appId,
          sessionId,
          forceRefresh: request.forceRefresh,
        });
      } catch (err: any) {
        const explanation = PlannerErrorExplainer.explain({
          failureCode: 'UNKNOWN_APPLICATION_STATE',
          reason: `State inference failed: ${err?.message || err}`,
          appId: profile.appId,
          appName: profile.name,
          operationId: operation.id,
          operationName: operation.description,
        });

        return {
          success: false,
          failureCode: 'UNKNOWN_APPLICATION_STATE',
          reason: `Failed to infer state for '${profile.appId}': ${err?.message || err}`,
          userExplanation: explanation,
          appId: profile.appId,
          operationId: operation.id,
        };
      }
    }

    // ─── 5. Check Operation Preconditions ─────────────────────────────────────
    for (const pre of operation.preconditions) {
      const stateObj = runtimeState.activeStates[pre];
      if (!stateObj || stateObj.isTrue === 'FALSE') {
        const explanation = PlannerErrorExplainer.explain({
          failureCode: 'PRECONDITION_FAILED',
          reason: `Precondition '${pre}' evaluated to FALSE`,
          appId: profile.appId,
          appName: profile.name,
          operationId: operation.id,
          operationName: operation.description,
          failedPrecondition: pre,
        });

        this.recordDecision({
          query,
          intent,
          resolvedAppId: profile.appId,
          candidateOperations: [operation.id],
          selectedOperationId: operation.id,
          runtimeStateObserved: true,
          preconditionResult: `FAILED:${pre}`,
          compilationSuccess: false,
          executionHandoff: false,
          timestamp: Date.now(),
        });

        return {
          success: false,
          failureCode: 'PRECONDITION_FAILED',
          reason: `Precondition '${pre}' is FALSE for operation '${operation.id}'`,
          userExplanation: explanation,
          appId: profile.appId,
          operationId: operation.id,
          details: { failedPrecondition: pre },
        };
      }

      if (stateObj.isTrue === 'UNKNOWN') {
        const explanation = PlannerErrorExplainer.explain({
          failureCode: 'UNKNOWN_APPLICATION_STATE',
          reason: `Precondition '${pre}' has UNKNOWN truth value (insufficient evidence)`,
          appId: profile.appId,
          appName: profile.name,
          operationId: operation.id,
          operationName: operation.description,
          failedPrecondition: pre,
        });

        return {
          success: false,
          failureCode: 'UNKNOWN_APPLICATION_STATE',
          reason: `Precondition '${pre}' is UNKNOWN for operation '${operation.id}'`,
          userExplanation: explanation,
          appId: profile.appId,
          operationId: operation.id,
          details: { failedPrecondition: pre },
        };
      }
    }

    // ─── 6. Compile via DeclarativeOperationCompiler ──────────────────────────
    const compileRes = await DeclarativeOperationCompiler.compile({
      appId: profile.appId,
      operationId: operation.id,
      sessionId,
      parameters: intent.parameters,
      runtimeState,
      uiObservation: request.uiObservation,
      forceRefresh: request.forceRefresh,
    });

    if (!compileRes.success) {
      const explanation = PlannerErrorExplainer.explain({
        failureCode: compileRes.failureCode === 'INVALID_PARAMETERS' ? 'INVALID_PARAMETERS' : 'COMPILATION_FAILED',
        reason: compileRes.reason,
        appId: profile.appId,
        appName: profile.name,
        operationId: operation.id,
        operationName: operation.description,
      });

      this.recordDecision({
        query,
        intent,
        resolvedAppId: profile.appId,
        candidateOperations: [operation.id],
        selectedOperationId: operation.id,
        runtimeStateObserved: true,
        preconditionResult: 'SATISFIED',
        compilationSuccess: false,
        executionHandoff: false,
        timestamp: Date.now(),
      });

      return {
        success: false,
        failureCode: compileRes.failureCode === 'INVALID_PARAMETERS' ? 'INVALID_PARAMETERS' : 'COMPILATION_FAILED',
        reason: compileRes.reason,
        userExplanation: explanation,
        appId: profile.appId,
        operationId: operation.id,
        details: compileRes.details,
      };
    }

    // ─── 7. Wrap into PlannedApplicationOperation ─────────────────────────────
    const planStep: PlanStep = {
      id: `step_${operation.id}_${Date.now()}`,
      description: `${profile.name}: ${operation.description}`,
      toolName: 'application_operation',
      toolArgs: {
        appId: profile.appId,
        operationId: operation.id,
        parameters: intent.parameters,
        compiledPlan: compileRes.plan,
      },
      status: 'PENDING',
      attempts: 0,
      risk: 'LOW',
    };

    const plannedOperation: PlannedApplicationOperation = {
      operationId: operation.id,
      applicationId: profile.appId,
      compiledPlan: compileRes.plan,
      planStep,
      plannedAt: Date.now(),
    };

    this.recordDecision({
      query,
      intent,
      resolvedAppId: profile.appId,
      candidateOperations: [operation.id],
      selectedOperationId: operation.id,
      runtimeStateObserved: true,
      preconditionResult: 'SATISFIED',
      compilationSuccess: true,
      executionHandoff: true,
      timestamp: Date.now(),
    });

    return {
      success: true,
      plannedOperation,
      profile,
      operation,
      runtimeState,
    };
  }

  /**
   * Executes a planned application operation through either the native application adapter
   * or the standard 13.1 ComputerActionExecutor substrate.
   * This is called by downstream execution runners (PlanEngine / WorkflowRuntime), NOT during planning.
   */
  async executePlannedOperation(
    planned: PlannedApplicationOperation,
    options: {
      currentUIState?: import('../../ui/types').UIAnalysisResult;
      workflowId?: string;
      executionId?: string;
    } = {}
  ): Promise<PlannedOperationExecutionResult> {
    const workflowId = options.workflowId || `wf_${Date.now()}`;
    const executionId = options.executionId || `exec_${planned.operationId}_${Date.now()}`;
    const startTime = Date.now();

    // 1. Check EmergencyAbort
    if (EmergencyAbort.isAborted()) {
      const errorMsg = `Execution halted by EmergencyAbort: ${EmergencyAbort.getReason()}`;
      return {
        success: false,
        status: 'CANCELLED',
        results: [],
        error: errorMsg,
        executionResult: {
          success: false,
          status: 'CANCELLED',
          operationId: planned.operationId,
          applicationId: planned.applicationId,
          error: errorMsg,
          durationMs: Date.now() - startTime,
        },
      };
    }

    const nativeStrategy = planned.compiledPlan.nativeStrategy;

    // 2. Acquire ResourceLock
    const lockUri = `app:${planned.applicationId}`;
    await ResourceLockManager.acquireLocks(workflowId, executionId, [
      { uri: lockUri, access: 'WRITE' },
    ]);

    try {
      // ─── Native Adapter Routing Path ──────────────────────────────────────
      if (nativeStrategy) {
        // 3. Resolve native adapter
        const adapter = ApplicationRegistry.get(nativeStrategy.adapterId);

        // 4. Verify adapter health
        const health = adapter ? adapter.getHealth(planned.compiledPlan.sessionId) : undefined;
        const isReady = adapter && health && health.state === 'READY';

        if (!isReady) {
          // If native execution has no UIA actions, we must NOT fall back to blind UI clicking
          if (planned.compiledPlan.actions.length === 0) {
            const errorMsg = `Native adapter for '${nativeStrategy.adapterId}' is unavailable (state: ${health?.state || 'DISCONNECTED'})`;
            return {
              success: false,
              status: 'DISCONNECTED',
              results: [],
              error: errorMsg,
              executionResult: {
                success: false,
                status: 'DISCONNECTED',
                operationId: planned.operationId,
                applicationId: planned.applicationId,
                adapterId: nativeStrategy.adapterId,
                error: errorMsg,
                durationMs: Date.now() - startTime,
              },
            };
          }
          // If actions are present, fall through to UIA execution
        } else {
          // Check EmergencyAbort again prior to dispatch
          if (EmergencyAbort.isAborted()) {
            const errorMsg = `Execution halted immediately before native dispatch by EmergencyAbort: ${EmergencyAbort.getReason()}`;
            return {
              success: false,
              status: 'CANCELLED',
              results: [],
              error: errorMsg,
              executionResult: {
                success: false,
                status: 'CANCELLED',
                operationId: planned.operationId,
                applicationId: planned.applicationId,
                adapterId: nativeStrategy.adapterId,
                error: errorMsg,
                durationMs: Date.now() - startTime,
              },
            };
          }

          // 5. Apply security authorization
          const rawParams = (planned.planStep.toolArgs?.parameters as Record<string, unknown>) || {};
          const policyResult = await PolicyEngine.evaluate({
            capabilityId: nativeStrategy.capabilityId,
            toolGroup: 'application',
            args: rawParams,
            activeScopes: [],
          });

          if (policyResult.decision === 'DENY') {
            const errorMsg = `PolicyEngine denied native operation '${nativeStrategy.capabilityId}': ${policyResult.reason}`;
            return {
              success: false,
              status: 'DENIED',
              results: [],
              error: errorMsg,
              executionResult: {
                success: false,
                status: 'DENIED',
                operationId: planned.operationId,
                applicationId: planned.applicationId,
                adapterId: nativeStrategy.adapterId,
                error: errorMsg,
                durationMs: Date.now() - startTime,
              },
            };
          }

          // Capture pre-render baseline if operation is render
          let renderBaseline: any = undefined;
          if (
            planned.operationId === 'start_render' ||
            nativeStrategy.capabilityId === 'ae_start_render' ||
            planned.operationId === 'ae_start_render'
          ) {
            renderBaseline = await RenderFileVerifier.capturePreRenderSnapshot(
              (rawParams.outputFilePath as string) || (rawParams.path as string)
            );
          }

          // 6. Execute native capability
          const opResult = await adapter.execute({
            operationId: planned.operationId,
            applicationId: planned.applicationId,
            sessionId: planned.compiledPlan.sessionId,
            capabilityId: nativeStrategy.capabilityId,
            parameters: rawParams,
            mutatesExternalState: true,
            context: {
              workflowId,
              executionId,
              stepId: planned.planStep.id,
            },
          });

          // Invalidate inference/inspector caches immediately after dispatch attempt
          ApplicationStateInferenceEngine.notifyActionExecuted(
            planned.applicationId,
            planned.compiledPlan.sessionId,
            'GENERIC_MUTATION'
          );

          // 7. Check if recovery is needed (uncertain outcome / timeout / disconnect)
          if (!opResult.success && ExecutionRecoveryCoordinator.isRecoverable(opResult)) {
            return await ExecutionRecoveryCoordinator.coordinateRecovery({
              planned,
              nativeStrategy,
              adapter,
              opResult,
              rawParams,
              workflowId,
              executionId,
              startTime,
              renderBaseline,
            });
          }

          // 8. Map definitive result to unified ExecutionResult
          let status: ExecutionResult['status'] = 'SUCCESS';
          if (!opResult.success) {
            if (
              opResult.outcome === 'UNKNOWN' ||
              opResult.error?.includes('DISCONNECTED') ||
              opResult.error?.includes('ae_ipc_timeout')
            ) {
              status = 'DISCONNECTED';
            } else {
              status = 'FAILED';
            }
          }

          const executionResult: ExecutionResult = {
            success: opResult.success,
            status,
            operationId: planned.operationId,
            applicationId: planned.applicationId,
            adapterId: nativeStrategy.adapterId,
            outcome: opResult.output,
            error: opResult.error,
            durationMs: opResult.durationMs ?? (Date.now() - startTime),
          };

          return {
            success: opResult.success,
            status,
            executionResult,
            results: [],
            error: opResult.error,
          };
        }
      }

      // ─── Standard UIA / ComputerAction Execution Path ──────────────────────
      const results: ComputerActionResult[] = [];

      for (const action of planned.compiledPlan.actions) {
        const res = await ComputerActionExecutor.execute(action, {
          currentUIState: options.currentUIState,
          workflowId,
          executionId,
        });

        results.push(res);

        if (res.status !== 'SUCCESS') {
          const errorMsg = res.error || `Action ${action.actionId} (${action.type}) failed with status ${res.status}`;
          return {
            success: false,
            status: res.status === 'DENIED' ? 'DENIED' : 'FAILED',
            results,
            error: errorMsg,
            executionResult: {
              success: false,
              status: res.status === 'DENIED' ? 'DENIED' : 'FAILED',
              operationId: planned.operationId,
              applicationId: planned.applicationId,
              error: errorMsg,
              durationMs: Date.now() - startTime,
            },
          };
        }
      }

      return {
        success: true,
        status: 'SUCCESS',
        results,
        executionResult: {
          success: true,
          status: 'SUCCESS',
          operationId: planned.operationId,
          applicationId: planned.applicationId,
          durationMs: Date.now() - startTime,
        },
      };
    } finally {
      // 9. Guarantee ResourceLock release
      ResourceLockManager.releaseLocks(workflowId, executionId);
    }
  }

  /**
   * Retrieves decision records for diagnostics.
   */
  getDecisionHistory(): readonly PlanningDecisionRecord[] {
    return [...this.decisionHistory];
  }

  /**
   * Resets decision history.
   */
  resetHistory(): void {
    this.decisionHistory = [];
  }

  private recordDecision(record: PlanningDecisionRecord): void {
    this.decisionHistory.push(record);
    if (this.decisionHistory.length > this.maxHistorySize) {
      this.decisionHistory.shift();
    }
  }
}

export const ApplicationPlanningAdapter = new ApplicationPlanningAdapterImpl();
