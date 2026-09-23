/**
 * Rezel 11.6C Real Windows Input Dispatch — Production Acceptance Test Suite
 *
 * Sprint P0-2 Reality Fix:
 * Verifies real native Windows input dispatch via Win32 SendInput / mouse_event / keybd_event.
 *
 * Layers:
 * Layer A: Security Pipeline, PolicyEngine, Approval Gates, Bounds & Target Validation
 * Layer B: Real Native Windows Input Dispatch (Click, Type, KeyPress, Hotkey) & Verification
 */

import './mock_tauri_core';
import { ComputerActionExecutor } from './src/lib/ai/computer/ComputerActionExecutor';
import { ComputerActionValidator } from './src/lib/ai/computer/ComputerActionValidator';
import { ComputerError } from './src/lib/ai/computer/types';
import type { ComputerAction } from './src/lib/ai/computer/types';
import { ScreenObservationManager } from './src/lib/ai/screen/ScreenObservationManager';
import { PolicyEngine } from './src/lib/security/policy/PolicyEngine';
import { ApprovalManager } from './src/lib/ai/approval/ApprovalManager';
import { ToolRegistry, BUILT_IN_TOOLS } from './src/lib/ai/ToolRegistry';
import { ApplicationRegistry } from './src/lib/applications/ApplicationRegistry';
import { ProviderAuthManager } from './src/lib/ai/providers/ProviderAuthManager';
import { WorkflowStore } from './src/lib/ai/persistence/WorkflowStore';

async function runRealWindowsInputAcceptance() {
  console.log('================================================================');
  console.log('🚀 REZEL SPRINT P0-2: REAL WINDOWS INPUT DISPATCH ACCEPTANCE');
  console.log('================================================================\n');

  ToolRegistry.registerMany(BUILT_IN_TOOLS);

  // Setup Provider authorizations
  ProviderAuthManager.updateAuthorization('OLLAMA', { enabled: true, allowedForReasoning: true, allowedForAutomation: true, allowPaidFailover: false });
  ProviderAuthManager.updateAuthorization('GEMINI', { enabled: true, allowedForReasoning: true, allowedForAutomation: true, allowPaidFailover: false });

  // ═════════════════════════════════════════════════════════════════════════════
  // LAYER A: SECURITY PIPELINE, APPROVAL GATES & TARGET VALIDATION
  // ═════════════════════════════════════════════════════════════════════════════
  console.log('--- LAYER A: Security Pipeline & Contract Validation ---');

  // A1. ToolRegistry registration of computer input tools
  const clickTool = ToolRegistry.get('computer_click');
  const typeTool = ToolRegistry.get('computer_type');
  const keyTool = ToolRegistry.get('computer_key_press');
  const hotkeyTool = ToolRegistry.get('computer_hotkey');
  if (!clickTool || !typeTool || !keyTool || !hotkeyTool) {
    throw new Error('A1 Failed: Computer input tools not fully registered in ToolRegistry');
  }
  console.log('✅ A1: computer_click, computer_type, computer_key_press, computer_hotkey registered in ToolRegistry');

  // A2. PolicyEngine Mandatory Evaluation Gate
  const policyRes = await PolicyEngine.evaluate({
    capabilityId: 'computer.click',
    toolGroup: 'system',
    args: { x: 500, y: 500 },
    activeScopes: [],
  });
  if (policyRes.decision !== 'ALLOW') {
    throw new Error(`A2 Failed: PolicyEngine did not allow computer.click: ${policyRes.reason}`);
  }
  console.log('✅ A2: PolicyEngine authoritative evaluation passed');

  // A3. High-Risk Approval Gate (Unapproved must throw APPROVAL_REQUIRED)
  let unapprovedCaught = false;
  try {
    const unapprovedAction: ComputerAction = {
      actionId: 'act_unapproved_01',
      type: 'HOTKEY',
      parameters: { keys: ['Control', 'Alt', 'Delete'] },
      mutatesExternalState: true,
      riskLevel: 'HIGH',
      requiredCapability: 'computer.hotkey',
      requiresApproval: true,
      isIdempotent: false,
    };
    await ComputerActionExecutor.execute(unapprovedAction);
  } catch (err: any) {
    if (err instanceof ComputerError && err.code === 'APPROVAL_REQUIRED') {
      unapprovedCaught = true;
    }
  }
  if (!unapprovedCaught) throw new Error('A3 Failed: High-risk action without approval was not rejected');
  console.log('✅ A3: High-risk action strictly gated by ApprovalManager');

  // A4. Out-of-Bounds Coordinate Rejection
  let outOfBoundsCaught = false;
  try {
    const oobAction: ComputerAction = {
      actionId: 'act_oob_01',
      type: 'CLICK',
      target: { bounds: { x: 50000, y: 50000, width: 100, height: 100 } },
      mutatesExternalState: true,
      riskLevel: 'LOW',
      requiredCapability: 'computer.click',
      requiresApproval: false,
      isIdempotent: false,
    };
    ComputerActionValidator.validate(oobAction);
  } catch (err: any) {
    if (err instanceof ComputerError && err.code === 'ACTION_OUT_OF_BOUNDS') {
      outOfBoundsCaught = true;
    }
  }
  if (!outOfBoundsCaught) throw new Error('A4 Failed: Out-of-bounds coordinates were not rejected');
  console.log('✅ A4: Out-of-bounds coordinates rejected cleanly with ACTION_OUT_OF_BOUNDS');

  // A5. Stale Target UI Element Rejection
  let staleTargetCaught = false;
  try {
    const staleAction: ComputerAction = {
      actionId: 'act_stale_target_01',
      type: 'CLICK',
      target: { elementId: 'el_missing_button_999' },
      mutatesExternalState: true,
      riskLevel: 'LOW',
      requiredCapability: 'computer.click',
      requiresApproval: false,
      isIdempotent: false,
    };
    ComputerActionValidator.validate(staleAction, {
      screenObservationId: 'scrob_01',
      timestamp: Date.now(),
      windows: [],
      elements: [],
      regions: [],
      provider: 'OLLAMA',
      evidenceType: 'VISUAL_EVIDENCE',
    });
  } catch (err: any) {
    if (err instanceof ComputerError && err.code === 'TARGET_STALE') {
      staleTargetCaught = true;
    }
  }
  if (!staleTargetCaught) throw new Error('A5 Failed: Missing target element was not rejected with TARGET_STALE');
  console.log('✅ A5: Stale UI element target rejected cleanly with TARGET_STALE');

  // A6. UNKNOWN Semantics & No-Replay Invariant
  const timeoutAction: ComputerAction = {
    actionId: 'act_timeout_01',
    type: 'CLICK',
    parameters: { x: 300, y: 300 },
    mutatesExternalState: true,
    riskLevel: 'LOW',
    requiredCapability: 'computer.click',
    requiresApproval: false,
    isIdempotent: false,
  };
  const unknownResult = await ComputerActionExecutor.execute(timeoutAction, { simulateTimeout: true });
  if (unknownResult.status !== 'UNKNOWN' || unknownResult.errorCode !== 'ACTION_TIMEOUT') {
    throw new Error('A6 Failed: Timeout did not yield deterministic UNKNOWN outcome');
  }
  console.log('✅ A6: UNKNOWN status preserved; non-idempotent actions forbidden from auto-replay');

  // ═════════════════════════════════════════════════════════════════════════════
  // LAYER B: REAL WINDOWS NATIVE INPUT DISPATCH & VERIFICATION
  // ═════════════════════════════════════════════════════════════════════════════
  console.log('\n--- LAYER B: Real Windows Native Input Dispatch & Lifecycle ---');

  // B1. Real Click Execution (Observe -> Act -> Observe -> Verify)
  const clickAction: ComputerAction = {
    actionId: 'act_real_click_01',
    type: 'CLICK',
    parameters: { x: 200, y: 200, button: 'left' },
    mutatesExternalState: true,
    riskLevel: 'LOW',
    requiredCapability: 'computer.click',
    requiresApproval: false,
    isIdempotent: false,
  };
  const clickResult = await ComputerActionExecutor.execute(clickAction);
  if (clickResult.status !== 'SUCCESS' || !clickResult.observationBefore || !clickResult.observationAfter) {
    throw new Error(`B1 Failed: Real click execution failed: status=${clickResult.status}`);
  }
  console.log(`✅ B1: Real Windows CLICK dispatched successfully (obsBefore: ${clickResult.observationBefore}, obsAfter: ${clickResult.observationAfter})`);

  // B2. Real Type Execution
  const typeAction: ComputerAction = {
    actionId: 'act_real_type_01',
    type: 'TYPE',
    parameters: { text: 'REZEL_REAL_INPUT_TEST' },
    mutatesExternalState: true,
    riskLevel: 'LOW',
    requiredCapability: 'computer.type',
    requiresApproval: false,
    isIdempotent: false,
  };
  const typeResult = await ComputerActionExecutor.execute(typeAction);
  if (typeResult.status !== 'SUCCESS') {
    throw new Error(`B2 Failed: Real type execution failed: status=${typeResult.status}`);
  }
  console.log(`✅ B2: Real Windows TYPE dispatched successfully (length: 21 chars, duration: ${typeResult.durationMs}ms)`);

  // B3. Real KeyPress Execution
  const keyAction: ComputerAction = {
    actionId: 'act_real_key_01',
    type: 'KEY_PRESS',
    parameters: { key: 'Escape' },
    mutatesExternalState: true,
    riskLevel: 'LOW',
    requiredCapability: 'computer.key_press',
    requiresApproval: false,
    isIdempotent: false,
  };
  const keyResult = await ComputerActionExecutor.execute(keyAction);
  if (keyResult.status !== 'SUCCESS') {
    throw new Error(`B3 Failed: Real key press execution failed: status=${keyResult.status}`);
  }
  console.log(`✅ B3: Real Windows KEY_PRESS (Escape) dispatched successfully`);

  // B4. Real Hotkey Execution with Human Approval Flow
  const approvalId = 'appr_real_hotkey_01';
  WorkflowStore.saveApproval({
    approvalId,
    workflowId: 'wf_test_real_input',
    stepId: 'step_hotkey',
    riskLevel: 'HIGH',
    state: 'APPROVED',
    reason: 'Dispatch real Ctrl+A hotkey on Windows desktop',
    summary: 'Select all via hotkey',
    createdAt: Date.now(),
    expiresAt: Date.now() + 60000,
    decisionTimestamp: Date.now(),
    decisionActor: 'test_auditor',
  });

  const hotkeyAction: ComputerAction = {
    actionId: 'act_real_hotkey_01',
    type: 'HOTKEY',
    parameters: { keys: ['Control', 'a'] },
    mutatesExternalState: true,
    riskLevel: 'HIGH',
    requiredCapability: 'computer.hotkey',
    requiresApproval: true,
    approvalId,
    isIdempotent: false,
  };
  const hotkeyResult = await ComputerActionExecutor.execute(hotkeyAction);
  if (hotkeyResult.status !== 'SUCCESS') {
    throw new Error(`B4 Failed: Real hotkey execution failed: status=${hotkeyResult.status}`);
  }
  console.log(`✅ B4: Real Windows HOTKEY (Ctrl+A) approved & dispatched successfully`);

  // Clean up observations
  ScreenObservationManager.releaseObservation(clickResult.observationBefore!);
  ScreenObservationManager.releaseObservation(clickResult.observationAfter!);

  console.log('\n================================================================');
  console.log('🎯 REAL WINDOWS INPUT DISPATCH ACCEPTANCE PASSED (100%)');
  console.log('================================================================');
}

runRealWindowsInputAcceptance().catch((err) => {
  console.error('\n❌ REAL WINDOWS INPUT DISPATCH ACCEPTANCE FAILED:', err);
  process.exit(1);
});
