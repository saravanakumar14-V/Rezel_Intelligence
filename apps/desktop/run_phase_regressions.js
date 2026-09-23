import { spawn } from 'child_process';

const tests = [
  'test_13.1_semantic_control_hardening',
  'test_13.2.1_profile_contract_registry',
  'test_13.2.2_state_inference',
  'test_13.2.3_operation_compiler',
  'test_13.2.4_planner_integration',
  'test_13.3.1_native_operation_bridge',
  'test_13.3.2_adobe_project_intelligence',
  'test_13.3.3_adobe_layer_operations',
  'test_13.3.4_adobe_timeline_keyframes',
  'test_13.3.5_adobe_effects',
  'test_13.3.6_adobe_render_queue',
  'test_13.3.7_adobe_verification_recovery',
  'test_13.4_blender_application_intelligence',
  'test_13.4.1_blender_object_operations',
  'test_14_workflow_intelligence',
  'test_15_blender_production_automation',
  'test_16_universal_creative_workflows',
  'test_17_controlled_autonomy',
];

async function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit', shell: true });
    p.on('close', (code) => {
      if (code === 0) resolve(null);
      else reject(new Error(`Command ${cmd} ${args.join(' ')} failed with code ${code}`));
    });
    p.on('error', reject);
  });
}

async function runTests() {
  console.log(`======================================================================`);
  console.log(`REZEL MASTER REGRESSION RUNNER (Phases 13.1 - 16, ${tests.length} Suites)`);
  console.log(`======================================================================\n`);

  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    console.log(`\n----------------------------------------------------------------------`);
    console.log(`[${i + 1}/${tests.length}] Building and executing: ${test}`);
    console.log(`----------------------------------------------------------------------\n`);

    try {
      await runCommand('node', ['run_test.js', test]);
      await runCommand('node', [`dist_test/${test}.js`]);
    } catch (err) {
      console.error(`\n[FATAL] Regression failed on suite: ${test}`, err);
      process.exit(1);
    }
  }

  console.log('\n======================================================================');
  console.log('ALL PHASE 13 - 16 REGRESSION SUITES PASSED (100% SUCCESS)');
  console.log('======================================================================\n');
}

runTests();
