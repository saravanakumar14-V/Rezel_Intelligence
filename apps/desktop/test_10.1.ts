function assert(condition: boolean, message?: string) {
  if (!condition) throw new Error(`Assertion failed${message ? ': ' + message : ''}`);
}
import { PlanEngine } from './src/lib/ai/Planner.js';
import { Scheduler } from './src/lib/ai/scheduler/Scheduler.js';
import { ResourceLockManager } from './src/lib/ai/scheduler/ResourceLockManager.js';
import { planStateMachine } from './src/lib/ai/PlanStateMachine.js';
import { ToolRegistry } from './src/lib/ai/ToolRegistry.js';
import { CapabilityRegistry } from './src/lib/ai/capabilities/CapabilityRegistry.js';
import { AIToolExecutor } from './src/lib/ai/ToolExecutor.js';
import type { Plan } from './src/lib/ai/types.js';

// Mock execution state for tracking
let cooperativeStarted = false;
let cooperativeCompleted = false;
let uncooperativeStarted = false;
let uncooperativeCompleted = false;

// Register mock tools
const MOCK_COOPERATIVE_TOOL = 'mock.cooperative';
const MOCK_UNCOOPERATIVE_TOOL = 'mock.uncooperative';

CapabilityRegistry.register({
  id: MOCK_COOPERATIVE_TOOL,
  description: 'Mock cooperative',
  category: 'system',
  parameters: {},
  riskLevel: 'LOW',
  mutatesExternalState: true,
  isReversible: false,
  retryPolicy: 'NEVER',
  toolGroup: 'mock',
  validateScope: () => ({ allowed: true }),
  getRequiredLocks: async () => [{ uri: `fs:mock`, access: 'WRITE' }],
  execute: async (args: any, context: any) => {
    cooperativeStarted = true;
    if (context.signal?.aborted) throw new Error('Aborted');
    
    // Simulate long running with abort check
    for (let i = 0; i < 10; i++) {
      if (context.signal?.aborted) throw new Error('Aborted');
      await new Promise(r => setTimeout(r, 20));
    }
    
    cooperativeCompleted = true;
    return 'Success';
  }
});

CapabilityRegistry.register({
  id: MOCK_UNCOOPERATIVE_TOOL,
  description: 'Mock uncooperative',
  category: 'system',
  parameters: {},
  riskLevel: 'LOW',
  mutatesExternalState: true,
  isReversible: false,
  retryPolicy: 'NEVER',
  toolGroup: 'mock',
  validateScope: () => ({ allowed: true }),
  getRequiredLocks: async () => [{ uri: `fs:mock2`, access: 'WRITE' }],
  execute: async (args: any, context: any) => {
    uncooperativeStarted = true;
    
    // Simulate long running without abort check
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 20));
    }
    
    uncooperativeCompleted = true;
    return 'Success';
  }
});

ToolRegistry.register({
  name: MOCK_COOPERATIVE_TOOL, description: '', parameters: {}, category: 'system', risk: 'LOW', toolGroup: 'mock'
});
ToolRegistry.register({
  name: MOCK_UNCOOPERATIVE_TOOL, description: '', parameters: {}, category: 'system', risk: 'LOW', toolGroup: 'mock'
});

// Mock SecurityToolExecutor to bypass UI
import { ToolExecutor as SecurityToolExecutor } from './src/lib/security/ToolExecutor.js';
const originalExecute = SecurityToolExecutor.execute;
(SecurityToolExecutor as any).execute = async (
  tool: string, action: string, args: any, commandStr: any, onStatusChange: any, executeImpl: any, context: any
) => {
  if (action === MOCK_COOPERATIVE_TOOL || action === MOCK_UNCOOPERATIVE_TOOL) {
    try {
      const res = await executeImpl();
      return { success: true, output: res };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
  return originalExecute(tool, action, args, commandStr, onStatusChange, executeImpl, context);
};

// Helper wait
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

async function runTests() {
  console.log("Starting 10.1 Cooperative Cancellation Tests...");

  // Test A & B: Cancel before execution & while waiting for lock
  console.log("--- A & B: Cancel before execute / waiting for lock ---");
  const planA: Plan = {
    id: 'planA', workflowId: 'wfA', goal: 'Test', steps: [
      { id: 'a1', description: 's1', toolName: MOCK_UNCOOPERATIVE_TOOL, status: 'PENDING', attempts: 0 },
      { id: 'a2', description: 's2', toolName: MOCK_UNCOOPERATIVE_TOOL, status: 'PENDING', attempts: 0 }
    ], status: 'PLANNED', createdAt: '', updatedAt: ''
  };
  
  uncooperativeStarted = false;
  PlanEngine.execute(planA);
  
  // Wait a tiny bit so a1 acquires lock and a2 queues for lock
  await wait(10);
  
  PlanEngine.cancel(planA);
  await wait(500); // wait for a1 to finish
  
  console.log('Locks:', (ResourceLockManager as any).activeLocks);
  console.log('Uncooperative completed:', uncooperativeCompleted);

  assert(planA.status === 'CANCELLED', 'Plan should be cancelled');
  assert(uncooperativeStarted === true, 'a1 should have started');
  assert(planA.steps[1].status === 'CANCELLED', 'a2 should be cancelled');
  // a2 should never start because it was in waitQueue when cancelled, or queued.
  assert((ResourceLockManager as any).activeLocks.length === 0, 'Locks should be released eventually');
  assert((ResourceLockManager as any).waitQueue.length === 0, 'Waiters should be removed');

  // Test C: Cooperative capability receives AbortSignal
  console.log("--- C: Cooperative capability receives AbortSignal ---");
  cooperativeStarted = false;
  cooperativeCompleted = false;
  
  const planC: Plan = {
    id: 'planC', workflowId: 'wfC', goal: 'Test', steps: [
      { id: 'c1', description: 's1', toolName: MOCK_COOPERATIVE_TOOL, status: 'PENDING', attempts: 0 }
    ], status: 'PLANNED', createdAt: '', updatedAt: ''
  };
  
  PlanEngine.execute(planC);
  await wait(30); // Let it start
  PlanEngine.cancel(planC);
  await wait(50); // Wait for abort to throw
  
  assert(planC.status === 'CANCELLED');
  assert(cooperativeStarted === true, 'Should have started');
  assert(cooperativeCompleted === false, 'Should have thrown before completing');
  assert((ResourceLockManager as any).activeLocks.length === 0, 'Locks released after abort');

  // Test D & E & F & G: Non-cooperative, locks remain held, UNKNOWN preserved
  console.log("--- D, E, F, G: Non-cooperative execution, Lock held, UNKNOWN preserved ---");
  uncooperativeStarted = false;
  uncooperativeCompleted = false;
  
  const planD: Plan = {
    id: 'planD', workflowId: 'wfD', goal: 'Test', steps: [
      { id: 'd1', description: 's1', toolName: MOCK_UNCOOPERATIVE_TOOL, status: 'PENDING', attempts: 0 }
    ], status: 'PLANNED', createdAt: '', updatedAt: ''
  };
  
  PlanEngine.execute(planD);
  await wait(30); // Let it start
  PlanEngine.cancel(planD);
  
  // IMMEDIATELY CHECK LOCKS - they should still be held!
  assert((ResourceLockManager as any).activeLocks.length > 0, 'Locks MUST NOT be force-released on cancellation');
  
  await wait(500); // wait for uncooperative to finish
  assert(uncooperativeCompleted === true, 'Uncooperative should have completed in background');
  
  // Now locks should be gone
  assert((ResourceLockManager as any).activeLocks.length === 0, 'Locks should be released AFTER execution settles');
  assert(planD.steps[0].executionOutcome === 'UNKNOWN', 'Orphaned mutation must preserve UNKNOWN outcome');

  console.log("All 10.1 Cooperative Cancellation Tests Passed! Success");
}

runTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
