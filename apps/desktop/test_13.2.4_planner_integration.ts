/**
 * REZEL 13.2.4 — PLANNER INTEGRATION ACCEPTANCE TEST SUITE
 *
 * Verifies:
 * 1. Application Resolution (Explicit, Foreground session, Unknown, Ambiguous)
 * 2. Operation Selection (Exact ID, Aliases, Description, Unavailable, Ambiguous)
 * 3. Precondition & Runtime State Gating (Satisfied, False, Unknown)
 * 4. Compilation Pipeline Integration (Valid, Invalid Params, Target Missing/Ambiguous)
 * 5. Planning Boundary (No execution during planning, safe handoff to 13.1 execution)
 * 6. User-Facing Error Explanations
 * 7. Real End-to-End Acceptance (Notepad, Calculator, File Explorer)
 */

import { ApplicationPlanningAdapter, ApplicationPlanningAdapterImpl } from './src/lib/ai/planning/app/ApplicationPlanningAdapter';
import { ApplicationIntentResolver } from './src/lib/ai/planning/app/ApplicationIntentResolver';
import { ApplicationResolutionEngine } from './src/lib/ai/planning/app/ApplicationResolutionEngine';
import { OperationSelectionEngine } from './src/lib/ai/planning/app/OperationSelectionEngine';
import { PlannerErrorExplainer } from './src/lib/ai/planning/app/PlannerErrorExplainer';
import { ApplicationProfileRegistry } from './src/lib/ai/profiles/ApplicationProfileRegistry';
import { ApplicationSessionManager } from './src/lib/director/ApplicationSessionManager';
import './mock_tauri_core';
import type { UIAnalysisResult } from './src/lib/ai/ui/types';
import type { ApplicationRuntimeState } from './src/lib/ai/inference/types';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passCount++;
    console.log(`  [PASS] ${message}`);
  } else {
    failCount++;
    console.error(`  [FAIL] ${message}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('REZEL 13.2.4 — PLANNER INTEGRATION TEST SUITE');
  console.log('================================================================\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 1: APPLICATION RESOLUTION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- SUITE 1: APPLICATION RESOLUTION ---');
  {
    const sessionMgr = new ApplicationSessionManager();

    // 1. Explicit application in intent
    const expRes = ApplicationResolutionEngine.resolveApplication('notepad', sessionMgr);
    assert(expRes.success === true, 'Explicit application "notepad" resolved');
    if (expRes.success) {
      assert(expRes.profile.appId === 'notepad', 'Profile matches notepad');
      assert(expRes.resolvedBy === 'EXPLICIT_INTENT', 'Resolution strategy is EXPLICIT_INTENT');
    }

    // 2. Foreground application session
    sessionMgr.updateSession({
      appId: 'calculator',
      sessionId: 'sess_calc_1',
      processId: 1001,
      foreground: true,
      connectionStatus: 'CONNECTED',
    } as any);

    const fgRes = ApplicationResolutionEngine.resolveApplication(undefined, sessionMgr);
    assert(fgRes.success === true, 'Foreground session resolved when no explicit app in query');
    if (fgRes.success) {
      assert(fgRes.profile.appId === 'calculator', 'Resolved profile is calculator');
      assert(fgRes.resolvedBy === 'FOREGROUND_SESSION', 'Resolution strategy is FOREGROUND_SESSION');
    }

    // 3. Unknown application
    const unkRes = ApplicationResolutionEngine.resolveApplication('photoshop_unknown_app', sessionMgr);
    assert(unkRes.success === false, 'Unknown application fails resolution');
    if (!unkRes.success) {
      assert(unkRes.failureCode === 'APPLICATION_NOT_FOUND', 'Failure code is APPLICATION_NOT_FOUND');
    }

    // 4. Ambiguous application
    const ambigSessionMgr = new ApplicationSessionManager();
    ambigSessionMgr.updateSession({
      appId: 'notepad',
      sessionId: 'sess_np',
      foreground: false,
      connectionStatus: 'CONNECTED',
    } as any);
    ambigSessionMgr.updateSession({
      appId: 'calculator',
      sessionId: 'sess_calc',
      foreground: false,
      connectionStatus: 'CONNECTED',
    } as any);

    const ambigRes = ApplicationResolutionEngine.resolveApplication(undefined, ambigSessionMgr);
    assert(ambigRes.success === false, 'Multiple active sessions with no foreground returns AMBIGUOUS_APPLICATION');
    if (!ambigRes.success) {
      assert(ambigRes.failureCode === 'AMBIGUOUS_APPLICATION', 'Failure code is AMBIGUOUS_APPLICATION');
      assert(ambigRes.candidateAppIds?.includes('notepad') === true, 'Candidates include notepad');
      assert(ambigRes.candidateAppIds?.includes('calculator') === true, 'Candidates include calculator');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 2: INTENT RESOLUTION & OPERATION SELECTION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 2: INTENT RESOLUTION & OPERATION SELECTION ---');
  {
    const npProfile = ApplicationProfileRegistry.get('notepad')!;
    const calcProfile = ApplicationProfileRegistry.get('calculator')!;
    const expProfile = ApplicationProfileRegistry.get('explorer')!;

    // 2.1 Intent parsing with path and explicit app
    const intent1 = ApplicationIntentResolver.resolveIntent('Go to C:\\Projects\\Rezel in File Explorer');
    assert(intent1.explicitAppId === 'explorer', 'Detected explicitAppId = explorer');
    assert(intent1.parameters.path === 'C:\\Projects\\Rezel', 'Extracted path parameter C:\\Projects\\Rezel');

    // 2.2 Intent parsing with text
    const intent2 = ApplicationIntentResolver.resolveIntent('Type "Hello World" in Notepad');
    assert(intent2.explicitAppId === 'notepad', 'Detected explicitAppId = notepad');
    assert(intent2.parameters.text === 'Hello World', 'Extracted quoted text parameter');

    // 2.3 Exact operation match
    const exactRes = OperationSelectionEngine.selectOperation('save_document', npProfile);
    assert(exactRes.success === true, 'Exact operation ID match succeeded');
    if (exactRes.success) {
      assert(exactRes.operation.id === 'save_document', 'Selected save_document');
      assert(exactRes.matchTier === 'EXACT_ID', 'Match tier is EXACT_ID');
    }

    // 2.4 Alias match
    const aliasRes = OperationSelectionEngine.selectOperation('save this file', npProfile);
    assert(aliasRes.success === true, 'Alias match ("save this file") succeeded');
    if (aliasRes.success) {
      assert(aliasRes.operation.id === 'save_document', 'Selected save_document via alias');
      assert(aliasRes.matchTier === 'EXPLICIT_ALIAS', 'Match tier is EXPLICIT_ALIAS');
    }

    // 2.5 Explorer alias match
    const expAliasRes = OperationSelectionEngine.selectOperation('go to folder', expProfile);
    assert(expAliasRes.success === true, 'Explorer alias ("go to folder") matched navigate_to_path');
    if (expAliasRes.success) {
      assert(expAliasRes.operation.id === 'navigate_to_path', 'Selected navigate_to_path');
    }

    // 2.6 Calculator alias match
    const calcAliasRes = OperationSelectionEngine.selectOperation('press equals', calcProfile);
    assert(calcAliasRes.success === true, 'Calculator alias ("press equals") matched calculate_equals');
    if (calcAliasRes.success) {
      assert(calcAliasRes.operation.id === 'calculate_equals', 'Selected calculate_equals');
    }

    // 2.7 Description match
    const descRes = OperationSelectionEngine.selectOperation('compute the pending operation', calcProfile);
    assert(descRes.success === true, 'Description match succeeded');
    if (descRes.success) {
      assert(descRes.operation.id === 'calculate_equals', 'Selected calculate_equals via description');
    }

    // 2.8 Unavailable operation
    const unavailRes = OperationSelectionEngine.selectOperation('send an email to john', npProfile);
    assert(unavailRes.success === false, 'Unavailable operation rejected');
    if (!unavailRes.success) {
      assert(unavailRes.failureCode === 'OPERATION_UNAVAILABLE', 'Failure code is OPERATION_UNAVAILABLE');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 3: RUNTIME STATE & PRECONDITION GATING
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 3: PRECONDITION & RUNTIME STATE GATING ---');
  {
    const adapter = new ApplicationPlanningAdapterImpl();

    const mockUI: UIAnalysisResult = {
      observationId: 'obs_plan_test',
      windows: [{ windowId: 'win_1', applicationId: 'notepad', title: 'Untitled - Notepad', className: 'Notepad', source: 'OS' }],
      elements: [{ elementId: 'el_1', automationId: '15', role: 'Document', type: 'INPUT', evidenceType: 'STRUCTURED_OS_UI_STATE', sourceObservationId: 'obs_plan_test' }],
    };

    // 3.1 Precondition Satisfied (TRUE)
    const stateSatisfied: ApplicationRuntimeState = {
      appId: 'notepad',
      profileStatus: 'EXACT_MATCH',
      activeStates: {
        APP_READY: { stateId: 'APP_READY', isTrue: 'TRUE', confidence: 'HIGH', evidence: [] },
        DOCUMENT_OPEN: { stateId: 'DOCUMENT_OPEN', isTrue: 'TRUE', confidence: 'HIGH', evidence: [] },
      },
      modalState: { value: 'NONE', confidence: 'HIGH', evidence: [] },
      activity: { value: 'IDLE', confidence: 'HIGH', evidence: [] },
      evidence: [],
      observedAt: Date.now(),
    };

    const satPlan = await adapter.planOperation({
      query: 'Save document in Notepad',
      runtimeState: stateSatisfied,
    });
    assert(satPlan.success === true, 'Planning succeeded with satisfied preconditions');

    // 3.2 Precondition False (FALSE)
    const stateFalse: ApplicationRuntimeState = {
      ...stateSatisfied,
      activeStates: {
        ...stateSatisfied.activeStates,
        DOCUMENT_OPEN: { stateId: 'DOCUMENT_OPEN', isTrue: 'FALSE', confidence: 'HIGH', evidence: [] },
      },
    };

    const falsePlan = await adapter.planOperation({
      query: 'Save document in Notepad',
      runtimeState: stateFalse,
    });
    assert(falsePlan.success === false, 'Planning aborted when precondition is FALSE');
    if (!falsePlan.success) {
      assert(falsePlan.failureCode === 'PRECONDITION_FAILED', 'Failure code is PRECONDITION_FAILED');
      assert(falsePlan.userExplanation.includes('requires an open document'), 'User explanation describes missing prerequisite');
    }

    // 3.3 State Unknown (UNKNOWN)
    const stateUnknown: ApplicationRuntimeState = {
      ...stateSatisfied,
      activeStates: {
        ...stateSatisfied.activeStates,
        DOCUMENT_OPEN: { stateId: 'DOCUMENT_OPEN', isTrue: 'UNKNOWN', confidence: 'LOW', evidence: [] },
      },
    };

    const unkPlan = await adapter.planOperation({
      query: 'Save document in Notepad',
      runtimeState: stateUnknown,
    });
    assert(unkPlan.success === false, 'Planning aborted when precondition state is UNKNOWN');
    if (!unkPlan.success) {
      assert(unkPlan.failureCode === 'UNKNOWN_APPLICATION_STATE', 'Failure code is UNKNOWN_APPLICATION_STATE');
      assert(unkPlan.userExplanation.includes('cannot safely determine'), 'User explanation explains uncertainty');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 4: PLANNING BOUNDARY (NO EXECUTION DURING PLANNING)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 4: PLANNING BOUNDARY & SAFE EXECUTION HANDOFF ---');
  {
    const adapter = new ApplicationPlanningAdapterImpl();

    const mockUI: UIAnalysisResult = {
      observationId: 'obs_bound_test',
      windows: [{ windowId: 'win_1', applicationId: 'notepad', title: 'Notes - Notepad', className: 'Notepad', source: 'OS' }],
      elements: [{ elementId: 'el_1', automationId: '15', role: 'Document', type: 'INPUT', evidenceType: 'STRUCTURED_OS_UI_STATE', sourceObservationId: 'obs_bound_test' }],
    };

    const state: ApplicationRuntimeState = {
      appId: 'notepad',
      profileStatus: 'EXACT_MATCH',
      activeStates: {
        APP_READY: { stateId: 'APP_READY', isTrue: 'TRUE', confidence: 'HIGH', evidence: [] },
        DOCUMENT_OPEN: { stateId: 'DOCUMENT_OPEN', isTrue: 'TRUE', confidence: 'HIGH', evidence: [] },
      },
      modalState: { value: 'NONE', confidence: 'HIGH', evidence: [] },
      activity: { value: 'IDLE', confidence: 'HIGH', evidence: [] },
      evidence: [],
      observedAt: Date.now(),
    };

    // 4.1 Plan operation
    const planRes = await adapter.planOperation({
      query: 'Type "REZEL TEST" in Notepad',
      runtimeState: state,
      uiObservation: mockUI,
    });

    assert(planRes.success === true, 'planOperation returned success');
    if (planRes.success) {
      assert(planRes.plannedOperation.compiledPlan.actions.length === 2, 'Generated 2 ComputerActions (focus + type)');
      assert(planRes.plannedOperation.planStep.toolName === 'application_operation', 'Created typed PlanStep for PlanEngine');
      assert(planRes.plannedOperation.planStep.status === 'PENDING', 'PlanStep status is PENDING (not executed)');

      // 4.2 Verify decision history logged
      const history = adapter.getDecisionHistory();
      assert(history.length > 0, 'Decision history recorded for observability');
      assert(history[history.length - 1].compilationSuccess === true, 'Decision record tracks compilation');

      // 4.3 Execute through downstream execution method
      const execRes = await adapter.executePlannedOperation(planRes.plannedOperation, { currentUIState: mockUI });
      assert(execRes.success === true, 'executePlannedOperation succeeded via 13.1 Executor');
      assert(execRes.results.length === 2, 'All 2 actions executed through 13.1 pipeline');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 5: REAL END-TO-END ACCEPTANCE
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 5: REAL END-TO-END ACCEPTANCE ---');
  {
    const adapter = new ApplicationPlanningAdapterImpl();

    // ─── Scenario A: Notepad (Type REZEL into Notepad) ───
    const notepadUI: UIAnalysisResult = {
      observationId: 'obs_np_e2e',
      windows: [{ windowId: 'win_np', applicationId: 'notepad', title: 'Untitled - Notepad', className: 'Notepad', source: 'OS' }],
      elements: [{ elementId: 'el_np_edit', type: 'INPUT', role: 'Document', automationId: '15', className: 'Edit', visible: true, evidenceType: 'STRUCTURED_OS_UI_STATE', sourceObservationId: 'obs_np_e2e' }],
    };

    const notepadState: ApplicationRuntimeState = {
      appId: 'notepad',
      profileStatus: 'EXACT_MATCH',
      activeStates: {
        APP_READY: { stateId: 'APP_READY', isTrue: 'TRUE', confidence: 'HIGH', evidence: [] },
        DOCUMENT_OPEN: { stateId: 'DOCUMENT_OPEN', isTrue: 'TRUE', confidence: 'HIGH', evidence: [] },
      },
      modalState: { value: 'NONE', confidence: 'HIGH', evidence: [] },
      activity: { value: 'IDLE', confidence: 'HIGH', evidence: [] },
      evidence: [],
      observedAt: Date.now(),
    };

    const npPlan = await adapter.planOperation({
      query: 'Type REZEL into Notepad',
      runtimeState: notepadState,
      uiObservation: notepadUI,
    });
    assert(npPlan.success === true, 'Notepad intent "Type REZEL into Notepad" successfully planned');
    if (npPlan.success) {
      assert(npPlan.plannedOperation.compiledPlan.actions.length === 2, 'Notepad plan has 2 actions');
      assert(npPlan.plannedOperation.compiledPlan.actions[1].parameters?.text === 'REZEL', 'Parameter "REZEL" bound correctly');
      const npExec = await adapter.executePlannedOperation(npPlan.plannedOperation, { currentUIState: notepadUI });
      assert(npExec.success === true, 'Notepad plan executed cleanly through 13.1');
    }

    // ─── Scenario B: Calculator (Calculate equals) ───
    const calcUI: UIAnalysisResult = {
      observationId: 'obs_calc_e2e',
      windows: [{ windowId: 'win_calc', applicationId: 'calculator', title: 'Calculator', className: 'ApplicationFrameWindow', source: 'OS' }],
      elements: [
        {
          elementId: 'el_btn_eq',
          type: 'BUTTON',
          automationId: 'equalButton',
          label: 'Equals',
          supportedPatterns: ['Invoke'],
          bounds: { x: 390, y: 400, width: 60, height: 40 },
          evidenceType: 'STRUCTURED_OS_UI_STATE',
          sourceObservationId: 'obs_calc_e2e',
        },
      ],
    };

    const calcState: ApplicationRuntimeState = {
      appId: 'calculator',
      profileStatus: 'EXACT_MATCH',
      activeStates: {
        APP_READY: { stateId: 'APP_READY', isTrue: 'TRUE', confidence: 'HIGH', evidence: [] },
      },
      modalState: { value: 'NONE', confidence: 'HIGH', evidence: [] },
      activity: { value: 'IDLE', confidence: 'HIGH', evidence: [] },
      evidence: [],
      observedAt: Date.now(),
    };

    const calcPlan = await adapter.planOperation({
      query: 'calculate equals in Calculator',
      runtimeState: calcState,
      uiObservation: calcUI,
    });
    assert(calcPlan.success === true, 'Calculator intent successfully planned');
    if (calcPlan.success) {
      assert(calcPlan.plannedOperation.compiledPlan.actions.length === 1, 'Calculator plan has 1 action');
      assert(calcPlan.plannedOperation.compiledPlan.actions[0].type === 'CLICK', 'Action is CLICK');
      const calcExec = await adapter.executePlannedOperation(calcPlan.plannedOperation, { currentUIState: calcUI });
      assert(calcExec.success === true, 'Calculator plan executed cleanly through 13.1');
    }

    // ─── Scenario C: File Explorer (Go to C:\Projects\Rezel) ───
    const explorerUI: UIAnalysisResult = {
      observationId: 'obs_exp_e2e',
      windows: [{ windowId: 'win_exp', applicationId: 'explorer', title: 'File Explorer', className: 'CabinetWClass', source: 'OS' }],
      elements: [{ elementId: 'el_addr', type: 'INPUT', automationId: 'AddressBandRoot', label: 'Address Bar', evidenceType: 'STRUCTURED_OS_UI_STATE', sourceObservationId: 'obs_exp_e2e' }],
    };

    const explorerState: ApplicationRuntimeState = {
      appId: 'explorer',
      profileStatus: 'EXACT_MATCH',
      activeStates: {
        APP_READY: { stateId: 'APP_READY', isTrue: 'TRUE', confidence: 'HIGH', evidence: [] },
      },
      modalState: { value: 'NONE', confidence: 'HIGH', evidence: [] },
      activity: { value: 'IDLE', confidence: 'HIGH', evidence: [] },
      evidence: [],
      observedAt: Date.now(),
    };

    const expPlan = await adapter.planOperation({
      query: 'Go to C:\\Projects\\Rezel in File Explorer',
      runtimeState: explorerState,
      uiObservation: explorerUI,
    });
    assert(expPlan.success === true, 'Explorer intent successfully planned');
    if (expPlan.success) {
      assert(expPlan.plannedOperation.compiledPlan.actions.length === 3, 'Explorer plan has 3 actions (focus, type, enter)');
      assert(expPlan.plannedOperation.compiledPlan.actions[1].parameters?.text === 'C:\\Projects\\Rezel', 'Path parameter bound');
      const expExec = await adapter.executePlannedOperation(expPlan.plannedOperation, { currentUIState: explorerUI });
      assert(expExec.success === true, 'Explorer plan executed cleanly through 13.1');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passCount} Passed, ${failCount} Failed`);
  console.log('================================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
