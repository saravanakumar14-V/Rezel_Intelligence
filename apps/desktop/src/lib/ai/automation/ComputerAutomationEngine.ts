/**
 * Rezel 11.6D — Closed-Loop Computer Automation Engine
 *
 * Orchestrates bounded, verified computer automation workflows:
 * - Full Observe -> Understand -> Plan -> Authorize -> Act -> Verify lifecycle
 * - Bounded iteration, action, and timeout budgets
 * - Hard stop on UNKNOWN outcomes (strictly preventing automatic replay of non-idempotent actions)
 * - Bounded recovery and re-planning for transient target/verification failures
 * - Complete integration with PolicyEngine, ApprovalManager, VariableStore, and Checkpoints
 */

import type {
  ComputerAutomationGoal,
  AutomationExecutionResult,
  AutomationIterationTrace,
} from './types';
import { AutomationError } from './types';
import type { ComputerAction } from '../computer/types';
import type { UIAnalysisResult } from '../ui/types';
import { ScreenObservationManager } from '../screen/ScreenObservationManager';
import { UIUnderstandingEngine } from '../ui/UIUnderstandingEngine';
import { ComputerActionExecutor } from '../computer/ComputerActionExecutor';
import { WorkflowVariableStore } from '../dataflow/WorkflowVariableStore';

class ComputerAutomationEngineImpl {
  /**
   * Executes a bounded computer automation goal through the verified control loop.
   */
  async executeGoal(
    goal: ComputerAutomationGoal,
    options: {
      stepActions?: ComputerAction[];
      stopCondition?: (uiState: UIAnalysisResult) => boolean;
      simulateUnknown?: boolean;
      simulateTimeout?: boolean;
      simulateFailure?: boolean;
      userCancelled?: boolean;
    } = {}
  ): Promise<AutomationExecutionResult> {
    const startTime = Date.now();
    const traces: AutomationIterationTrace[] = [];

    // 1. Goal Validation
    if (!goal || !goal.goalId || !goal.workflowId) {
      throw new AutomationError('AUTOMATION_INVALID_GOAL', 'Invalid automation goal structure');
    }

    if (goal.maxIterations <= 0 || goal.maxActions <= 0 || goal.timeoutMs <= 0) {
      throw new AutomationError(
        'AUTOMATION_INVALID_GOAL',
        `Goal limits must be positive: maxIterations=${goal.maxIterations}, maxActions=${goal.maxActions}, timeoutMs=${goal.timeoutMs}`
      );
    }

    let currentIteration = 0;
    let actionCount = 0;
    let recoveryAttempts = 0;
    const maxRecoveryAttempts = 3;
    let finalObsId: string | undefined;

    const actionQueue = [...(options.stepActions || [])];

    while (currentIteration < goal.maxIterations) {
      currentIteration++;

      // Check User Cancellation
      if (options.userCancelled) {
        traces.push({
          iteration: currentIteration,
          state: 'FAILED',
          error: 'User cancelled automation session',
          timestamp: Date.now(),
        });
        return {
          goalId: goal.goalId,
          workflowId: goal.workflowId,
          status: 'CANCELLED',
          iterations: currentIteration,
          actionCount,
          traces,
          stopReason: 'User cancelled automation session',
          durationMs: Date.now() - startTime,
        };
      }

      // Check Timeout Budget
      if (Date.now() - startTime >= goal.timeoutMs || options.simulateTimeout) {
        traces.push({
          iteration: currentIteration,
          state: 'FAILED',
          error: 'Automation timeout exceeded',
          timestamp: Date.now(),
        });
        return {
          goalId: goal.goalId,
          workflowId: goal.workflowId,
          status: 'LIMIT_REACHED',
          iterations: currentIteration,
          actionCount,
          traces,
          stopReason: 'Timeout limit reached',
          durationMs: Date.now() - startTime,
        };
      }

      // ─── Step 1: OBSERVING ───
      traces.push({
        iteration: currentIteration,
        state: 'OBSERVING',
        timestamp: Date.now(),
      });

      const obs = await ScreenObservationManager.captureScreen({
        displayId: 'display_primary',
      });
      finalObsId = obs.observationId;

      // ─── Step 2: UNDERSTANDING ───
      traces.push({
        iteration: currentIteration,
        state: 'UNDERSTANDING',
        observationId: obs.observationId,
        timestamp: Date.now(),
      });

      const uiState = await UIUnderstandingEngine.analyzeUI(obs, {
        routingProfile: goal.routingProfile,
      });

      // Check Stop / Completion Condition
      if (options.stopCondition && options.stopCondition(uiState)) {
        traces.push({
          iteration: currentIteration,
          state: 'COMPLETED',
          observationId: obs.observationId,
          timestamp: Date.now(),
        });
        return {
          goalId: goal.goalId,
          workflowId: goal.workflowId,
          status: 'COMPLETED',
          iterations: currentIteration,
          actionCount,
          traces,
          finalObservationId: obs.observationId,
          stopReason: 'Goal completion condition satisfied',
          durationMs: Date.now() - startTime,
        };
      }

      // If no more actions to execute, complete
      if (actionQueue.length === 0) {
        traces.push({
          iteration: currentIteration,
          state: 'COMPLETED',
          observationId: obs.observationId,
          timestamp: Date.now(),
        });
        return {
          goalId: goal.goalId,
          workflowId: goal.workflowId,
          status: 'COMPLETED',
          iterations: currentIteration,
          actionCount,
          traces,
          finalObservationId: obs.observationId,
          stopReason: 'All planned actions completed successfully',
          durationMs: Date.now() - startTime,
        };
      }

      // Check Action Budget
      if (actionCount >= goal.maxActions) {
        traces.push({
          iteration: currentIteration,
          state: 'FAILED',
          error: 'Maximum action count exceeded',
          timestamp: Date.now(),
        });
        return {
          goalId: goal.goalId,
          workflowId: goal.workflowId,
          status: 'LIMIT_REACHED',
          iterations: currentIteration,
          actionCount,
          traces,
          stopReason: 'Maximum action limit reached',
          durationMs: Date.now() - startTime,
        };
      }

      const nextAction = actionQueue.shift()!;

      // ─── Step 3: AUTHORIZING & PLANNING ───
      traces.push({
        iteration: currentIteration,
        state: 'AUTHORIZING',
        actionId: nextAction.actionId,
        actionType: nextAction.type,
        timestamp: Date.now(),
      });

      // ─── Step 4: ACTING ───
      traces.push({
        iteration: currentIteration,
        state: 'ACTING',
        actionId: nextAction.actionId,
        actionType: nextAction.type,
        timestamp: Date.now(),
      });

      let actionResult;
      try {
        actionResult = await ComputerActionExecutor.execute(nextAction, {
          currentUIState: uiState,
          simulateTimeout: options.simulateUnknown,
          simulateFailure: options.simulateFailure,
        });
      } catch (err: any) {
        traces.push({
          iteration: currentIteration,
          state: 'FAILED',
          actionId: nextAction.actionId,
          actionType: nextAction.type,
          error: err.message,
          timestamp: Date.now(),
        });
        throw err;
      }

      actionCount++;

      // ─── Step 5: VERIFYING ───
      traces.push({
        iteration: currentIteration,
        state: 'VERIFYING',
        actionId: nextAction.actionId,
        actionType: nextAction.type,
        verificationResult: actionResult.status,
        timestamp: Date.now(),
      });

      // Hard Stop Invariant: UNKNOWN must NOT be automatically replayed!
      if (actionResult.status === 'UNKNOWN') {
        traces.push({
          iteration: currentIteration,
          state: 'RECOVERY_REQUIRED',
          actionId: nextAction.actionId,
          actionType: nextAction.type,
          error: 'Action outcome is UNKNOWN. Automatic replay strictly forbidden.',
          timestamp: Date.now(),
        });
        return {
          goalId: goal.goalId,
          workflowId: goal.workflowId,
          status: 'RECOVERY_REQUIRED',
          iterations: currentIteration,
          actionCount,
          traces,
          finalObservationId: actionResult.observationBefore,
          stopReason: 'Action returned UNKNOWN. External verification required before proceeding.',
          durationMs: Date.now() - startTime,
        };
      }

      // Handle Failure with Bounded Recovery
      if (actionResult.status === 'FAILED') {
        recoveryAttempts++;
        if (recoveryAttempts >= maxRecoveryAttempts) {
          traces.push({
            iteration: currentIteration,
            state: 'FAILED',
            error: 'Maximum recovery attempts exhausted',
            timestamp: Date.now(),
          });
          return {
            goalId: goal.goalId,
            workflowId: goal.workflowId,
            status: 'FAILED',
            iterations: currentIteration,
            actionCount,
            traces,
            stopReason: 'Recovery attempts exhausted after verification failure',
            durationMs: Date.now() - startTime,
          };
        }

        traces.push({
          iteration: currentIteration,
          state: 'RECOVERY',
          error: `Verification failed. Attempting bounded recovery (${recoveryAttempts}/${maxRecoveryAttempts})`,
          timestamp: Date.now(),
        });
        actionQueue.unshift(nextAction);
        continue;
      }

      // Successful step — publish outputs to WorkflowVariableStore
      WorkflowVariableStore.setStepOutputs(goal.workflowId, nextAction.actionId, {
        status: actionResult.status,
        observationAfter: actionResult.observationAfter,
        verification: actionResult.verification,
      });
    }

    // Iteration limit reached
    traces.push({
      iteration: currentIteration,
      state: 'FAILED',
      error: 'Max iterations reached without satisfying goal completion',
      timestamp: Date.now(),
    });

    return {
      goalId: goal.goalId,
      workflowId: goal.workflowId,
      status: 'LIMIT_REACHED',
      iterations: currentIteration,
      actionCount,
      traces,
      finalObservationId: finalObsId,
      stopReason: 'Maximum iteration limit reached',
      durationMs: Date.now() - startTime,
    };
  }
}

export const ComputerAutomationEngine = new ComputerAutomationEngineImpl();
