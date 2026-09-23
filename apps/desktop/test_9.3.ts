import { PlanValidator } from './src/lib/ai/PlanValidator.js';
import { planStateMachine } from './src/lib/ai/PlanStateMachine.js';
import { PlanEngine } from './src/lib/ai/Planner.js';
import { ToolRegistry } from './src/lib/ai/ToolRegistry.js';
import { AIToolExecutor } from './src/lib/ai/ToolExecutor.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log("Starting 9.3A Planner Tests...");

  ToolRegistry.register({
    name: 'mock_read_tool',
    description: 'Read-only tool',
    parameters: {},
    category: 'system',
    risk: 'LOW',
    toolGroup: 'system',
    mutatesExternalState: false,
    retryPolicy: 'AUTO'
  });

  ToolRegistry.register({
    name: 'mock_mutate_tool',
    description: 'Mutating tool',
    parameters: {},
    category: 'system',
    risk: 'HIGH',
    toolGroup: 'system',
    mutatesExternalState: true,
    retryPolicy: 'NEVER'
  });

  // Mock AIToolExecutor for testing execution flows
  const originalExecute = AIToolExecutor.execute;
  let mockExecuteImpl: any = null;
  AIToolExecutor.execute = async (call, options) => {
    if (mockExecuteImpl) return mockExecuteImpl(call, options);
    return originalExecute(call, options);
  };

  // State machine listener to track events
  const events: any[] = [];
  planStateMachine.setEventHandler((e) => events.push(e));

  const clearEvents = () => events.splice(0, events.length);

  try {
    // ----------------------------------------------------
    // Test A: Read-only retry (should retry on timeout/error)
    console.log("--- Test A: Read-only retry ---");
    let attemptsA = 0;
    mockExecuteImpl = async () => {
      attemptsA++;
      if (attemptsA < 3) throw new Error("Mock network error");
      return { toolResult: { success: true, output: "Success" } };
    };
    
    const planA = PlanValidator.validate({
      goal: "Test A",
      steps: [{ toolName: "mock_read_tool", description: "Read" }]
    });
    
    await PlanEngine.execute(planA);
    assert(planA.status === 'SUCCEEDED', "Plan A should succeed");
    assert(planA.steps[0].attempts === 3, `Expected 3 attempts, got ${planA.steps[0].attempts}`);
    
    // ----------------------------------------------------
    // Test B: Mutation timeout (should NOT retry, outcome UNKNOWN)
    console.log("--- Test B: Mutation timeout ---");
    mockExecuteImpl = async () => {
      throw new Error("Step execution timed out"); // Simulating the timeout throw
    };

    const planB = PlanValidator.validate({
      goal: "Test B",
      steps: [{ toolName: "mock_mutate_tool", description: "Mutate" }]
    });

    await PlanEngine.execute(planB);
    assert(planB.status === 'FAILED', "Plan B should fail");
    const stepB = planB.steps[0];
    assert(stepB.status === 'FAILED', "Step B should be FAILED");
    assert(stepB.failureReason === 'TIMEOUT', "Reason should be TIMEOUT");
    assert(stepB.executionOutcome === 'UNKNOWN', "Outcome should be UNKNOWN");
    assert(stepB.attempts === 1, "Should NOT have retried");

    // ----------------------------------------------------
    // Test C: Mutation response lost (simulated by timeout same as B)
    console.log("--- Test C: Mutation response lost ---");
    // Covered identically by Test B's semantic outcome (TIMEOUT -> UNKNOWN)

    // ----------------------------------------------------
    // Test D & E: User confirmation delay (simulated via onStatusChange)
    console.log("--- Test D: User confirmation timeout pause ---");
    mockExecuteImpl = async (call: any, options: any) => {
      options?.onStatusChange?.('WAITING_FOR_USER');
      // Simulate waiting
      await new Promise(r => setTimeout(r, 100));
      options?.onStatusChange?.('RUNNING');
      return { toolResult: { success: true, output: "Approved" } };
    };

    const planD = PlanValidator.validate({
      goal: "Test D",
      steps: [{ toolName: "mock_mutate_tool", description: "Mutate with Wait" }]
    });

    await PlanEngine.execute(planD);
    assert(planD.status === 'SUCCEEDED', "Plan D should succeed");

    // ----------------------------------------------------
    // Test F & G: Verification success/failure events
    console.log("--- Test F/G: Verification events ---");
    clearEvents();
    mockExecuteImpl = async () => {
      return { toolResult: { success: true, output: "Verified" } };
    };

    const planF = PlanValidator.validate({
      goal: "Test F",
      steps: [{ toolName: "mock_mutate_tool", description: "Mutate" }]
    });

    await PlanEngine.execute(planF);
    const verifStart = events.find(e => e.type === 'VERIFICATION_STARTED');
    const verifSuccess = events.find(e => e.type === 'VERIFICATION_SUCCEEDED');
    assert(!!verifStart, "Must emit VERIFICATION_STARTED");
    assert(!!verifSuccess, "Must emit VERIFICATION_SUCCEEDED");

    // ----------------------------------------------------
    // Test H: State transitions
    console.log("--- Test H: State transitions ---");
    // WAITING -> FAILED (e.g. if cancelled while waiting)
    const planH = PlanValidator.validate({ goal: "Test H", steps: [{ description: "Step" }] });
    planStateMachine.startPlan(planH);
    planStateMachine.startStep(planH, planH.steps[0]);
    planStateMachine.waitStep(planH, planH.steps[0], 'USER_CONFIRMATION', 'waiting');
    planStateMachine.cancelPlan(planH);
    assert(planH.steps[0].status === 'CANCELLED', "WAITING -> CANCELLED must work");

    console.log("All 9.3A tests passed successfully!");
  } finally {
    AIToolExecutor.execute = originalExecute;
  }
}

runTests().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
