/**
 * REZEL 13.2.2 — RUNTIME APPLICATION STATE INFERENCE ACCEPTANCE TEST SUITE
 *
 * Verifies:
 * 1. Truth Values (TRUE / HIGH, FALSE / HIGH, UNKNOWN / LOW)
 * 2. Evidence Traceability (every inferred state includes source, description, confidence, observedAt)
 * 3. Conflict Resolution (Tier 1 Adapter priority vs Tier 2 UIA vs Tier 3 Matcher)
 * 4. Dimensional Independence (Activity = BUSY and Modal = MODAL coexist cleanly)
 * 5. State Cache & TTL Reuse
 * 6. Targeted Cache Invalidation (mutations invalidate, focus_only preserves)
 * 7. Session Invalidation (exit / disconnect)
 * 8. Real application scenarios (Notepad, Calculator, File Explorer)
 * 9. Non-mutation read-only guarantee
 */

import {
  ApplicationStateInferenceEngine,
  ApplicationStateInferenceEngineImpl,
} from './src/lib/ai/inference/ApplicationStateInferenceEngine';
import { UIAEvidenceMapper } from './src/lib/ai/inference/UIAEvidenceMapper';
import { ConflictResolver } from './src/lib/ai/inference/ConflictResolver';
import { StateCache } from './src/lib/ai/inference/StateCache';
import type { UIAnalysisResult } from './src/lib/ai/ui/types';
import type { StateEvidence } from './src/lib/ai/inference/types';

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
  console.log('REZEL 13.2.2 — RUNTIME APPLICATION STATE INFERENCE TEST SUITE');
  console.log('================================================================\n');

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 1: TRUTH VALUES & EVIDENCE TRACEABILITY (TRUE, FALSE, UNKNOWN)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- SUITE 1: TRUTH VALUES & EVIDENCE TRACEABILITY ---');
  {
    const engine = new ApplicationStateInferenceEngineImpl(2000);

    // 1.1 Complete Evidence -> TRUE / HIGH
    const mockNotepadUI: UIAnalysisResult = {
      observationId: 'obs_notepad_ready',
      windows: [
        {
          windowId: 'win_notepad_1',
          applicationId: 'notepad',
          title: 'Untitled - Notepad',
          bounds: { x: 100, y: 100, width: 800, height: 600 },
          focused: true,
          visible: true,
          className: 'Notepad',
          source: 'OS',
        },
      ],
      elements: [
        {
          elementId: 'el_editor_1',
          type: 'INPUT',
          role: 'Document',
          label: 'Text Editor',
          text: 'Hello Rezel OS',
          automationId: '15',
          className: 'Edit',
          visible: true,
          enabled: true,
          focused: true,
          evidenceType: 'STRUCTURED_OS_UI_STATE',
          sourceObservationId: 'obs_notepad_ready',
        },
      ],
    };

    const stateTrue = await engine.inferState({
      applicationId: 'notepad',
      executableName: 'notepad.exe',
      uiObservation: mockNotepadUI,
      forceRefresh: true,
    });

    assert(stateTrue.activeStates['APP_READY']?.isTrue === 'TRUE', 'Complete window evidence produces APP_READY = TRUE');
    assert(stateTrue.activeStates['APP_READY']?.confidence === 'HIGH', 'APP_READY confidence is HIGH');
    assert(stateTrue.activeStates['APP_READY']?.evidence.length > 0, 'APP_READY has attached evidence');
    assert(
      stateTrue.activeStates['APP_READY']?.evidence[0].source === 'PROFILE_MATCHER',
      'Evidence source identifies PROFILE_MATCHER'
    );

    assert(stateTrue.activeStates['DOCUMENT_OPEN']?.isTrue === 'TRUE', 'Editor element produces DOCUMENT_OPEN = TRUE');
    assert(stateTrue.activeStates['DOCUMENT_OPEN']?.confidence === 'HIGH', 'DOCUMENT_OPEN confidence is HIGH');

    // 1.2 Incomplete Evidence -> UNKNOWN / LOW (Never collapses to false!)
    const emptyUI: UIAnalysisResult = {
      observationId: 'obs_empty',
      windows: [],
      elements: [],
    };

    const stateUnknown = await engine.inferState({
      applicationId: 'notepad',
      executableName: 'notepad.exe',
      uiObservation: emptyUI,
      forceRefresh: true,
    });

    assert(stateUnknown.activeStates['APP_READY']?.isTrue === 'UNKNOWN', 'Empty observation produces APP_READY = UNKNOWN');
    assert(stateUnknown.activeStates['APP_READY']?.confidence === 'LOW', 'UNKNOWN state confidence is LOW');
    assert(
      stateUnknown.activeStates['APP_READY']?.evidence.some((e) => e.description.includes('incomplete or unavailable')),
      'Evidence explains why state is UNKNOWN'
    );

    // 1.3 Conclusive Contradiction -> FALSE / HIGH
    const wrongWindowUI: UIAnalysisResult = {
      observationId: 'obs_calc_only',
      windows: [
        {
          windowId: 'win_calc_1',
          applicationId: 'calculator',
          title: 'Calculator',
          bounds: { x: 0, y: 0, width: 400, height: 500 },
          focused: true,
          visible: true,
          className: 'ApplicationFrameWindow',
          source: 'OS',
        },
      ],
      elements: [
        {
          elementId: 'btn_1',
          type: 'BUTTON',
          label: 'One',
          automationId: 'num1Button',
          visible: true,
          evidenceType: 'STRUCTURED_OS_UI_STATE',
          sourceObservationId: 'obs_calc_only',
        },
      ],
    };

    const stateFalse = await engine.inferState({
      applicationId: 'notepad', // Looking for notepad states in calculator UI
      executableName: 'notepad.exe',
      uiObservation: wrongWindowUI,
      forceRefresh: true,
    });

    assert(stateFalse.activeStates['DOCUMENT_OPEN']?.isTrue === 'FALSE', 'Conclusive missing editor in complete UI produces DOCUMENT_OPEN = FALSE');
    assert(stateFalse.activeStates['DOCUMENT_OPEN']?.confidence === 'HIGH', 'DOCUMENT_OPEN = FALSE has HIGH confidence');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 2: CONFLICT RESOLUTION & MULTI-TIER AUTHORITY
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 2: CONFLICT RESOLUTION & MULTI-TIER AUTHORITY ---');
  {
    // Test: Tier 1 (Adapter) beats Tier 2 (UIA)
    const adapterEvidence: StateEvidence = {
      source: 'APPLICATION_ADAPTER',
      description: 'Adapter reports process is BUSY running render',
      confidence: 'HIGH',
      observedAt: Date.now(),
    };
    const uiaEvidence: StateEvidence = {
      source: 'UIA',
      description: 'UIA observed no spinner elements',
      confidence: 'MEDIUM',
      observedAt: Date.now(),
    };

    const resolvedState = ConflictResolver.resolveState('BUSY', [
      { isTrue: 'TRUE', confidence: 'HIGH', evidence: adapterEvidence },
      { isTrue: 'FALSE', confidence: 'MEDIUM', evidence: uiaEvidence },
    ]);

    assert(resolvedState.isTrue === 'TRUE', 'Tier 1 Adapter priority overrides Tier 2 UIA for same state');
    assert(resolvedState.confidence === 'HIGH', 'Resolved state carries HIGH confidence');
    assert(resolvedState.evidence.length === 2, 'Both evidence sources preserved for auditability');

    // Test: Equal Tier Conflict (Tier 2 UIA vs Tier 2 WINDOW in direct contradiction)
    const uiaEv1: StateEvidence = {
      source: 'UIA',
      description: 'UIA pattern says element is active',
      confidence: 'MEDIUM',
      observedAt: Date.now(),
    };
    const uiaEv2: StateEvidence = {
      source: 'UIA',
      description: 'UIA visual inspection says element is disabled',
      confidence: 'MEDIUM',
      observedAt: Date.now(),
    };

    const tieBreakState = ConflictResolver.resolveState('ELEMENT_ACTIVE', [
      { isTrue: 'TRUE', confidence: 'MEDIUM', evidence: uiaEv1 },
      { isTrue: 'FALSE', confidence: 'MEDIUM', evidence: uiaEv2 },
    ]);

    assert(tieBreakState.isTrue === 'UNKNOWN', 'Equal tier contradiction degrades to UNKNOWN (no random picking)');
    assert(tieBreakState.confidence === 'LOW', 'Equal tier contradiction has LOW confidence');
    assert(
      tieBreakState.evidence.some((e) => e.description.includes('Conflict between')),
      'Conflict evidence record explicitly attached'
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 3: DIMENSIONAL INDEPENDENCE (ACTIVITY vs MODAL)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 3: DIMENSIONAL INDEPENDENCE (ACTIVITY vs MODAL) ---');
  {
    const adapterBusyEv: StateEvidence = {
      source: 'APPLICATION_ADAPTER',
      description: 'Adapter reports long operation in flight',
      confidence: 'HIGH',
      observedAt: Date.now(),
    };
    const uiaModalEv: StateEvidence = {
      source: 'UIA',
      description: 'Save As modal dialog active',
      confidence: 'HIGH',
      observedAt: Date.now(),
    };

    const activity = ConflictResolver.resolveActivity('BUSY', adapterBusyEv, 'UNKNOWN', undefined);
    const modal = ConflictResolver.resolveModalState(true, true, uiaModalEv, undefined, undefined);

    assert(activity.value === 'BUSY', 'Activity dimension correctly infers BUSY');
    assert(modal.value === 'MODAL', 'Modal dimension correctly infers MODAL');
    assert(activity.value === 'BUSY' && modal.value === 'MODAL', 'Activity=BUSY and Modal=MODAL coexist without false conflict');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 4: STATE CACHE & TTL REUSE
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 4: STATE CACHE & TTL REUSE ---');
  {
    const cache = new StateCache(500); // 500ms TTL

    const mockState: any = {
      appId: 'notepad',
      sessionId: 'sess_1',
      profileStatus: 'EXACT_MATCH',
      activeStates: {},
      modalState: { value: 'NONE', confidence: 'HIGH', evidence: [] },
      activity: { value: 'IDLE', confidence: 'HIGH', evidence: [] },
      evidence: [],
      observedAt: Date.now(),
    };

    cache.set('notepad_sess_1', mockState);

    // Immediate read: within TTL
    const cached1 = cache.get('notepad_sess_1');
    assert(cached1 !== undefined, 'Cache returns entry within TTL');
    assert(cached1?.isCached === true, 'Cache marks snapshot with isCached: true');
    assert(cache.getStats().hits === 1, 'Cache hit count incremented to 1');

    // Wait for TTL expiration
    await new Promise((resolve) => setTimeout(resolve, 550));

    const expired = cache.get('notepad_sess_1');
    assert(expired === undefined, 'Cache returns undefined after TTL expiration');
    assert(cache.getStats().evictions === 1, 'Cache eviction count incremented on expiry');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 5: TARGETED CACHE INVALIDATION & SESSION CLEANUP
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 5: TARGETED CACHE INVALIDATION & SESSION CLEANUP ---');
  {
    const engine = new ApplicationStateInferenceEngineImpl(10000);

    const mockUI: UIAnalysisResult = {
      observationId: 'obs_cache_test',
      windows: [
        {
          windowId: 'win_1',
          applicationId: 'notepad',
          title: 'Untitled - Notepad',
          bounds: { x: 0, y: 0, width: 800, height: 600 },
          focused: true,
          visible: true,
          source: 'OS',
        },
      ],
      elements: [],
    };

    // 1. Prime cache
    const s1 = await engine.inferState({
      applicationId: 'notepad',
      sessionId: 'sess_test',
      uiObservation: mockUI,
    });
    assert(s1.isCached === false, 'First fetch is live (not cached)');

    // 2. Read from cache
    const s2 = await engine.inferState({
      applicationId: 'notepad',
      sessionId: 'sess_test',
      uiObservation: mockUI,
    });
    assert(s2.isCached === true, 'Second fetch within TTL is served from cache');

    // 3. Focus action should NOT invalidate document/app cache
    const focusInvalidated = engine.notifyActionExecuted('notepad', 'sess_test', 'FOCUS_ONLY');
    assert(!focusInvalidated, 'FOCUS_ONLY does not invalidate cache');

    const s3 = await engine.inferState({
      applicationId: 'notepad',
      sessionId: 'sess_test',
      uiObservation: mockUI,
    });
    assert(s3.isCached === true, 'Cache remains valid after FOCUS_ONLY');

    // 4. Document mutation MUST invalidate cache
    const docInvalidated = engine.notifyActionExecuted('notepad', 'sess_test', 'DOCUMENT_MUTATION');
    assert(docInvalidated, 'DOCUMENT_MUTATION successfully invalidates cache');

    const s4 = await engine.inferState({
      applicationId: 'notepad',
      sessionId: 'sess_test',
      uiObservation: mockUI,
    });
    assert(s4.isCached === false, 'Fetch after DOCUMENT_MUTATION triggers fresh live inference');

    // 5. Session disconnect invalidates cache
    const sessInvalidated = engine.invalidateSession('notepad', 'sess_test');
    assert(sessInvalidated, 'invalidateSession successfully removes session entry');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 6: REAL APPLICATION SCENARIOS (NOTEPAD, CALCULATOR, EXPLORER)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 6: REAL APPLICATION SCENARIOS ---');
  {
    const engine = new ApplicationStateInferenceEngineImpl(5000);

    // Scenario A: Notepad with Dirty Document
    const dirtyNotepadUI: UIAnalysisResult = {
      observationId: 'obs_dirty_notepad',
      windows: [
        {
          windowId: 'win_np_dirty',
          applicationId: 'notepad',
          title: '*Important_Notes.txt - Notepad',
          bounds: { x: 100, y: 100, width: 800, height: 600 },
          focused: true,
          visible: true,
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
          text: 'Unsaved modifications here...',
          evidenceType: 'STRUCTURED_OS_UI_STATE',
          sourceObservationId: 'obs_dirty_notepad',
        },
      ],
    };

    const npState = await engine.inferState({
      applicationId: 'notepad',
      executableName: 'notepad.exe',
      uiObservation: dirtyNotepadUI,
      forceRefresh: true,
    });

    assert(npState.profileStatus !== 'NO_PROFILE', 'Notepad profile resolved');
    assert(npState.document?.name?.value === 'Important_Notes.txt', 'Document name extracted: Important_Notes.txt');
    assert(npState.document?.dirty?.value === true, 'Document dirty state correctly inferred as TRUE from title asterisk');
    assert(npState.activeStates['DOCUMENT_OPEN']?.isTrue === 'TRUE', 'DOCUMENT_OPEN is TRUE');
    assert(npState.modalState.value === 'NONE', 'Modal state is NONE');

    // Scenario B: Windows Calculator with Display Result
    const calcUI: UIAnalysisResult = {
      observationId: 'obs_calc_ready',
      windows: [
        {
          windowId: 'win_calc',
          applicationId: 'calculator',
          title: 'Calculator',
          bounds: { x: 200, y: 200, width: 350, height: 500 },
          focused: true,
          visible: true,
          className: 'ApplicationFrameWindow',
          source: 'OS',
        },
      ],
      elements: [
        {
          elementId: 'el_calc_disp',
          type: 'TEXT',
          automationId: 'CalculatorResults',
          name: 'Display is 42',
          text: '42',
          evidenceType: 'STRUCTURED_OS_UI_STATE',
          sourceObservationId: 'obs_calc_ready',
        },
        {
          elementId: 'el_btn_eq',
          type: 'BUTTON',
          automationId: 'equalButton',
          label: 'Equals',
          evidenceType: 'STRUCTURED_OS_UI_STATE',
          sourceObservationId: 'obs_calc_ready',
        },
      ],
    };

    const calcState = await engine.inferState({
      applicationId: 'calculator',
      executableName: 'calc.exe',
      uiObservation: calcUI,
      forceRefresh: true,
    });

    assert(calcState.activeStates['APP_READY']?.isTrue === 'TRUE', 'Calculator APP_READY is TRUE');
    assert(calcState.modalState.value === 'NONE', 'Calculator modal state is NONE');

    // Scenario C: File Explorer with Address Bar Path
    const explorerUI: UIAnalysisResult = {
      observationId: 'obs_explorer_ready',
      windows: [
        {
          windowId: 'win_exp',
          applicationId: 'explorer',
          title: 'Projects',
          bounds: { x: 50, y: 50, width: 1000, height: 700 },
          focused: true,
          visible: true,
          className: 'CabinetWClass',
          source: 'OS',
        },
      ],
      elements: [
        {
          elementId: 'el_addr',
          type: 'INPUT',
          role: 'ComboBox',
          automationId: 'AddressBandRoot',
          className: 'Address Band Root',
          value: 'C:\\Projects\\Rezel',
          evidenceType: 'STRUCTURED_OS_UI_STATE',
          sourceObservationId: 'obs_explorer_ready',
        },
      ],
    };

    const expState = await engine.inferState({
      applicationId: 'explorer',
      executableName: 'explorer.exe',
      uiObservation: explorerUI,
      forceRefresh: true,
    });

    assert(expState.activeStates['APP_READY']?.isTrue === 'TRUE', 'File Explorer APP_READY is TRUE');
    assert(expState.workspace?.value === 'C:\\Projects\\Rezel', 'Explorer current location extracted: C:\\Projects\\Rezel');
    assert(expState.workspace?.confidence === 'HIGH', 'Explorer location confidence is HIGH');

    // Scenario D: File Explorer with Modal Confirmation Dialog
    const explorerWithModalUI: UIAnalysisResult = {
      observationId: 'obs_explorer_modal',
      windows: [
        ...explorerUI.windows,
        {
          windowId: 'win_dlg_delete',
          title: 'Delete File',
          className: '#32770',
          bounds: { x: 300, y: 300, width: 400, height: 200 },
          focused: true,
          visible: true,
          source: 'OS',
        },
      ],
      elements: explorerUI.elements,
    };

    const expModalState = await engine.inferState({
      applicationId: 'explorer',
      executableName: 'explorer.exe',
      uiObservation: explorerWithModalUI,
      forceRefresh: true,
    });

    assert(expModalState.modalState.value === 'MODAL', 'File Explorer modalState correctly detects MODAL from #32770 dialog');
    assert(expModalState.modalState.confidence === 'HIGH', 'Modal state confidence is HIGH');
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
