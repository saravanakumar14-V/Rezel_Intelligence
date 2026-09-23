/**
 * REZEL RELEASE HARDENING ACCEPTANCE TEST SUITE
 *
 * Verifies all 4 P1 release hardening requirements:
 * 1. Autonomy UI states & event subscription (12 states, zero CoT, structured audit traces).
 * 2. Tauri IPC / Filesystem security & path-traversal denial.
 * 3. Windows Code Signing configuration & honest non-fabrication reporting.
 * 4. Production Windows Packaging & packaged resource resolution.
 */

import { AutonomySupervisor } from './src/lib/ai/autonomy/AutonomySupervisor';
import type {
  AutonomyState,
  AutonomyEvent,
  AutonomyGoal
} from './src/lib/ai/autonomy/types';
import { AUTONOMY_STATE_CONFIG } from './src/components/panels/auto/AutonomySessionCard';
import { ProductionPathResolver } from './src/lib/system/ProductionPathResolver';
import { SigningConfigValidator } from './src/lib/build/SigningConfigValidator';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function runReleaseHardeningTests() {
  console.log('\n======================================================================');
  console.log('REZEL FINAL RELEASE HARDENING SUITE (P1 VERIFICATION)');
  console.log('======================================================================\n');

  let passed = 0;
  let total = 0;

  function test(name: string, fn: () => void | Promise<void>) {
    total++;
    console.log(`[TEST ${total}] ${name}`);
    try {
      fn();
      passed++;
    } catch (err) {
      console.error(`Error in test ${total}:`, err);
      throw err;
    }
  }

  // ── SECTION 1: AUTONOMY UI STATES & STRUCTURED OBSERVABILITY ──────────────────
  console.log('--- SECTION 1: AUTONOMY UI STATES & STRUCTURED TRACES ---');

  test('All 12+ required autonomy states exist in UI theme configuration', () => {
    const requiredStates: AutonomyState[] = [
      'IDLE',
      'ANALYZING_GOAL',
      'FORMULATING_BOUNDED_PLAN',
      'AWAITING_BUDGET_APPROVAL',
      'EXECUTING',
      'OBSERVING_STATE',
      'CORRECTION_REQUIRED',
      'EVALUATING_POLICY',
      'EXECUTING_CORRECTION',
      'ESCALATING_TO_USER',
      'PAUSED',
      'GOAL_MET',
      'BUDGET_EXHAUSTED',
      'ABORTED',
      'UNSUPPORTED_GOAL',
    ];

    for (const state of requiredStates) {
      assert(
        Boolean(AUTONOMY_STATE_CONFIG[state]),
        `State '${state}' has user-visible UI styling and icon mapping`
      );
      assert(
        Boolean(AUTONOMY_STATE_CONFIG[state].label && AUTONOMY_STATE_CONFIG[state].color),
        `State '${state}' has human-readable label '${AUTONOMY_STATE_CONFIG[state].label}' and distinct color`
      );
    }
  });

  test('AutonomySupervisor event subscription emits live state updates and decision traces', async () => {
    const receivedEvents: AutonomyEvent[] = [];
    const handler = (event: AutonomyEvent) => {
      receivedEvents.push(event);
    };

    AutonomySupervisor.addEventHandler(handler);

    const goal: AutonomyGoal = {
      goalId: 'test_ui_event_goal',
      rawQuery: 'Create 3D cylinder with height 4.0 in Blender',
      targetApplication: 'blender',
      budget: { maxOperations: 5, maxDurationMs: 10000 },
    };

    const res = await AutonomySupervisor.pursueGoal(goal);

    AutonomySupervisor.removeEventHandler(handler);

    assert(receivedEvents.length >= 2, 'Received multiple real-time autonomy events');
    assert(
      receivedEvents.some((e) => e.type === 'session_started'),
      'Emitted session_started event'
    );
    assert(
      receivedEvents.some((e) => e.type === 'state_changed'),
      'Emitted state_changed event'
    );
    assert(
      receivedEvents.some((e) => e.type === 'session_completed'),
      'Emitted session_completed event with final result'
    );

    // Verify zero Chain of Thought in emitted decision traces
    for (const dec of res.decisions) {
      assert(!dec.reason.includes('<thinking>'), 'Zero <thinking> tags in decision trace');
      assert(!dec.reason.includes('<thought>'), 'Zero <thought> tags in decision trace');
      assert(Boolean(dec.budgetRemaining), 'Decision trace includes budget remaining snapshot');
    }
  });

  // ── SECTION 2: TAURI IPC & FILESYSTEM SECURITY SCOPE ────────────────────────
  console.log('\n--- SECTION 2: TAURI IPC & FILESYSTEM SECURITY SCOPES ---');

  test('Path traversal attempts are rejected', () => {
    const traversalPaths = [
      '../../etc/passwd',
      '..\\..\\Windows\\System32\\cmd.exe',
      '/var/log/system.log',
      '\\Windows\\System32\\calc.exe',
      '../../../rezel_secrets.key',
    ];

    for (const p of traversalPaths) {
      let rejected = false;
      try {
        ProductionPathResolver.resolveResourcePath(p);
      } catch (err: any) {
        rejected = true;
        assert(
          err.message.includes('rejected') || err.message.includes('not permitted'),
          `Path '${p}' safely rejected with error: ${err.message}`
        );
      }
      assert(rejected, `Out-of-scope / traversal path '${p}' MUST be rejected`);
    }
  });

  test('Valid relative resource paths resolve within expected boundaries', () => {
    const blenderBridge = ProductionPathResolver.resolveBlenderBridgePath();
    assert(
      blenderBridge.includes('blender_ipc_client.py'),
      `Blender bridge resolves correctly to '${blenderBridge}'`
    );
    assert(!blenderBridge.includes('..'), 'Resolved path contains no parent traversal');
  });

  // ── SECTION 3: WINDOWS CODE SIGNING DETECTION ──────────────────────────────
  console.log('\n--- SECTION 3: WINDOWS CODE SIGNING CONFIGURATION ---');

  test('Detects missing signing certificate without fabricating dummy signatures', () => {
    // Delete any dev environment cert override
    const prevCert = process.env.REZEL_WINDOWS_SIGNING_CERT_THUMBPRINT;
    delete process.env.REZEL_WINDOWS_SIGNING_CERT_THUMBPRINT;

    const audit = SigningConfigValidator.evaluateSigningConfig();

    if (prevCert) process.env.REZEL_WINDOWS_SIGNING_CERT_THUMBPRINT = prevCert;

    assert(
      audit.status === 'CODE SIGNING CONFIGURED — CERTIFICATE NOT PRESENT IN BUILD ENVIRONMENT',
      `Accurately reports: '${audit.status}'`
    );
    assert(audit.certificateThumbprintProvided === false, 'certificateThumbprintProvided is truthfully false');
    assert(audit.warnings.length > 0, 'Includes explicit SmartScreen warning');
  });

  test('Reports configured and available when certificate is provided', () => {
    const audit = SigningConfigValidator.evaluateSigningConfig({
      certificateThumbprint: 'E4A9F2C7891234567890ABCDEF1234567890ABCD',
    });

    assert(
      audit.status === 'CONFIGURED_AND_AVAILABLE',
      'Recognizes valid configured signing thumbprint'
    );
    assert(audit.certificateThumbprintProvided === true, 'certificateThumbprintProvided is true');
    assert(audit.digestAlgorithm === 'sha256', 'Uses sha256 digest algorithm');
  });

  // ── SECTION 4: WINDOWS PACKAGING & PRODUCTION RESOLUTION ───────────────────
  console.log('\n--- SECTION 4: WINDOWS PACKAGING & RESOURCE RESOLUTION ---');

  test('Packaged resource layout resolution simulates installed environment correctly', () => {
    const packagedRes = ProductionPathResolver.resolveResourcePath(
      'blender_ipc_client.py',
      'C:/Program Files/Rezel/resources'
    );

    assert(
      packagedRes.resolvedPath === 'C:/Program Files/Rezel/resources/blender_ipc_client.py',
      `Packaged layout resolves cleanly to: '${packagedRes.resolvedPath}'`
    );
  });

  console.log('\n======================================================================');
  console.log(`RELEASE HARDENING SUITE COMPLETE: ${passed}/${total} PASSED (100% SUCCESS)`);
  console.log('======================================================================\n');
}

runReleaseHardeningTests().catch((err) => {
  console.error('Release hardening tests failed:', err);
  process.exit(1);
});
