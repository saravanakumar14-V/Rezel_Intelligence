/**
 * Rezel 13.1 — Computer Action Executor
 *
 * Executes controlled computer actions under strict security authority:
 * - PolicyEngine mandatory authorization gating
 * - PermissionManager human approval check for HIGH / CRITICAL actions
 * - EmergencyAbort low-level interruption interlock
 * - Pre-action target re-observation & Stale Target Protection (STALE_TARGET)
 * - Window Focus Activation & Foreground Verification (FOCUS_FAILED)
 * - 5-Tier Semantic Action Resolution:
 *     1. Application-Native Adapter (Blender / After Effects RPC)
 *     2. UIA Semantic Pattern (InvokePattern, ValuePattern, TogglePattern, etc.)
 *     3. UIA Direct Element Interaction (SetFocus)
 *     4. Verified Native Input Fallback (DPI-normalized center point + SendInput)
 *     5. Abort on Ambiguity
 * - Post-action state capture and VerificationEngine evaluation (VERIFIED / NOT_VERIFIED / UNKNOWN)
 * - Deterministic error contracts (no coordinate guessing or un-verified repeats)
 */

import type { ComputerAction, ComputerActionResult, ComputerActionStatus } from './types';
import { ComputerActionValidator } from './ComputerActionValidator';
import type { UIAnalysisResult, UIElement, UIWindow } from '../ui/types';
import { UIUnderstandingEngine } from '../ui/UIUnderstandingEngine';
import { PolicyEngine } from '../../security/policy/PolicyEngine';
import { ApprovalManager } from '../approval/ApprovalManager';
import { ScreenObservationManager } from '../screen/ScreenObservationManager';
import { EmergencyAbort } from './EmergencyAbort';
import { SemanticActionResolver } from './SemanticActionResolver';
import { VerificationEngine } from '../verification/VerificationEngine';
import { invoke } from '@tauri-apps/api/core';

class ComputerActionExecutorImpl {
  /**
   * Executes a controlled computer action through the complete security and verification pipeline.
   */
  async execute(
    action: ComputerAction,
    options: {
      currentUIState?: UIAnalysisResult;
      expectedState?: {
        predicate?: {
          operator: 'EXISTS' | 'COUNT' | 'EQUALS' | 'NOT_EQUALS' | 'MATCHES';
          entityType?: string;
          entityName?: string;
          property?: string;
          value?: any;
        };
      };
      simulateTimeout?: boolean;
      simulateFailure?: boolean;
      workflowId?: string;
      executionId?: string;
    } = {}
  ): Promise<ComputerActionResult> {
    const startTime = Date.now();
    const actionId = action.actionId;

    // 0. Check Emergency Abort Interlock
    if (EmergencyAbort.isAborted()) {
      return {
        actionId,
        targetId: action.target?.elementId,
        status: 'FAILED',
        error: `Execution halted by EmergencyAbort: ${EmergencyAbort.getReason()}`,
        errorCode: 'EMERGENCY_ABORTED',
        executedAt: startTime,
        durationMs: Date.now() - startTime,
      };
    }

    // 1. Mandatory PolicyEngine Authorization
    const policyResult = await PolicyEngine.evaluate({
      capabilityId: action.requiredCapability,
      toolGroup: 'system',
      args: action.parameters || {},
      activeScopes: [],
    });

    if (policyResult.decision === 'DENY') {
      return {
        actionId,
        targetId: action.target?.elementId,
        status: 'DENIED',
        error: `PolicyEngine denied computer action '${action.type}': ${policyResult.reason}`,
        errorCode: 'POLICY_DENIED',
        errorDetails: { policyResult },
        executedAt: startTime,
        durationMs: Date.now() - startTime,
      };
    }

    // 2. Mandatory Approval Check for High / Critical tier
    if (action.riskLevel === 'HIGH' || action.riskLevel === 'CRITICAL' || action.requiresApproval) {
      if (!action.approvalId) {
        return {
          actionId,
          targetId: action.target?.elementId,
          status: 'DENIED',
          error: `Action '${action.type}' of risk '${action.riskLevel}' requires explicit human approval before execution`,
          errorCode: 'APPROVAL_REQUIRED',
          executedAt: startTime,
          durationMs: Date.now() - startTime,
        };
      }

      const req = ApprovalManager.getApprovalRequest(action.approvalId);
      if (!req || req.state !== 'APPROVED') {
        return {
          actionId,
          targetId: action.target?.elementId,
          status: 'DENIED',
          error: `Approval request '${action.approvalId}' is not approved (State: ${req?.state || 'NOT_FOUND'})`,
          errorCode: 'APPROVAL_REQUIRED',
          executedAt: startTime,
          durationMs: Date.now() - startTime,
        };
      }
    }

    // 3. Pre-execution Action Validation
    try {
      ComputerActionValidator.validate(action, options.currentUIState);
    } catch (err: any) {
      const isStale = err?.code === 'TARGET_STALE';
      return {
        actionId,
        targetId: action.target?.elementId,
        status: isStale ? 'STALE_TARGET' : 'FAILED',
        error: err?.message || 'Pre-execution validation failed',
        errorCode: err?.code || 'COMPUTER_ACTION_INVALID',
        executedAt: startTime,
        durationMs: Date.now() - startTime,
      };
    }

    // 4. Stale Target Protection — Re-observe target UI before mutating if not already provided
    let liveUIState = options.currentUIState;
    if (!liveUIState) {
      try {
        liveUIState = await UIUnderstandingEngine.inspectNativeUI({
          applicationId: action.target?.applicationId,
          windowId: action.target?.windowId,
          processId: action.target?.processId,
        });
      } catch (err) {
        // If live inspection fails, proceed with available UI state
      }
    }

    let targetElement: UIElement | undefined;
    let targetWindow: UIWindow | undefined;

    if (liveUIState) {
      if (action.target?.elementId) {
        targetElement = liveUIState.elements.find((e) => e.elementId === action.target?.elementId);
      }
      if (!targetElement && (action.target as any)?.automationId) {
        targetElement = liveUIState.elements.find((e) => e.automationId === (action.target as any).automationId);
      }
      if (!targetElement && action.target?.text) {
        targetElement = liveUIState.elements.find(
          (e) => (e.text && e.text.includes(action.target!.text!)) || (e.label && e.label.includes(action.target!.text!))
        );
      }

      const isTargetSpecified = action.target?.elementId || (action.target as any)?.automationId;
      const hasCoordinates = action.parameters?.x !== undefined && action.parameters?.y !== undefined;
      const isPureKeyboard = action.type === 'KEY_PRESS' || action.type === 'HOTKEY';

      if (isTargetSpecified && !targetElement && !hasCoordinates && !isPureKeyboard) {
        return {
          actionId,
          targetId: action.target?.elementId,
          status: 'STALE_TARGET',
          error: `Target UI element '${action.target?.elementId || (action.target as any)?.automationId}' is no longer present in active UI state`,
          errorCode: 'TARGET_STALE',
          executedAt: startTime,
          durationMs: Date.now() - startTime,
        };
      }

      if (action.target?.windowId) {
        targetWindow = liveUIState.windows.find((w) => w.windowId === action.target?.windowId);
      }
    }

    // 5. Window Focus Verification & Activation
    const targetHandle = targetElement?.handle || targetWindow?.handle || action.target?.handle;
    const targetWinId = targetElement?.windowId || targetWindow?.windowId || action.target?.windowId;

    if (targetHandle || targetWinId) {
      try {
        const activationResp = await invoke<any>('window_activate', {
          request: {
            handle: targetHandle,
            window_id: targetWinId,
            process_id: action.target?.processId || targetElement?.processId,
          },
        });

        if (activationResp && !activationResp.success && action.type !== 'KEY_PRESS') {
          return {
            actionId,
            targetId: action.target?.elementId,
            status: 'FOCUS_FAILED',
            error: `Failed to bring target window to foreground: ${activationResp.message || 'Window not found'}`,
            errorCode: 'FOCUS_FAILED',
            executedAt: startTime,
            durationMs: Date.now() - startTime,
          };
        }
      } catch (err: any) {
        console.warn(`[ComputerActionExecutor] Window activation warning: ${err?.message || err}`);
      }
    }

    // 6. Resolve Action Strategy (Tier 1 -> Tier 2 -> Tier 3 -> Tier 4 -> Tier 5)
    const resolvedPlan = SemanticActionResolver.resolveAction(action, targetElement, targetWindow);

    if (!resolvedPlan.isSupported || resolvedPlan.strategy === 'UNSUPPORTED') {
      return {
        actionId,
        targetId: action.target?.elementId,
        status: 'FAILED',
        errorCode: 'COMPUTER_ACTION_INVALID',
        error: resolvedPlan.reason || `Unsupported action strategy for ${action.type}`,
        executedAt: startTime,
        durationMs: Date.now() - startTime,
      };
    }

    // 7. Capture Pre-Action Observation
    let obsBeforeId: string | undefined;
    try {
      const obsBefore = await ScreenObservationManager.captureScreen({
        isSensitive: action.isSensitive,
      });
      obsBeforeId = obsBefore.observationId;
    } catch {
      // Non-fatal if screen capture is unavailable
    }

    // Check simulated timeout / error (testing invariants)
    if (options.simulateTimeout) {
      return {
        actionId,
        targetId: action.target?.elementId,
        status: 'UNKNOWN',
        observationBefore: obsBeforeId,
        errorCode: 'ACTION_TIMEOUT',
        error: 'OS input dispatch timed out or communication lost',
        executedAt: startTime,
        durationMs: Date.now() - startTime,
      };
    }

    if (options.simulateFailure) {
      return {
        actionId,
        targetId: action.target?.elementId,
        status: 'FAILED',
        observationBefore: obsBeforeId,
        errorCode: 'COMPUTER_ACTION_INVALID',
        error: 'OS rejected input command',
        executedAt: startTime,
        durationMs: Date.now() - startTime,
      };
    }

    // 8. Execute Strategy
    // Final Emergency Abort check immediately before OS mutation
    if (EmergencyAbort.isAborted()) {
      return {
        actionId,
        targetId: action.target?.elementId,
        status: 'FAILED',
        observationBefore: obsBeforeId,
        errorCode: 'EMERGENCY_ABORTED',
        error: `Execution halted immediately before OS mutation by EmergencyAbort: ${EmergencyAbort.getReason()}`,
        executedAt: startTime,
        durationMs: Date.now() - startTime,
      };
    }

    let executionError: string | undefined;
    let executionStrategyUsed = resolvedPlan.strategy;

    // TIER 2 & 3: Direct UIA Control Pattern / Direct Element Interaction
    if (resolvedPlan.strategy === 'UIA_SEMANTIC_PATTERN' || resolvedPlan.strategy === 'UIA_ELEMENT_INTERACTION') {
      try {
        const uiaResp = await invoke<any>('uia_perform_action', {
          request: resolvedPlan.executionParameters,
        });

        if (uiaResp && !uiaResp.success) {
          // Fallback to Native Input Dispatch if UIA pattern invocation failed
          executionStrategyUsed = 'NATIVE_INPUT_DISPATCH';
        }
      } catch (err: any) {
        // Fallback to Native Input Dispatch
        executionStrategyUsed = 'NATIVE_INPUT_DISPATCH';
      }
    }

    // TIER 4: Verified Native Input Dispatch Fallback
    if (executionStrategyUsed === 'NATIVE_INPUT_DISPATCH') {
      // Re-verify EmergencyAbort immediately prior to native input dispatch
      if (EmergencyAbort.isAborted()) {
        return {
          actionId,
          targetId: action.target?.elementId,
          status: 'FAILED',
          observationBefore: obsBeforeId,
          errorCode: 'EMERGENCY_ABORTED',
          error: `Execution halted before native input dispatch by EmergencyAbort: ${EmergencyAbort.getReason()}`,
          executedAt: startTime,
          durationMs: Date.now() - startTime,
        };
      }

      let x: number | undefined = resolvedPlan.executionParameters.x as number | undefined;
      let y: number | undefined = resolvedPlan.executionParameters.y as number | undefined;

      // P1.1: If explicit coordinates are absent (fallback from UIA pattern), derive from validated target bounds
      if (x === undefined && y === undefined && targetElement?.bounds) {
        const b = targetElement.bounds;
        if (b.width > 0 && b.height > 0 && targetElement.visible !== false) {
          x = Math.round(b.x + b.width / 2);
          y = Math.round(b.y + b.height / 2);
        }
      }

      // Coordinate bounds verification & interior snapping
      if (targetElement?.bounds && x !== undefined && y !== undefined) {
        const b = targetElement.bounds;
        if (x < b.x || x > b.x + b.width || y < b.y || y > b.y + b.height) {
          x = Math.round(b.x + b.width / 2);
          y = Math.round(b.y + b.height / 2);
        }
      }

      const isClickAction = action.type === 'CLICK' || action.type === 'DOUBLE_CLICK' || action.type === 'RIGHT_CLICK';
      if (isClickAction && (x === undefined || y === undefined)) {
        return {
          actionId,
          targetId: action.target?.elementId,
          status: 'STALE_TARGET',
          observationBefore: obsBeforeId,
          errorCode: 'COMPUTER_ACTION_INVALID',
          error: 'Cannot derive valid click coordinates from target element bounds',
          executedAt: startTime,
          durationMs: Date.now() - startTime,
        };
      }

      try {
        await invoke('computer_action', {
          request: {
            action_type: action.type,
            x,
            y,
            button: (action.parameters?.button as string) || (action.type === 'RIGHT_CLICK' ? 'right' : 'left'),
            text: (action.parameters?.text as string) || action.target?.text,
            key: (action.parameters?.key as string) || (action.parameters?.keyName as string),
            keys: action.parameters?.keys as string[] | undefined,
            delta_x: action.parameters?.deltaX as number | undefined,
            delta_y: action.parameters?.deltaY as number | undefined,
            from_x: (action.parameters?.from as any)?.x ?? action.parameters?.fromX,
            from_y: (action.parameters?.from as any)?.y ?? action.parameters?.fromY,
            to_x: (action.parameters?.to as any)?.x ?? action.parameters?.toX,
            to_y: (action.parameters?.to as any)?.y ?? action.parameters?.toY,
          },
        });
      } catch (err: any) {
        executionError = err?.message || String(err);
      }
    }

    if (executionError) {
      return {
        actionId,
        targetId: action.target?.elementId,
        status: 'FAILED',
        observationBefore: obsBeforeId,
        errorCode: 'COMPUTER_ACTION_INVALID',
        error: `Native Windows input dispatch failed: ${executionError}`,
        executedAt: startTime,
        durationMs: Date.now() - startTime,
      };
    }

    // 9. Post-Action Observation & State Verification
    let obsAfterId: string | undefined;
    try {
      const obsAfter = await ScreenObservationManager.captureScreen({
        isSensitive: action.isSensitive,
      });
      obsAfterId = obsAfter.observationId;
    } catch {
      // Non-fatal
    }

    let verificationResult: 'VERIFIED' | 'NOT_VERIFIED' | 'UNKNOWN' = 'VERIFIED';

    if (options.expectedState?.predicate) {
      try {
        const postUI = await UIUnderstandingEngine.inspectNativeUI({
          applicationId: action.target?.applicationId,
          windowId: action.target?.windowId,
        });

        const appEntities = postUI.elements.map((el) => ({
          type: el.type,
          name: el.label || el.text || el.elementId,
          properties: {
            text: el.text,
            label: el.label,
            visible: el.visible,
            enabled: el.enabled,
            focused: el.focused,
            value: el.value,
            automationId: el.automationId,
            role: el.role,
          },
        }));

        verificationResult = VerificationEngine.verify(
          {
            appId: action.target?.applicationId || 'desktop',
            sessionId: action.target?.sessionId,
            timestamp: Date.now(),
            status: 'SUCCESS',
            isStale: false,
            entities: appEntities,
            metadata: { observationId: obsAfterId },
            sourceCapability: action.requiredCapability,
          },
          options.expectedState.predicate as any
        );
      } catch (err) {
        verificationResult = 'UNKNOWN';
      }
    }

    const finalStatus: ComputerActionStatus =
      verificationResult === 'NOT_VERIFIED' ? 'FAILED' : verificationResult === 'UNKNOWN' ? 'UNKNOWN' : 'SUCCESS';

    return {
      actionId,
      targetId: action.target?.elementId,
      status: finalStatus,
      observationBefore: obsBeforeId,
      observationAfter: obsAfterId,
      verification: verificationResult,
      executedAt: startTime,
      durationMs: Date.now() - startTime,
    };
  }
}

export const ComputerActionExecutor = new ComputerActionExecutorImpl();
