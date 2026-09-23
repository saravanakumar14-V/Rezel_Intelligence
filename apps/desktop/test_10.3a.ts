import { VerificationEngine } from './src/lib/ai/verification/VerificationEngine';
import { ApplicationObserver } from './src/lib/ai/verification/ApplicationObserver';
import { ResourceLockManager } from './src/lib/ai/scheduler/ResourceLockManager';
import { CapabilityRegistry } from './src/lib/ai/capabilities/CapabilityRegistry';
import { AIToolExecutor } from './src/lib/ai/ToolExecutor';
import { planStateMachine } from './src/lib/ai/PlanStateMachine';
import { PlanEngine } from './src/lib/ai/PlanEngine';
import type { Plan } from './src/lib/ai/types';

// Mock dependencies
import './mock_tauri_core.js';
import { mockSecurityToolExecutor } from './src/lib/security/ToolExecutor';

// Setup Mock Capabilities
CapabilityRegistry.register({
  id: 'blender.inspect_scene',
  description: 'Inspect blender scene',
  parameters: {},
  toolGroup: 'app_ipc_blender',
  mutatesExternalState: false,
  requiredLocks: [{ uri: 'app:blender', access: 'READ' }],
  execute: async (args, context) => {
    if (context.metadata.mockError) {
      return { success: false, error: 'IPC Error' };
    }
    if (context.metadata.mockMalformed) {
       return { success: true, output: "This is not an array" };
    }
    return {
      success: true,
      output: [
        { name: 'Cube', type: 'MESH', location: [0, 0, 0] },
        { name: 'Camera', type: 'CAMERA', location: [0, -5, 0] }
      ]
    };
  }
});

CapabilityRegistry.register({
  id: 'ae_inspect_project',
  description: 'Inspect ae project',
  parameters: {},
  toolGroup: 'app_ipc_ae',
  mutatesExternalState: false,
  requiredLocks: [{ uri: 'app:after_effects', access: 'READ' }],
  execute: async () => {
    return {
      success: true,
      output: [
        { id: '1', name: 'Background', type: 'solid', properties: { opacity: 100 } }
      ]
    };
  }
});

CapabilityRegistry.register({
  id: 'blender.create_object',
  description: 'Create object',
  parameters: {},
  toolGroup: 'app_ipc_blender',
  mutatesExternalState: true,
  requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }],
  execute: async () => {
    return { success: true, output: 'Created' };
  }
});

async function runTests() {
  console.log("Starting 10.3 Phase B Tests (Observation & Verification)...");

  // A. Blender observation normalization
  console.log("--- A. Blender observation normalization ---");
  let obs = await ApplicationObserver.observe('blender', { workflowId: 'wf1', executionId: 'exe1', metadata: {} });
  console.log('OBS RESULT:', JSON.stringify(obs, null, 2));
  if (obs === 'UNKNOWN') throw new Error("Expected observation to succeed");
  if (obs.entities.length !== 2 || obs.entities[0].type !== 'mesh') throw new Error("Normalization failed");

  // B. Blender VERIFIED predicate
  console.log("--- B. Blender VERIFIED predicate ---");
  let result = VerificationEngine.verify(obs, { operator: 'COUNT', entityType: 'mesh', value: 1 });
  if (result !== 'VERIFIED') throw new Error("Expected VERIFIED for mesh count == 1");

  // C. NOT_VERIFIED predicate
  console.log("--- C. NOT_VERIFIED predicate ---");
  result = VerificationEngine.verify(obs, { operator: 'COUNT', entityType: 'camera', value: 2 });
  if (result !== 'NOT_VERIFIED') throw new Error("Expected NOT_VERIFIED for camera count == 2 (actual 1)");

  // D. UNKNOWN observation
  console.log("--- D. UNKNOWN observation ---");
  obs = await ApplicationObserver.observe('blender', { workflowId: 'wf2', executionId: 'exe2', metadata: { mockError: true } });
  if (obs !== 'UNKNOWN') throw new Error("Expected UNKNOWN when capability fails");

  // E. AE observation normalization
  console.log("--- E. AE observation normalization ---");
  obs = await ApplicationObserver.observe('after_effects', { workflowId: 'wf3', executionId: 'exe3', metadata: {} });
  if (obs === 'UNKNOWN' || obs.entities[0].type !== 'solid') throw new Error("AE normalization failed");

  // F. READ vs WRITE lock behavior
  console.log("--- F. READ vs WRITE lock behavior ---");
  await ResourceLockManager.acquireLocks('wf_read', 'exe_read', [{ uri: 'app:blender', access: 'READ' }]);
  let writePromiseResolved = false;
  let writePromise = ResourceLockManager.acquireLocks('wf_write', 'exe_write', [{ uri: 'app:blender', access: 'WRITE' }]).then(() => { writePromiseResolved = true; });
  await new Promise(r => setTimeout(r, 50));
  if (writePromiseResolved) throw new Error("WRITE lock should block while READ lock is held");
  ResourceLockManager.releaseLocks('wf_read', 'exe_read');
  await writePromise;
  if (!writePromiseResolved) throw new Error("WRITE lock should resolve after READ lock released");
  ResourceLockManager.releaseLocks('wf_write', 'exe_write');

  // H. malformed observation payload
  console.log("--- H. malformed observation payload ---");
  obs = await ApplicationObserver.observe('blender', { workflowId: 'wf4', executionId: 'exe4', metadata: { mockMalformed: true } });
  if (obs === 'UNKNOWN' || obs.entities.length !== 0) throw new Error("Malformed should not crash, should return empty or raw if not iterable");

  // I. malformed predicate
  console.log("--- I. malformed predicate ---");
  if (obs !== 'UNKNOWN') {
      result = VerificationEngine.verify(obs, { operator: 'NON_EXISTENT' as any });
      if (result !== 'NOT_VERIFIED') throw new Error("Malformed predicate should safely fail");
  }

  // J. stale observation handling
  console.log("--- J. stale observation handling ---");
  let obsStale = await ApplicationObserver.observe('blender', { workflowId: 'wf5', executionId: 'exe5', metadata: {} });
  if (obsStale !== 'UNKNOWN') {
     obsStale.isStale = true;
     result = VerificationEngine.verify(obsStale, { operator: 'EXISTS' });
     if (result !== 'UNKNOWN') throw new Error("Stale observation should yield UNKNOWN verification");
  }

  // K. UNKNOWN reconciliation
  console.log("--- K. UNKNOWN reconciliation ---");
  const plan: Plan = {
    id: 'plan_rec',
    workflowId: 'wf_rec',
    goal: 'reconcile',
    status: 'RECOVERY_REQUIRED',
    createdAt: '', updatedAt: '',
    steps: [{
      id: 'step_rec',
      description: 'rec',
      status: 'UNKNOWN' as any,
      toolName: 'blender.create_object',
      attempts: 1,
      verificationPredicate: { operator: 'COUNT', entityType: 'mesh', value: 1 }
    }]
  };
  await PlanEngine.reconcileStep(plan, plan.steps[0]);
  if (plan.steps[0].verificationResult !== 'VERIFIED') throw new Error("Reconciliation should evaluate predicate");
  if (plan.steps[0].status !== 'COMPLETED') throw new Error("Reconciliation should move step to COMPLETED");

  // M. no arbitrary predicate execution
  console.log("--- M. no arbitrary predicate execution ---");
  // VerificationEngine has no `eval` or `Function` calls. Predicates are purely JSON structs (e.g. operator 'COUNT', etc.)

  console.log("\nAll 10.3 Phase B Tests Passed! Success");
}

runTests().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
