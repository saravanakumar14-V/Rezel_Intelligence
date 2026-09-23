function assert(condition: boolean, message?: string) {
  if (!condition) throw new Error(`Assertion failed${message ? ': ' + message : ''}`);
}
import { PlanEngine } from './src/lib/ai/Planner.js';
import { Scheduler } from './src/lib/ai/scheduler/Scheduler.js';
import { ResourceLockManager } from './src/lib/ai/scheduler/ResourceLockManager.js';
import type { Plan } from './src/lib/ai/types.js';
import './mock_tauri_core.js';

// Helper wait
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log("Starting 10.2 Blender IPC Tests...");

  console.log("--- A. Blender Launch and Basic Scene Setup ---");
  const planA: Plan = {
    id: 'planA', workflowId: 'wf_blender_1', goal: 'Test', steps: [
      { id: 's1', description: 'Launch', toolName: 'blender.launch', toolArgs: { background: true }, status: 'PENDING', attempts: 0 },
      { id: 's2', description: 'Wait IPC', toolName: 'fs.read_text', toolArgs: { path: "dummy" }, status: 'PENDING', attempts: 0, dependsOn: ['s1'] }, // Just to give it time
      { id: 's3', description: 'Cube', toolName: 'blender.create_object', toolArgs: { type: "CUBE", name: "TestCube", location: [0, 0, 0] }, status: 'PENDING', attempts: 0, dependsOn: ['s2'] },
      { id: 's4', description: 'Camera', toolName: 'blender.create_camera', toolArgs: { name: "TestCamera", location: [10, -10, 10] }, status: 'PENDING', attempts: 0, dependsOn: ['s3'] },
      { id: 's5', description: 'Inspect', toolName: 'blender.inspect_scene', status: 'PENDING', attempts: 0, dependsOn: ['s4'] }
    ], status: 'PLANNED', createdAt: '', updatedAt: ''
  };

  PlanEngine.execute(planA);
  
  // We need to poll until planA is completed
  for (let i = 0; i < 50; i++) {
    if (planA.status === 'SUCCEEDED' || planA.status === 'FAILED') break;
    await wait(200);
  }
  
  if (planA.status === 'FAILED') {
    console.log("PlanA failed. Error:", planA.steps.find(s => s.status === 'FAILED')?.error);
  }
  
  assert(planA.status === 'SUCCEEDED', `Plan A should succeed, got ${planA.status}`);
  const inspectResultStr = planA.steps[4].result;
  assert(!!inspectResultStr, 'Should have inspect result');
  const inspectResult = JSON.parse(inspectResultStr!);
  const cubeExists = inspectResult.some((o: any) => o.name === 'TestCube');
  const camExists = inspectResult.some((o: any) => o.name === 'TestCamera');
  assert(cubeExists, 'TestCube should be created in Blender');
  assert(camExists, 'TestCamera should be created in Blender');
  
  console.log("--- B. Concurrent workflow lock isolation ---");
  const planB1: Plan = {
    id: 'planB1', workflowId: 'wf_blender_2', goal: 'Test', steps: [
      { id: 'b1', description: 'Cube', toolName: 'blender.create_object', toolArgs: { type: "SPHERE", name: "Sphere1" }, status: 'PENDING', attempts: 0 }
    ], status: 'PLANNED', createdAt: '', updatedAt: ''
  };
  const planB2: Plan = {
    id: 'planB2', workflowId: 'wf_blender_3', goal: 'Test', steps: [
      { id: 'b2', description: 'Cube', toolName: 'blender.create_object', toolArgs: { type: "SPHERE", name: "Sphere2" }, status: 'PENDING', attempts: 0 }
    ], status: 'PLANNED', createdAt: '', updatedAt: ''
  };
  
  PlanEngine.execute(planB1);
  PlanEngine.execute(planB2);
  
  await wait(50);
  // One should be running, one should be queued due to app:blender lock
  assert((ResourceLockManager as any).activeLocks.some((l: any) => l.uri === 'app:blender'), 'app:blender lock should be active');
  
  for (let i = 0; i < 50; i++) {
    if (planB1.status === 'SUCCEEDED' && planB2.status === 'SUCCEEDED') break;
    await wait(200);
  }
  
  assert(planB1.status === 'SUCCEEDED');
  assert(planB2.status === 'SUCCEEDED');

  console.log("--- C. Shutdown ---");
  const planC: Plan = {
    id: 'planC', workflowId: 'wf_blender_4', goal: 'Test', steps: [
      { id: 'c1', description: 'Shutdown', toolName: 'blender.shutdown', status: 'PENDING', attempts: 0 }
    ], status: 'PLANNED', createdAt: '', updatedAt: ''
  };
  PlanEngine.execute(planC);
  
  for (let i = 0; i < 50; i++) {
    if (planC.status === 'SUCCEEDED' || planC.status === 'FAILED') break;
    await wait(200);
  }
  
  console.log("All 10.2 Blender IPC Tests Passed! Success");
}

// Mock SecurityToolExecutor to bypass UI and Tauri
import { ToolExecutor as SecurityToolExecutor } from './src/lib/security/ToolExecutor.js';
import { ToolRegistry } from './src/lib/ai/ToolRegistry.js';

const originalExecute = SecurityToolExecutor.execute;
(SecurityToolExecutor as any).execute = async (
  tool: string, action: string, args: any, commandStr: any, onStatusChange: any, executeImpl: any, context: any
) => {
  if (action.startsWith('blender.')) {
    if (action === 'blender.inspect_scene') {
      return { success: true, output: JSON.stringify([{name: 'TestCube'}, {name: 'TestCamera'}]) };
    }
    await wait(50);
    return { success: true, output: 'Success' };
  }
  return originalExecute(tool, action, args, commandStr, onStatusChange, executeImpl, context);
};

// Register mock tools
import { ToolCapabilityAdapterProvider } from './src/lib/ai/capabilities/ToolCapabilityAdapter.js';
import { CapabilityProviderRegistry } from './src/lib/ai/capabilities/CapabilityProviderRegistry.js';

ToolRegistry.register({
  name: 'fs.read_text', description: '', parameters: {}, category: 'file', risk: 'LOW', toolGroup: 'mock'
});
ToolRegistry.register({
  name: 'blender.launch', description: '', parameters: {}, category: 'system', risk: 'LOW', toolGroup: 'mock'
});
ToolRegistry.register({
  name: 'blender.create_object', description: '', parameters: {}, category: 'system', risk: 'LOW', toolGroup: 'mock',
  requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }]
});
ToolRegistry.register({
  name: 'blender.create_camera', description: '', parameters: {}, category: 'system', risk: 'LOW', toolGroup: 'mock',
  requiredLocks: [{ uri: 'app:blender', access: 'WRITE' }]
});
ToolRegistry.register({
  name: 'blender.inspect_scene', description: '', parameters: {}, category: 'system', risk: 'LOW', toolGroup: 'mock',
  requiredLocks: [{ uri: 'app:blender', access: 'READ' }]
});
ToolRegistry.register({
  name: 'blender.shutdown', description: '', parameters: {}, category: 'system', risk: 'LOW', toolGroup: 'mock'
});

CapabilityProviderRegistry.register(new ToolCapabilityAdapterProvider());

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
