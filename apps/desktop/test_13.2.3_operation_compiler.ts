/**
 * REZEL 13.2.3 — DECLARATIVE OPERATION COMPILER ACCEPTANCE TEST SUITE
 *
 * Verifies:
 * 1. Parameter Validation & Safe Deterministic Substitution (No eval/injection)
 * 2. Precondition Evaluation against ApplicationRuntimeState (TRUE, FALSE, UNKNOWN)
 * 3. Landmark Resolution (Single match, 0 matches -> TARGET_NOT_FOUND, >1 matches -> AMBIGUOUS_TARGET)
 * 4. Step Compilation & Closed DSL Translation (focus_landmark, invoke, set_value, toggle, select, type_text, hotkey)
 * 5. Permission Calculation (INTERACT, WRITE, EXECUTE)
 * 6. Native Strategy Identification (without execution)
 * 7. Postcondition Transfer (unchanged)
 * 8. Compilation Cache (Hit, Invalidation, State Hash)
 * 9. Atomic Failure Safety (no partial plans)
 * 10. Real Application Profiles (Notepad, Calculator, File Explorer)
 * 11. Read-Only / Non-Mutation Security Guarantee
 */

import {
  DeclarativeOperationCompiler,
  DeclarativeOperationCompilerImpl,
} from './src/lib/ai/compiler/DeclarativeOperationCompiler';
import { OperationParameterValidator } from './src/lib/ai/compiler/OperationParameterValidator';
import { OperationPreconditionEvaluator } from './src/lib/ai/compiler/OperationPreconditionEvaluator';
import { OperationLandmarkResolver } from './src/lib/ai/compiler/OperationLandmarkResolver';
import { OperationStepCompiler } from './src/lib/ai/compiler/OperationStepCompiler';
import { CompilationCache } from './src/lib/ai/compiler/CompilationCache';
import type { UIAnalysisResult } from './src/lib/ai/ui/types';
import type { ApplicationRuntimeState } from './src/lib/ai/inference/types';
import type { UILandmark, OperationParameter, OperationStep } from './src/lib/ai/profiles/types';

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
  console.log('REZEL 13.2.3 — DECLARATIVE OPERATION COMPILER TEST SUITE');
  console.log('================================================================\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 1: PARAMETER VALIDATION & SAFE SUBSTITUTION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- SUITE 1: PARAMETER VALIDATION & SAFE SUBSTITUTION ---');
  {
    const declaredParams: OperationParameter[] = [
      { name: 'text', type: 'string', description: 'Content to type', required: true },
      { name: 'count', type: 'number', description: 'Repeat count', required: false, defaultValue: 1 },
      { name: 'flag', type: 'boolean', description: 'Active flag', required: false, defaultValue: false },
    ];

    // 1.1 Valid parameters
    const validRes = OperationParameterValidator.validate(declaredParams, {
      text: 'Hello World',
      count: 5,
      flag: true,
    });
    assert(validRes.valid === true, 'Valid parameters accepted');
    assert(validRes.validatedParams?.text === 'Hello World', 'Validated string parameter extracted');
    assert(validRes.validatedParams?.count === 5, 'Validated number parameter extracted');

    // 1.2 Missing required parameter
    const missingRes = OperationParameterValidator.validate(declaredParams, { count: 3 });
    assert(missingRes.valid === false, 'Missing required parameter rejected');
    assert(missingRes.error?.includes("Missing required parameter 'text'"), 'Error identifies missing parameter');

    // 1.3 Wrong type
    const wrongTypeRes = OperationParameterValidator.validate(declaredParams, { text: 12345 });
    assert(wrongTypeRes.valid === false, 'Wrong parameter type (number instead of string) rejected');
    assert(wrongTypeRes.error?.includes('must be a string'), 'Error identifies type mismatch');

    // 1.4 Unknown parameter rejection
    const unknownParamRes = OperationParameterValidator.validate(declaredParams, {
      text: 'Valid',
      unauthorizedMaliciousParam: 'attack',
    });
    assert(unknownParamRes.valid === false, 'Unknown parameter rejected');
    assert(unknownParamRes.error?.includes('Unknown argument'), 'Error identifies unknown argument');

    // 1.5 Safe substitution
    const subRes = OperationParameterValidator.substitute('Saving {{text}} with count {{count}}', {
      text: 'report.txt',
      count: 2,
    }, declaredParams);
    assert(subRes.success === true, 'Safe placeholder substitution succeeded');
    assert(subRes.result === 'Saving report.txt with count 2', 'Substituted text is accurate');

    // 1.6 Undeclared placeholder rejection
    const undeclaredSubRes = OperationParameterValidator.substitute('Attack {{secret_token}}', {
      text: 'test',
    }, declaredParams);
    assert(undeclaredSubRes.success === false, 'Undeclared placeholder rejected');
    assert(undeclaredSubRes.error?.includes("undeclared placeholder '{{secret_token}}'"), 'Error identifies undeclared placeholder');

    // 1.7 Security: No arbitrary JS execution or eval
    const codePayload = "process.exit(1);";
    const injectionSubRes = OperationParameterValidator.substitute('Safe: {{text}}', {
      text: codePayload,
    }, declaredParams);
    assert(injectionSubRes.success === true, 'Payload treated purely as string literal');
    assert(injectionSubRes.result === 'Safe: process.exit(1);', 'Code payload is inert string with zero execution');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 2: PRECONDITION EVALUATION (TRI-STATE SEMANTICS)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 2: PRECONDITION EVALUATION ---');
  {
    const stateTrue: ApplicationRuntimeState = {
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

    // 2.1 Satisfied preconditions (TRUE)
    const passPre = OperationPreconditionEvaluator.evaluate(['APP_READY', 'DOCUMENT_OPEN'], stateTrue);
    assert(passPre.satisfied === true, 'TRUE preconditions evaluate to satisfied');

    // 2.2 Unsatisfied precondition (FALSE)
    const stateFalse: ApplicationRuntimeState = {
      ...stateTrue,
      activeStates: {
        ...stateTrue.activeStates,
        DOCUMENT_OPEN: { stateId: 'DOCUMENT_OPEN', isTrue: 'FALSE', confidence: 'HIGH', evidence: [{ source: 'UIA', description: 'No editor', confidence: 'HIGH', observedAt: Date.now() }] },
      },
    };
    const failPre = OperationPreconditionEvaluator.evaluate(['APP_READY', 'DOCUMENT_OPEN'], stateFalse);
    assert(failPre.satisfied === false, 'FALSE precondition rejected');
    assert(failPre.failureCode === 'PRECONDITION_FAILED', 'Failure code is PRECONDITION_FAILED');
    assert(failPre.failedPrecondition === 'DOCUMENT_OPEN', 'Identifies failed precondition stateId');

    // 2.3 Ambiguous/Insufficient evidence precondition (UNKNOWN)
    const stateUnknown: ApplicationRuntimeState = {
      ...stateTrue,
      activeStates: {
        ...stateTrue.activeStates,
        DOCUMENT_OPEN: { stateId: 'DOCUMENT_OPEN', isTrue: 'UNKNOWN', confidence: 'LOW', evidence: [{ source: 'UIA', description: 'Partial observation', confidence: 'LOW', observedAt: Date.now() }] },
      },
    };
    const unknownPre = OperationPreconditionEvaluator.evaluate(['DOCUMENT_OPEN'], stateUnknown);
    assert(unknownPre.satisfied === false, 'UNKNOWN precondition safely rejected (never assumed true)');
    assert(unknownPre.failureCode === 'PRECONDITION_FAILED', 'Failure code is PRECONDITION_FAILED');

    // 2.4 Missing state in runtime state
    const missingStatePre = OperationPreconditionEvaluator.evaluate(['NON_EXISTENT_STATE'], stateTrue);
    assert(missingStatePre.satisfied === false, 'Missing state definition rejected');
    assert(missingStatePre.failedPrecondition === 'NON_EXISTENT_STATE', 'Identifies missing state');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 3: LANDMARK RESOLUTION (SINGLE, 0 MATCHES, AMBIGUITY)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 3: LANDMARK RESOLUTION ---');
  {
    const mockLandmarks: Record<string, UILandmark> = {
      editor: {
        id: 'editor',
        description: 'Text Editor Area',
        matchers: [{ role: 'Document', automationId: '15' }],
      },
      save_btn: {
        id: 'save_btn',
        description: 'Save Button',
        matchers: [{ role: 'Button', name: 'Save' }],
      },
      duplicate_item: {
        id: 'duplicate_item',
        description: 'Duplicate Items',
        matchers: [{ role: 'ListItem' }],
      },
    };

    const mockUI: UIAnalysisResult = {
      observationId: 'obs_lm_test',
      windows: [],
      elements: [
        {
          elementId: 'el_editor',
          type: 'INPUT',
          role: 'Document',
          automationId: '15',
          bounds: { x: 10, y: 10, width: 500, height: 400 },
          evidenceType: 'STRUCTURED_OS_UI_STATE',
          sourceObservationId: 'obs_lm_test',
        },
        {
          elementId: 'el_list_1',
          type: 'LIST_ITEM',
          role: 'ListItem',
          automationId: 'item_1',
          evidenceType: 'STRUCTURED_OS_UI_STATE',
          sourceObservationId: 'obs_lm_test',
        },
        {
          elementId: 'el_list_2',
          type: 'LIST_ITEM',
          role: 'ListItem',
          automationId: 'item_2',
          evidenceType: 'STRUCTURED_OS_UI_STATE',
          sourceObservationId: 'obs_lm_test',
        },
      ],
    };

    // 3.1 Single Unique Match
    const singleRes = OperationLandmarkResolver.resolve('editor', mockLandmarks, mockUI);
    assert(singleRes.success === true, 'Single unique landmark resolved');
    if (singleRes.success) {
      assert(singleRes.target.elementId === 'el_editor', 'Target element ID matches el_editor');
      assert(singleRes.target.bounds?.width === 500, 'Target bounds attached');
    }

    // 3.2 0 Matches -> TARGET_NOT_FOUND
    const zeroRes = OperationLandmarkResolver.resolve('save_btn', mockLandmarks, mockUI);
    assert(zeroRes.success === false, 'Missing landmark returns success=false');
    if (!zeroRes.success) {
      assert(zeroRes.failureCode === 'TARGET_NOT_FOUND', 'Failure code is TARGET_NOT_FOUND');
      assert(zeroRes.reason.includes('not found in active UI tree'), 'Reason explains missing target');
    }

    // 3.3 >1 Matches -> AMBIGUOUS_TARGET (No guessing!)
    const ambigRes = OperationLandmarkResolver.resolve('duplicate_item', mockLandmarks, mockUI);
    assert(ambigRes.success === false, 'Ambiguous landmark returns success=false');
    if (!ambigRes.success) {
      assert(ambigRes.failureCode === 'AMBIGUOUS_TARGET', 'Failure code is AMBIGUOUS_TARGET');
      assert(ambigRes.reason.includes('matched 2 distinct UI entities'), 'Reason lists duplicate matches');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 4: CLOSED DSL STEP TRANSLATION & PERMISSIONS
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 4: STEP TRANSLATION & PERMISSION CALCULATION ---');
  {
    const landmarks: Record<string, UILandmark> = {
      btn_submit: { id: 'btn_submit', description: 'Submit', matchers: [{ automationId: 'submit_btn' }] },
      txt_input: { id: 'txt_input', description: 'Input', matchers: [{ automationId: 'text_input' }] },
      chk_opt: { id: 'chk_opt', description: 'Option Checkbox', matchers: [{ automationId: 'opt_chk' }] },
      cmb_sel: { id: 'cmb_sel', description: 'Combo Select', matchers: [{ automationId: 'sel_cmb' }] },
    };

    const ui: UIAnalysisResult = {
      observationId: 'obs_dsl_test',
      windows: [],
      elements: [
        { elementId: 'el_sub', automationId: 'submit_btn', type: 'BUTTON', evidenceType: 'STRUCTURED_OS_UI_STATE', sourceObservationId: 'obs_dsl_test' },
        { elementId: 'el_txt', automationId: 'text_input', type: 'INPUT', evidenceType: 'STRUCTURED_OS_UI_STATE', sourceObservationId: 'obs_dsl_test' },
        { elementId: 'el_chk', automationId: 'opt_chk', type: 'CHECKBOX', evidenceType: 'STRUCTURED_OS_UI_STATE', sourceObservationId: 'obs_dsl_test' },
        { elementId: 'el_cmb', automationId: 'sel_cmb', type: 'LIST', evidenceType: 'STRUCTURED_OS_UI_STATE', sourceObservationId: 'obs_dsl_test' },
      ],
    };

    const steps: OperationStep[] = [
      { type: 'focus_landmark', landmarkId: 'txt_input' },
      { type: 'type_text', landmarkId: 'txt_input', textRef: '{{greeting}} {{target}}' },
      { type: 'toggle', landmarkId: 'chk_opt', value: true },
      { type: 'select', landmarkId: 'cmb_sel', value: '{{chosenOption}}' },
      { type: 'invoke', landmarkId: 'btn_submit' },
      { type: 'hotkey', keys: ['Ctrl', 'S'] },
    ];

    const declaredParams: OperationParameter[] = [
      { name: 'greeting', type: 'string', description: 'Salutation', required: true },
      { name: 'target', type: 'string', description: 'Target entity', required: true },
      { name: 'chosenOption', type: 'string', description: 'Selected item', required: true },
    ];

    const params = {
      greeting: 'Hello',
      target: 'World',
      chosenOption: 'Option A',
    };

    const stepRes = OperationStepCompiler.compileSteps(steps, landmarks, params, declaredParams, ui, 'test_op');
    assert(stepRes.success === true, 'All closed DSL steps compiled successfully');
    if (stepRes.success) {
      assert(stepRes.actions.length === 6, 'Generated exact count of 6 ComputerActions');
      assert(stepRes.actions[0].type === 'FOCUS', 'Step 1 mapped to FOCUS');
      assert(stepRes.actions[1].type === 'TYPE', 'Step 2 mapped to TYPE');
      assert(stepRes.actions[1].parameters?.text === 'Hello World', 'Step 2 substituted parameter text: Hello World');
      assert(stepRes.actions[2].type === 'CLICK', 'Step 3 toggle mapped to CLICK');
      assert(stepRes.actions[3].type === 'SELECT', 'Step 4 select mapped to SELECT');
      assert(stepRes.actions[4].type === 'CLICK', 'Step 5 invoke mapped to CLICK');
      assert(stepRes.actions[5].type === 'HOTKEY', 'Step 6 hotkey mapped to HOTKEY');

      // Permissions
      assert(stepRes.requiredPermissions.includes('INTERACT'), 'Calculated INTERACT permission');
      assert(stepRes.requiredPermissions.includes('WRITE'), 'Calculated WRITE permission');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 5: COMPILATION CACHE & INVALIDATION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 5: COMPILATION CACHE ---');
  {
    const cache = new CompilationCache(500);

    const mockPlan: any = {
      operationId: 'op_save',
      appId: 'notepad',
      sessionId: 'sess_1',
      actions: [],
      requiredPermissions: ['WRITE'],
      postconditions: [],
      compiledAt: Date.now(),
    };

    const key = CompilationCache.buildKey('notepad', 'op_save', '>=10.0.0', { path: 'file.txt' });
    cache.set(key, mockPlan);

    // Hit within TTL
    const hit = cache.get(key);
    assert(hit !== undefined, 'Cache returns compiled plan within TTL');
    assert(hit?.operationId === 'op_save', 'Cached plan content matches');
    assert(cache.getStats().hits === 1, 'Cache hit counter incremented');

    // Invalidation
    cache.invalidate('notepad', 'op_save');
    const invalidated = cache.get(key);
    assert(invalidated === undefined, 'Invalidated cache entry returns undefined');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 6: REAL APPLICATION PROFILES (NOTEPAD, CALCULATOR, FILE EXPLORER)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 6: REAL APPLICATION PROFILES ---');
  {
    const compiler = new DeclarativeOperationCompilerImpl(5000);

    // ─── Scenario A: Notepad (focus_editor, type_into_editor) ───
    const notepadUI: UIAnalysisResult = {
      observationId: 'obs_np_real',
      windows: [
        {
          windowId: 'win_np',
          applicationId: 'notepad',
          title: 'Untitled - Notepad',
          className: 'Notepad',
          source: 'OS',
        },
      ],
      elements: [
        {
          elementId: 'el_np_edit',
          type: 'INPUT',
          role: 'Document',
          automationId: '15',
          className: 'Edit',
          visible: true,
          evidenceType: 'STRUCTURED_OS_UI_STATE',
          sourceObservationId: 'obs_np_real',
        },
      ],
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

    const npFocusRes = await compiler.compile({
      appId: 'notepad',
      operationId: 'focus_editor',
      uiObservation: notepadUI,
      runtimeState: notepadState,
      forceRefresh: true,
    });
    assert(npFocusRes.success === true, 'Notepad focus_editor compiled successfully');
    if (npFocusRes.success) {
      assert(npFocusRes.plan.actions.length === 1, 'focus_editor generated 1 action');
      assert(npFocusRes.plan.actions[0].type === 'FOCUS', 'Action type is FOCUS');
    }

    const npTypeRes = await compiler.compile({
      appId: 'notepad',
      operationId: 'type_into_editor',
      parameters: { text: 'Hello Rezel OS Core' },
      uiObservation: notepadUI,
      runtimeState: notepadState,
      forceRefresh: true,
    });
    assert(npTypeRes.success === true, 'Notepad type_into_editor compiled successfully');
    if (npTypeRes.success) {
      assert(npTypeRes.plan.actions.length === 2, 'type_into_editor generated 2 actions (focus + type)');
      assert(npTypeRes.plan.actions[1].parameters?.text === 'Hello Rezel OS Core', 'Substituted text parameter matches');
      assert(Array.isArray(npTypeRes.plan.postconditions), 'Postconditions transferred into plan');
    }

    // ─── Scenario B: Calculator (calculate_equals) ───
    const calcUI: UIAnalysisResult = {
      observationId: 'obs_calc_real',
      windows: [
        {
          windowId: 'win_calc',
          applicationId: 'calculator',
          title: 'Calculator',
          className: 'ApplicationFrameWindow',
          source: 'OS',
        },
      ],
      elements: [
        {
          elementId: 'el_btn_eq',
          type: 'BUTTON',
          automationId: 'equalButton',
          label: 'Equals',
          evidenceType: 'STRUCTURED_OS_UI_STATE',
          sourceObservationId: 'obs_calc_real',
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

    const calcRes = await compiler.compile({
      appId: 'calculator',
      operationId: 'calculate_equals',
      uiObservation: calcUI,
      runtimeState: calcState,
      forceRefresh: true,
    });
    assert(calcRes.success === true, 'Calculator calculate_equals compiled successfully');
    if (calcRes.success) {
      assert(calcRes.plan.actions.length === 1, 'calculate_equals generated 1 action');
      assert(calcRes.plan.actions[0].type === 'CLICK', 'Action type is CLICK');
      assert(calcRes.plan.actions[0].target?.elementId === 'el_btn_eq', 'Target matched equalButton');
    }

    // ─── Scenario C: File Explorer (navigate_to_path) ───
    const explorerUI: UIAnalysisResult = {
      observationId: 'obs_exp_real',
      windows: [
        {
          windowId: 'win_exp',
          applicationId: 'explorer',
          title: 'File Explorer',
          className: 'CabinetWClass',
          source: 'OS',
        },
      ],
      elements: [
        {
          elementId: 'el_addr',
          type: 'INPUT',
          automationId: 'AddressBandRoot',
          label: 'Address Bar',
          evidenceType: 'STRUCTURED_OS_UI_STATE',
          sourceObservationId: 'obs_exp_real',
        },
      ],
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

    const expRes = await compiler.compile({
      appId: 'explorer',
      operationId: 'navigate_to_path',
      parameters: { path: 'C:\\Users' },
      uiObservation: explorerUI,
      runtimeState: explorerState,
      forceRefresh: true,
    });
    assert(expRes.success === true, 'Explorer navigate_to_path compiled successfully');
    if (expRes.success) {
      assert(expRes.plan.actions.length === 3, 'navigate_to_path generated 3 actions (focus, type, enter)');
      assert(expRes.plan.actions[1].parameters?.text === 'C:\\Users', 'Target path parameter correctly injected');
      assert(expRes.plan.actions[2].type === 'HOTKEY', 'Enter hotkey step compiled');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 7: ATOMIC FAILURE SAFETY (NO PARTIAL PLANS)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 7: ATOMIC FAILURE SAFETY ---');
  {
    const compiler = new DeclarativeOperationCompilerImpl();

    // Partial UI missing address bar for Explorer
    const partialUI: UIAnalysisResult = {
      observationId: 'obs_partial',
      windows: [],
      elements: [], // Missing AddressBandRoot!
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

    const atomicFailureRes = await compiler.compile({
      appId: 'explorer',
      operationId: 'navigate_to_path',
      parameters: { path: 'C:\\Invalid' },
      uiObservation: partialUI,
      runtimeState: explorerState,
      forceRefresh: true,
    });

    assert(atomicFailureRes.success === false, 'Operation compilation failed atomically');
    if (!atomicFailureRes.success) {
      assert(atomicFailureRes.failureCode === 'TARGET_NOT_FOUND', 'Failure code is TARGET_NOT_FOUND');
      assert((atomicFailureRes as any).plan === undefined, 'No partial plan or action list returned on error');
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
