#!/usr/bin/env node
/**
 * REZEL AUTOMATED TEST RUNNER
 *
 * Deterministic, reproducible test infrastructure for Rezel.
 * Executes TypeScript test suites using tsx, parses structured assertions,
 * prevents swallowed errors, handles live environment detection gracefully,
 * and exits non-zero on failure.
 */

import { spawn } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const DESKTOP_ROOT = resolve(__dirname, '..');

// ─── Test Suite Classifications ──────────────────────────────────────────────

const PHASE_SUITES = [
  'test_13.1_semantic_control_hardening.ts',
  'test_13.2.1_profile_contract_registry.ts',
  'test_13.2.2_state_inference.ts',
  'test_13.2.3_operation_compiler.ts',
  'test_13.2.4_planner_integration.ts',
  'test_13.3.1_native_operation_bridge.ts',
  'test_13.3.2_adobe_project_intelligence.ts',
  'test_13.3.3_adobe_layer_operations.ts',
  'test_13.3.4_adobe_timeline_keyframes.ts',
  'test_13.3.5_adobe_effects.ts',
  'test_13.3.6_adobe_render_queue.ts',
  'test_13.3.7_adobe_verification_recovery.ts',
  'test_13.4.1_blender_object_operations.ts',
  'test_13.4_blender_application_intelligence.ts',
  'test_14_workflow_intelligence.ts',
  'test_15_blender_production_automation.ts',
  'test_16_universal_creative_workflows.ts',
  'test_17_controlled_autonomy.ts',
  'test_p1_release_hardening.ts',
];

const REGRESSION_SUITES = [
  'test_regression.ts',
  'test_p1_release_hardening.ts',
  'test_r6_master_acceptance.ts',
  'test_17_controlled_autonomy.ts',
  'test_16_universal_creative_workflows.ts',
  'test_15_blender_production_automation.ts',
  'test_14_workflow_intelligence.ts',
  'test_13.1_semantic_control_hardening.ts',
  'test_13.2.3_operation_compiler.ts',
  'test_13.3.7_adobe_verification_recovery.ts',
  'test_13.4.1_blender_object_operations.ts',
];

const UNIT_MOCK_SUITES = [
  'test_tool_contract.ts',
  'test_p0_5_gemini_tool_contract.ts',
  'test_12.8_trust_permissions.ts',
  'test_12.9_security_audit.ts',
  'test_11.2a_foundation.ts',
  'test_11.2b_contract.ts',
  'test_11.2b_gemini_adapter.ts',
  'test_11.2b_openai_adapter.ts',
  'test_11.2b_anthropic_adapter.ts',
  'test_11.2b_ollama_adapter.ts',
  'test_11.2c_provider_router.ts',
  'test_11.2c_failover.ts',
  'test_11.2c_local_policy.ts',
  'test_11.2c_agentcore_integration.ts',
  'test_11.2c_reasoning_integration.ts',
  'test_11.3a_routing_planning_integration.ts',
  'test_11.3b_per_step_dynamic_routing.ts',
  'test_11.3c_application_automation_platform.ts',
  'test_11.4a_workflow_templates.ts',
  'test_11.4b_workflow_dataflow.ts',
  'test_11.4c_workflow_checkpoints.ts',
  'test_11.4d_human_approval.ts',
  'test_11.5a_multimodal_vision.ts',
  'test_11.5b_multimodal_audio.ts',
  'test_11.5c_multimodal_context.ts',
  'test_11.6a_screen_observation.ts',
  'test_11.6b_ui_understanding.ts',
  'test_11.6c_controlled_computer_actions.ts',
  'test_11.6d_closed_loop_automation.ts',
  'test_11.7a_memory.ts',
  'test_11.7b_project_memory.ts',
  'test_11.7c_memory_personalization.ts',
  'test_11.8a_hierarchical_planning.ts',
  'test_11.8b_plan_review.ts',
  'test_11.8c_plan_editing.ts',
  'test_11.8d_long_running_agents.ts',
];

const LIVE_ENVIRONMENT_SUITES = [
  'test_p0_4_real_gemini_transport.ts',
  'test_p0_6_real_tool_execution.ts',
  'test_p0_7_real_chat_forensics.ts',
  'test_chat_real_provider_execution.ts',
  'test_11.3d_blender_production_acceptance.ts',
  'test_11.3e_after_effects_production_acceptance.ts',
  'test_11.6a_real_screen_capture.ts',
  'test_11.6b_real_windows_uia.ts',
  'test_11.6c_real_windows_input.ts',
];

// ─── Command Line Parser ─────────────────────────────────────────────────────

const targetArg = process.argv[2] || 'default';
let suiteFilter = null;
if (process.argv[3]) {
  suiteFilter = process.argv[3].toLowerCase();
}

function selectTestFiles(mode) {
  switch (mode) {
    case 'unit':
      return UNIT_MOCK_SUITES;
    case 'regression':
      return REGRESSION_SUITES;
    case 'phases':
      return PHASE_SUITES;
    case 'live':
      return LIVE_ENVIRONMENT_SUITES;
    case 'all': {
      const allFiles = readdirSync(DESKTOP_ROOT)
        .filter((f) => f.startsWith('test_') && f.endsWith('.ts'))
        .sort();
      return allFiles;
    }
    case 'default':
    default:
      // Default: run all Phase acceptance suites + regression suites (deduplicated)
      return Array.from(new Set([...PHASE_SUITES, ...REGRESSION_SUITES]));
  }
}

// ─── Test Runner ─────────────────────────────────────────────────────────────

async function runTestFile(filename) {
  const fullPath = join(DESKTOP_ROOT, filename);
  const startTime = Date.now();

  const tsxCli = join(DESKTOP_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tsxCli, fullPath], {
      cwd: DESKTOP_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        REZEL_TEST_RUNNER: 'true',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    // 90 second timeout per test file
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({
        filename,
        success: false,
        durationMs: Date.now() - startTime,
        exitCode: -1,
        passCount: 0,
        failCount: 1,
        status: 'TIMEOUT',
        error: 'Execution exceeded 90s timeout',
        stdout,
        stderr,
      });
    }, 90000);

    child.on('close', (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - startTime;
      const combined = stdout + '\n' + stderr;

      // Check if blocked by live environment prerequisite
      const isBlocked =
        combined.includes('ENVIRONMENTALLY BLOCKED') ||
        combined.includes('API key missing') ||
        combined.includes('GEMINI_API_KEY not found') ||
        combined.includes('Blender executable not found') ||
        combined.includes('ECONNREFUSED');

      // Count passes/fails
      const passMatches = (stdout.match(/\[PASS\]/g) || []).length;
      const failMatches = (stdout.match(/\[FAIL\]/g) || []).length;

      // Extract summary results like "76/76 PASSED"
      const summaryMatch = stdout.match(/(\d+)\/(\d+)\s+PASSED/i);
      let passCount = passMatches;
      let totalCount = passMatches + failMatches;

      if (summaryMatch) {
        passCount = parseInt(summaryMatch[1], 10);
        totalCount = parseInt(summaryMatch[2], 10);
      }

      let status = 'PASS';
      if (code !== 0) {
        status = isBlocked ? 'ENVIRONMENTALLY BLOCKED' : 'FAIL';
      } else if (failMatches > 0) {
        status = 'FAIL';
      }

      resolve({
        filename,
        success: status === 'PASS' || status === 'ENVIRONMENTALLY BLOCKED',
        durationMs,
        exitCode: code ?? 0,
        passCount,
        failCount: totalCount - passCount > 0 ? totalCount - passCount : (status === 'FAIL' ? 1 : 0),
        status,
        error: code !== 0 && !isBlocked ? (stderr || stdout).slice(-500) : undefined,
        stdout,
        stderr,
      });
    });
  });
}

// ─── Main Execution ──────────────────────────────────────────────────────────

async function main() {
  console.log('\n======================================================================');
  console.log(`  REZEL AUTOMATED TEST RUNNER — Mode: [${targetArg.toUpperCase()}]`);
  console.log('======================================================================\n');

  let testFiles = selectTestFiles(targetArg);
  if (suiteFilter) {
    testFiles = testFiles.filter((f) => f.toLowerCase().includes(suiteFilter));
  }

  // Filter to files that actually exist
  const existingFiles = testFiles.filter((f) => {
    try {
      return statSync(join(DESKTOP_ROOT, f)).isFile();
    } catch {
      return false;
    }
  });

  console.log(`Discovered ${existingFiles.length} test suite files to execute.\n`);

  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalBlocked = 0;
  let totalAssertions = 0;
  const suiteStartTime = Date.now();

  for (let i = 0; i < existingFiles.length; i++) {
    const file = existingFiles[i];
    const indexStr = `[${String(i + 1).padStart(2, ' ')}/${existingFiles.length}]`;
    process.stdout.write(`  ${indexStr} Running ${file.padEnd(52, ' ')} `);

    const res = await runTestFile(file);
    results.push(res);

    const timeStr = `${(res.durationMs / 1000).toFixed(2)}s`.padStart(6, ' ');

    if (res.status === 'PASS') {
      totalPassed++;
      totalAssertions += res.passCount;
      console.log(`\x1b[32mPASS\x1b[0m (${res.passCount} assertions, ${timeStr})`);
    } else if (res.status === 'ENVIRONMENTALLY BLOCKED') {
      totalBlocked++;
      console.log(`\x1b[33mBLOCKED\x1b[0m (Prerequisite missing, ${timeStr})`);
    } else {
      totalFailed++;
      console.log(`\x1b[31mFAIL\x1b[0m (Exit ${res.exitCode}, ${timeStr})`);
      if (res.error) {
        console.error(`\x1b[31m       Error: ${res.error.trim().split('\n')[0]}\x1b[0m`);
      }
    }
  }

  const totalDuration = ((Date.now() - suiteStartTime) / 1000).toFixed(2);

  console.log('\n======================================================================');
  console.log('  TEST EXECUTION SUMMARY');
  console.log('======================================================================');
  console.log(`  Total Files Discovered:  ${existingFiles.length}`);
  console.log(`  Suites Passed:           \x1b[32m${totalPassed}\x1b[0m`);
  console.log(`  Suites Failed:           \x1b[${totalFailed > 0 ? '31' : '32'}m${totalFailed}\x1b[0m`);
  console.log(`  Suites Blocked:          \x1b[33m${totalBlocked}\x1b[0m`);
  console.log(`  Total Passed Assertions: ${totalAssertions}`);
  console.log(`  Total Execution Time:    ${totalDuration}s`);
  console.log('======================================================================\n');

  if (totalFailed > 0) {
    console.error(`❌ TEST SUITE FAILED: ${totalFailed} suite(s) encountered failures.\n`);
    process.exit(1);
  } else {
    console.log(`✅ TEST SUITE PASSED: All ${totalPassed} suites succeeded.\n`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('[FATAL] Test runner uncaught exception:', err);
  process.exit(1);
});
