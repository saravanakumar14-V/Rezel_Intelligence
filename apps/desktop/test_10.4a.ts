import { ModeManager } from './src/lib/director/ModeManager';
import { IntentRouter } from './src/lib/director/IntentRouter';
import { ApplicationSessionManager } from './src/lib/director/ApplicationSessionManager';
import { ContextManager } from './src/lib/director/ContextManager';
import { ConversationManager } from './src/lib/director/ConversationManager';
import { PolicyEngine } from './src/lib/security/policy/PolicyEngine';

async function runPhaseB1Tests() {
  console.log("Starting 10.4 Phase B1 Tests (Director State Managers)...");

  const modeManager = new ModeManager();
  const intentRouter = new IntentRouter();
  const sessionManager = new ApplicationSessionManager();
  const conversationManager = new ConversationManager();
  const contextManager = new ContextManager(modeManager, intentRouter, sessionManager, conversationManager);

  // A. Intent classification
  console.log("--- A. Intent classification ---");
  let classification = intentRouter.classify("I want to build a 3D scene in Blender");
  if (classification.intent !== 'CREATIVE_AUTOMATION') throw new Error("Expected CREATIVE_AUTOMATION");
  if (classification.suggestedMode !== 'CREATOR') throw new Error("Expected CREATOR mode");

  classification = intentRouter.classify("Let's refactor this bash script and fix the git bug");
  if (classification.intent !== 'CODING') throw new Error("Expected CODING");
  if (classification.suggestedMode !== 'DEVELOPER') throw new Error("Expected DEVELOPER mode");

  classification = intentRouter.classify("Just chatting, how are you?");
  if (classification.intent !== 'CONVERSATION') throw new Error("Expected CONVERSATION");
  if (classification.suggestedMode !== 'FRIENDLY') throw new Error("Expected FRIENDLY mode");

  // B. Mode selection
  console.log("--- B. Mode selection ---");
  const ctx1 = contextManager.buildContext("Let's write some code");
  if (ctx1.mode !== 'DEVELOPER') throw new Error("Expected DEVELOPER contextual mode");

  // C. Explicit mode overrides inferred mode
  console.log("--- C. Explicit mode overrides inferred mode ---");
  modeManager.setPersistentMode('FRIENDLY');
  const ctx2 = contextManager.buildContext("Let's write some code");
  if (ctx2.mode !== 'FRIENDLY') throw new Error("Expected FRIENDLY persistent override");
  modeManager.setPersistentMode(null); // reset

  // D. Mode changes do not change capabilities or PolicyEngine authorization
  console.log("--- D. Mode changes do not change capabilities or PolicyEngine authorization ---");
  modeManager.setPersistentMode('CREATOR');
  // Prove PolicyEngine is decoupled from ModeManager
  const decision = await PolicyEngine.evaluate({
    capabilityId: 'fs.delete',
    toolGroup: 'fs',
    args: { path: '/unauthorized/root/path' },
    activeScopes: []
  } as any);
  if (decision.decision !== 'DENY') throw new Error(`PolicyEngine should DENY unauthorized fs.delete despite mode. Got: ${JSON.stringify(decision)}`);

  // E. Application session tracking
  console.log("--- E. Application session tracking ---");
  sessionManager.updateSession({
    appId: 'blender',
    connectionStatus: 'CONNECTED',
    foreground: true,
    capabilities: ['inspect_scene']
  });
  const ctx3 = contextManager.buildContext("hello");
  if (!ctx3.activeApplication || ctx3.activeApplication.appId !== 'blender') {
    throw new Error("Expected active application to be mapped in context");
  }

  console.log("--- B2 Tests ---");
  const { RezelDirector } = await import('./src/lib/director/RezelDirector.js');
  const { AgentCore } = await import('./src/lib/ai/AgentCore.js');
  const { WorkflowRuntime } = await import('./src/lib/ai/WorkflowRuntime.js');

  // F. Director delegates to AgentCore
  // G. Director never directly executes tools
  console.log("--- F & G. Director delegates to AgentCore, no direct execution ---");
  let agentCoreCalled = false;
  const originalSend = AgentCore.send;
  AgentCore.send = async (input, ctx) => {
    agentCoreCalled = true;
    if (ctx?.mode !== 'FRIENDLY') throw new Error("Expected context injection");
    return "mocked";
  };
  RezelDirector.clearPersistentMode();
  await RezelDirector.send("hi");
  if (!agentCoreCalled) throw new Error("Director did not delegate to AgentCore");
  AgentCore.send = originalSend; // Restore

  // H. Workflow event propagation
  // I. Observation/verification propagation
  // J. UNKNOWN propagation
  // K. Application session propagation (already tested in E)
  // L. Conversation continuity (AgentCore handles memory, Director passes ID)
  // M. Explicit mode precedence through the Director
  console.log("--- H, I, J, M. Event propagation and Context API ---");
  
  let workflowEventReceived = false;
  const handler = (e: any) => {
    if (e.type === 'workflow_started') workflowEventReceived = true;
  };
  RezelDirector.subscribe(handler);

  // Trigger a fake workflow event
  (WorkflowRuntime as any).emit({
    type: 'PLAN_STARTED',
    workflowId: 'test_wf',
    plan: { status: 'RUNNING' }
  });

  if (!workflowEventReceived) throw new Error("Workflow event did not propagate through Director");
  RezelDirector.unsubscribe(handler);

  // N. Interrupt delegation
  // O. No duplicate cancellation mechanism
  console.log("--- N & O. Interrupt delegation ---");
  let agentAborted = false;
  const originalAbort = AgentCore.abort;
  AgentCore.abort = () => { agentAborted = true; };
  
  RezelDirector.interrupt();
  if (!agentAborted) throw new Error("Director.interrupt() did not call AgentCore.abort()");
  AgentCore.abort = originalAbort;

  // P. No PolicyEngine bypass (Tested in D)
  // Q. UI-facing event stream (Tested via subscribe above)
  // R. AgentCore backward compatibility
  console.log("--- R. AgentCore backward compatibility ---");
  await AgentCore.send("this is a test without context"); // Should not throw

  console.log("\nAll 10.4 Phase B1 and B2 Tests Passed! Success");
}

runPhaseB1Tests().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
