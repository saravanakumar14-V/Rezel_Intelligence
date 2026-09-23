import { PlanValidator } from './src/lib/ai/PlanValidator.js';
import { planStateMachine } from './src/lib/ai/PlanStateMachine.js';
import { WorkflowRuntime } from './src/lib/ai/WorkflowRuntime.js';
import { ToolRegistry } from './src/lib/ai/ToolRegistry.js';
import { AIToolExecutor } from './src/lib/ai/ToolExecutor.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log("Starting 9.4 Asynchronous Workflow Runtime Tests...");

  const tool1 = {
    name: 'mock_async_tool',
    description: 'Async tool',
    parameters: {},
    category: 'system',
    risk: 'LOW',
    toolGroup: 'system',
    mutatesExternalState: false,
    retryPolicy: 'AUTO'
  };
  ToolRegistry.register(tool1 as any);

  const tool2 = {
    name: 'mock_mutate_tool',
    description: 'Mutating tool',
    parameters: {},
    category: 'system',
    risk: 'HIGH',
    toolGroup: 'system',
    mutatesExternalState: true,
    retryPolicy: 'NEVER'
  };
  ToolRegistry.register(tool2 as any);

  const { CapabilityRegistry } = await import('./src/lib/ai/capabilities/CapabilityRegistry.js');
  const { LegacyToolCapability } = await import('./src/lib/ai/capabilities/ToolCapabilityAdapter.js');
  CapabilityRegistry.register(new LegacyToolCapability(tool1 as any));
  CapabilityRegistry.register(new LegacyToolCapability(tool2 as any));

  const { ToolExecutor: SecurityToolExecutor } = await import('./src/lib/security/ToolExecutor.js');
  const originalExecute = SecurityToolExecutor.execute;
  let mockExecuteImpl: any = null;
  (SecurityToolExecutor as any).execute = async (tool: string, action: string, args: any, commandStr: any, onStatusChange: any, executeImpl: any, context: any) => {
    if (mockExecuteImpl) {
        // mockExecuteImpl previously returned { toolResult: { success, output } }.
        // SecurityToolExecutor.execute returns { success, output, error }
        const res = await mockExecuteImpl(null, { onStatusChange });
        return { success: res.toolResult.success, output: res.toolResult.output, error: res.toolResult.error };
    }
    return originalExecute(tool, action, args, commandStr, onStatusChange, executeImpl, context);
  };

  const events: any[] = [];
  WorkflowRuntime.addEventHandler((e) => events.push(e));
  const clearEvents = () => events.splice(0, events.length);

  try {
    // ----------------------------------------------------
    // Test A & B: start() returns immediately with unique workflowId
    console.log("--- Test A & B: start() returns immediately ---");
    mockExecuteImpl = async () => {
      await new Promise(r => setTimeout(r, 200));
      return { toolResult: { success: true, output: "Success" } };
    };
    
    const planA = PlanValidator.validate({
      goal: "Test A",
      steps: [{ toolName: "mock_async_tool", description: "Async" }]
    });
    
    const startObj = WorkflowRuntime.start(planA);
    assert(!!startObj.id, "startObj must have an ID");
    assert(startObj.id.startsWith("wf_"), "workflowId must start with wf_");
    assert(startObj.status === 'RUNNING' || startObj.status === 'PLANNED', "Status is valid");
    assert(planA.workflowId === startObj.id, "Plan got workflowId injected");
    
    // ----------------------------------------------------
    // Test I: workflowId present in events
    console.log("--- Test I: events contain workflowId ---");
    await new Promise(r => setTimeout(r, 1000)); // wait for background completion
    assert(events.length > 0, "Events were emitted");
    assert(events.every(e => e.workflowId === startObj.id), "All events must have workflowId");
    if (startObj.plan.status !== 'SUCCEEDED') {
       console.log("Plan A fail reason:", startObj.plan.steps[0]?.failureReason, startObj.plan.steps[0]?.status, startObj.plan.steps[0]?.executionOutcome);
       console.log("Plan A fail output:", startObj.plan.steps[0]?.output);
    }
    assert(startObj.plan.status === 'SUCCEEDED', "Plan eventually succeeded");

    // ----------------------------------------------------
    // Test C & E: background errors are caught
    console.log("--- Test C & E: background errors are caught ---");
    mockExecuteImpl = async () => {
      throw new Error("Crashing in background");
    };
    
    const planE = PlanValidator.validate({ goal: "Test E", steps: [{ toolName: "mock_mutate_tool", description: "Error" }] });
    const wfE = WorkflowRuntime.start(planE);
    
    await new Promise(r => setTimeout(r, 200));
    assert(wfE.status === 'FAILED' || wfE.plan.status === 'FAILED', "Workflow should be caught and marked FAILED");

    // ----------------------------------------------------
    // Test F, G, M: Cancellation logic
    console.log("--- Test F & G: Cancellation works and yields UNKNOWN ---");
    mockExecuteImpl = async () => {
      await new Promise(r => setTimeout(r, 300));
      return { toolResult: { success: true, output: "Success" } };
    };
    
    const planF = PlanValidator.validate({ goal: "Test F", steps: [{ toolName: "mock_mutate_tool", description: "Cancel Me" }] });
    const wfF = WorkflowRuntime.start(planF);
    
    // let it start step
    await new Promise(r => setTimeout(r, 50));
    WorkflowRuntime.cancel(wfF.id);
    
    await new Promise(r => setTimeout(r, 50));
    assert(wfF.plan.status === 'CANCELLED', "Workflow plan should be cancelled");
    assert(wfF.plan.steps[0].status === 'CANCELLED', "Running step should be cancelled");
    assert(wfF.plan.steps[0].executionOutcome === 'UNKNOWN', "Cancelled running mutation should be UNKNOWN");

    // ----------------------------------------------------
    // Test J: Multiple isolated workflows
    console.log("--- Test J: Isolated workflows ---");
    mockExecuteImpl = async () => {
      await new Promise(r => setTimeout(r, 100));
      return { toolResult: { success: true, output: "Success" } };
    };
    
    const planJ1 = PlanValidator.validate({ goal: "Test J1", steps: [{ toolName: "mock_async_tool", description: "J1" }] });
    const planJ2 = PlanValidator.validate({ goal: "Test J2", steps: [{ toolName: "mock_async_tool", description: "J2" }] });
    
    const wfJ1 = WorkflowRuntime.start(planJ1);
    const wfJ2 = WorkflowRuntime.start(planJ2);
    
    assert(wfJ1.id !== wfJ2.id, "Must be unique");
    await new Promise(r => setTimeout(r, 2000));
    console.log("J1 status:", wfJ1.plan.status, wfJ1.plan.steps[0].status, "J2 status:", wfJ2.plan.status, wfJ2.plan.steps[0].status);
    assert(wfJ1.plan.status === 'SUCCEEDED' && wfJ2.plan.status === 'SUCCEEDED', "Both succeed isolated");

    // ----------------------------------------------------
    // Test K & L: Bounded history + active workflows not evicted
    console.log("--- Test K & L: Bounded history ---");
    
    for (let i = 0; i < 55; i++) {
      const p = PlanValidator.validate({ goal: "History " + i, steps: [{ toolName: "mock_async_tool", description: "history" }] });
      WorkflowRuntime.start(p);
    }
    await new Promise(r => setTimeout(r, 1000));
    const recent = WorkflowRuntime.listRecent();
    assert(recent.length <= 50, `Recent workflows should be bounded to 50, but got ${recent.length}`);
    
    // Start a long running active workflow
    mockExecuteImpl = async (call: any, options: any) => {
      if (options?.onStatusChange) {
         // this means it's called by SecurityToolExecutor wrapper
         // which doesn't pass the description directly, but we can just use a flag
      }
      return { toolResult: { success: true, output: "Success" } };
    };
    
    // Better way: use a flag
    let wfActive: any;
    let activeShouldHang = true;
    (SecurityToolExecutor as any).execute = async (tool: string, action: string, args: any, commandStr: any, onStatusChange: any, executeImpl: any, context: any) => {
      if (wfActive && context?.workflowId === wfActive.id) {
         await new Promise(r => setTimeout(r, 5000));
         return { success: true, output: "Success" };
      } else if (mockExecuteImpl) {
         const res = await mockExecuteImpl(null, { onStatusChange });
         return { success: res.toolResult.success, output: res.toolResult.output, error: res.toolResult.error };
      }
      return originalExecute(tool, action, args, commandStr, onStatusChange, executeImpl, context);
    };

    const activeP = PlanValidator.validate({ goal: "Active", steps: [{ toolName: "mock_async_tool", description: "active" }] });
    wfActive = WorkflowRuntime.start(activeP);
    
    // Flood history again
    mockExecuteImpl = async () => {
      return { toolResult: { success: true, output: "Success" } };
    };
    for (let i = 0; i < 20; i++) {
      const p = PlanValidator.validate({ goal: "Flood " + i, steps: [{ toolName: "mock_async_tool", description: "flood" }] });
      WorkflowRuntime.start(p);
    }
    await new Promise(r => setTimeout(r, 1000));
    
    const active = WorkflowRuntime.listActive();
    assert(active.some(w => w.id === wfActive.id), "Active workflow must NOT be evicted by history bounded limit");

    // ----------------------------------------------------
    // Test H, O: WAITING_FOR_USER propagates and pauses properly
    console.log("--- Test H & O: WAITING_FOR_USER propagates ---");
    clearEvents();
    mockExecuteImpl = async (call: any, options: any) => {
      options?.onStatusChange?.('WAITING_FOR_USER');
      await new Promise(r => setTimeout(r, 100));
      options?.onStatusChange?.('RUNNING');
      return { toolResult: { success: true, output: "Success" } };
    };
    const planO = PlanValidator.validate({ goal: "Test O", steps: [{ toolName: "mock_async_tool", description: "O" }] });
    const wfO = WorkflowRuntime.start(planO);
    await new Promise(r => setTimeout(r, 200));
    assert(events.some(e => e.type === 'STEP_WAITING'), "STEP_WAITING should be emitted with workflowId");
    assert(wfO.plan.status === 'SUCCEEDED', "Ultimately succeeds");
    
    // ----------------------------------------------------
    // Test N: 9.3A Timeout yielding UNKNOWN + no retry
    console.log("--- Test N: 9.3A Mutation Timeout yielding UNKNOWN ---");
    mockExecuteImpl = async () => {
      throw new Error("Step execution timed out");
    };
    const planN = PlanValidator.validate({ goal: "Test N", steps: [{ toolName: "mock_mutate_tool", description: "Timeout" }] });
    const wfN = WorkflowRuntime.start(planN);
    await new Promise(r => setTimeout(r, 100));
    assert(wfN.plan.status === 'FAILED', "Plan N failed");
    assert(wfN.plan.steps[0].failureReason === 'TIMEOUT', "Reason is TIMEOUT");
    assert(wfN.plan.steps[0].executionOutcome === 'UNKNOWN', "Outcome is UNKNOWN");
    assert(wfN.plan.steps[0].attempts === 1, "Attempts == 1 (No retry)");

    console.log("All 9.4 tests passed successfully!");
  } finally {
    AIToolExecutor.execute = originalExecute;
  }
}

runTests().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
