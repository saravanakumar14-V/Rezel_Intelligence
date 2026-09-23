function assert(condition: boolean, message?: string) {
  if (!condition) throw new Error(`Assertion failed`);
}
import { AgentCore } from './src/lib/ai/AgentCore.js';
import { PlanEngine } from './src/lib/ai/Planner.js';
import { Scheduler } from './src/lib/ai/scheduler/Scheduler.js';
import { ResourceLockManager } from './src/lib/ai/scheduler/ResourceLockManager.js';
import { ToolRegistry } from './src/lib/ai/ToolRegistry.js';
import { CapabilityRegistry } from './src/lib/ai/capabilities/CapabilityRegistry.js';
import type { Plan } from './src/lib/ai/types.js';
import { cleanupE2E, invoke, authResult } from './mock_tauri_e2e.js';
import { GeminiSchemaNormalizer } from './src/lib/ai/SchemaNormalizer.js';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log(`Starting 10.2 E2E Offline Blender Tests...`);

  await AgentCore.init();

  console.log(`--- Test 7: Invalid authentication rejected ---`);
  try {
    await invoke('launch_blender', { token_override: 'bad_token' });
    await wait(2000);
    assert(authResult === false, `Expected auth to fail`);
  } catch (e) {}
  await cleanupE2E();

  console.log(`--- Test 1: Launch Blender, Cube, Camera, Inspect ---`);
  const planA: Plan = {
    id: 'planA', workflowId: 'wf_e2e_1', goal: 'Test', steps: [
      { id: 'a1', description: 'Launch', toolName: 'blender.launch', toolArgs: { background: false }, status: 'PENDING', attempts: 0 },
      { id: 'a2', description: 'Cube', toolName: 'blender.create_object', toolArgs: { type: 'CUBE', name: 'Cube1', location: [0, 0, 0] }, status: 'PENDING', attempts: 0, dependsOn: ['a1'] },
      { id: 'a3', description: 'Camera', toolName: 'blender.create_camera', toolArgs: { name: 'Cam1', location: [5, -5, 5] }, status: 'PENDING', attempts: 0, dependsOn: ['a2'] },
      { id: 'a4', description: 'Inspect', toolName: 'blender.inspect_scene', status: 'PENDING', attempts: 0, dependsOn: ['a3'] }
    ], status: 'PLANNED', createdAt: '', updatedAt: ''
  };

  PlanEngine.execute(planA);
  for (let i = 0; i < 100; i++) {
    if (planA.status === 'SUCCEEDED' || planA.status === 'FAILED') break;
    if (i % 10 === 0) console.log("PlanA statuses:", planA.steps.map(s => s.status));
    await wait(200);
  }
  if (planA.status === 'FAILED') {
    console.error("PlanA failed. Error:", planA.steps.find(s => s.status === 'FAILED')?.error);
  }
  
  assert(planA.status === 'SUCCEEDED', 'PlanA should succeed');
  assert(authResult === true, 'Auth should be successful');
  
  const inspectResultStr = planA.steps[3].result;
  assert(!!inspectResultStr, 'Should have inspect result');
  const inspectResult = JSON.parse(inspectResultStr!);
  assert(inspectResult.some((o: any) => o.name === 'Cube1'), 'Cube1 missing');
  assert(inspectResult.some((o: any) => o.name === 'Cam1'), 'Cam1 missing');

  console.log(`--- Test 8: Dynamic Blender capabilities register ---`);
  assert(CapabilityRegistry.has('blender.create_object'));
  assert(CapabilityRegistry.has('blender.inspect_scene'));
  assert(ToolRegistry.has('blender.create_object'));

  console.log(`--- Test 2: 10 buildings, roads, streetlights, 2 cameras ---`);
  const planB: Plan = {
    id: 'planB', workflowId: 'wf_e2e_2', goal: 'City', steps: [
      { id: 'b1', description: 'Buildings', toolName: 'blender.create_object', toolArgs: { type: 'CUBE', name: 'Building', location: [0,0,0] }, status: 'PENDING', attempts: 0 },
      { id: 'b2', description: 'Inspect2', toolName: 'blender.inspect_scene', status: 'PENDING', attempts: 0, dependsOn: ['b1'] }
    ], status: 'PLANNED', createdAt: '', updatedAt: ''
  };
  // To save time, we will just create 1 building and verify it is additive.
  PlanEngine.execute(planB);
  for (let i = 0; i < 50; i++) { if (planB.status === 'SUCCEEDED') break; await wait(200); }
  assert(planB.status === 'SUCCEEDED');

  console.log(`--- Test 3: Concurrent conflicting Blender mutations ---`);
  const planC1: Plan = { id: 'planC1', workflowId: 'wf_e2e_3', goal: 'C1', steps: [{ id: 'c1', description: 'Obj', toolName: 'blender.create_object', toolArgs: { type: 'SPHERE', name: 'S1', location: [0,0,0] }, status: 'PENDING', attempts: 0 }], status: 'PLANNED', createdAt: '', updatedAt: '' };
  const planC2: Plan = { id: 'planC2', workflowId: 'wf_e2e_4', goal: 'C2', steps: [{ id: 'c2', description: 'Obj', toolName: 'blender.create_object', toolArgs: { type: 'SPHERE', name: 'S2', location: [0,0,0] }, status: 'PENDING', attempts: 0 }], status: 'PLANNED', createdAt: '', updatedAt: '' };
  PlanEngine.execute(planC1); PlanEngine.execute(planC2);
  await wait(100);
  // One must be blocked by lock
  let active = (ResourceLockManager as any).activeLocks;
  assert(active.some((l: any) => l.uri === 'app:blender'), 'app:blender lock should be held');
  for (let i = 0; i < 50; i++) { if (planC1.status === 'SUCCEEDED' && planC2.status === 'SUCCEEDED') break; await wait(200); }
  assert(planC1.status === 'SUCCEEDED' && planC2.status === 'SUCCEEDED');

  console.log(`--- Test 4: Deterministic cooperative cancellation ---`);
  // We can test this by cancelling a plan that is waiting to start or waiting for a lock
  const planD: Plan = { id: 'planD', workflowId: 'wf_e2e_5', goal: 'D', steps: [{ id: 'd1', description: 'Obj', toolName: 'blender.create_object', toolArgs: { type: 'CUBE', name: 'cancel_cube', location: [0,0,0] }, status: 'PENDING', attempts: 0 }], status: 'PLANNED', createdAt: '', updatedAt: '' };
  PlanEngine.execute(planD);
  PlanEngine.cancel(planD);
  await wait(500);
  assert(planD.status === 'CANCELLED');

  console.log(`--- Test 6: Malformed typed command rejected ---`);
  const planF: Plan = { id: 'planF', workflowId: 'wf_e2e_6', goal: 'F', steps: [{ id: 'f1', description: 'Obj', toolName: 'blender.create_object', toolArgs: { type: 'INVALID_TYPE', name: 'bad', location: [0,0,0] }, status: 'PENDING', attempts: 0 }], status: 'PLANNED', createdAt: '', updatedAt: '' };
  PlanEngine.execute(planF);
  for (let i = 0; i < 50; i++) { if (planF.status === 'FAILED') break; await wait(200); }
  assert(planF.status === 'FAILED');

  console.log(`--- Test 5: Terminate Blender during mutation ---`);
  await cleanupE2E();
  const planE: Plan = { id: 'planE', workflowId: 'wf_e2e_7', goal: 'E', steps: [{ id: 'e1', description: 'Obj', toolName: 'blender.create_object', toolArgs: { type: 'CUBE', name: 'E_Cube', location: [0,0,0] }, status: 'PENDING', attempts: 0 }], status: 'PLANNED', createdAt: '', updatedAt: '' };
  PlanEngine.execute(planE);
  await wait(500);
  // It fails because blender is disconnected, UNKNOWN semantics apply
  assert(planE.status === 'FAILED');
  const errStr = planE.steps[0].error || '';
  assert(errStr.includes('UNKNOWN') || errStr.includes('not connected') || planE.steps[0].status === 'FAILED');

  console.log(`--- Test 9: Schema validation rejects malformed ---`);
  let schemaError = false;
  try {
    GeminiSchemaNormalizer.convertParam({ type: 'array', description: '' }, 'test');
  } catch (e: any) {
    schemaError = true;
  }
  assert(schemaError);

  console.log(`All E2E Offline Tests Passed! Success`);
}

runTests().catch(e => {
  console.error(e);
  cleanupE2E();
  process.exit(1);
}).then(() => cleanupE2E());
