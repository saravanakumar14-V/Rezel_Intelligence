function assert(condition: boolean, message?: string) {
  if (!condition) throw new Error(`Assertion failed${message ? ': ' + message : ''}`);
}
import { AgentCore } from './src/lib/ai/AgentCore.js';
import { ToolRegistry } from './src/lib/ai/ToolRegistry.js';
import { CapabilityRegistry } from './src/lib/ai/capabilities/CapabilityRegistry.js';
import { AIToolExecutor } from './src/lib/ai/ToolExecutor.js';

// Mock SecurityToolExecutor to bypass UI and Tauri
import { ToolExecutor as SecurityToolExecutor } from './src/lib/security/ToolExecutor.js';

const originalExecute = SecurityToolExecutor.execute;
(SecurityToolExecutor as any).execute = async (
  tool: string, action: string, args: any, commandStr: any, onStatusChange: any, executeImpl: any, context: any
) => {
  if (action === 'blender.launch') return { success: true, output: 'Blender launched' };
  if (action === 'dynamic.ipc_tool') return { success: true, output: 'Dynamic IPC executed' };
  if (action === 'legacy.tool') return { success: true, output: 'Legacy executed' };
  if (executeImpl) {
    return { success: true, output: await executeImpl() };
  }
  return originalExecute(tool, action, args, commandStr, onStatusChange, executeImpl, context);
};

async function runTests() {
  console.log("Starting 10.2 Phase C Regression Tests...");

  await AgentCore.init();

  // Test 1: Legacy tool in ToolRegistry still works
  ToolRegistry.register({
    name: 'legacy.tool', description: 'legacy', parameters: {}, category: 'system', risk: 'LOW', toolGroup: 'mock'
  });
  
  let res = await AIToolExecutor.execute({ id: '1', name: 'legacy.tool', args: {} });
  assert(res.executionResult.success, "Legacy tool should execute");
  assert(res.executionResult.output === 'Legacy executed', "Legacy tool output mismatch");

  // Test 2: Modern capability executes correctly without being in ToolRegistry
  // (blender.launch is already in CapabilityProviderRegistry via AgentCore.init)
  assert(!ToolRegistry.has('blender.launch'), "blender.launch should NOT be in ToolRegistry");
  assert(CapabilityRegistry.has('blender.launch'), "blender.launch should be in CapabilityRegistry");
  
  res = await AIToolExecutor.execute({ id: '2', name: 'blender.launch', args: {} });
  assert(res.executionResult.success, "Modern capability should execute");
  assert(res.executionResult.output === 'Blender launched' || res.executionResult.output === 'Success', "Modern capability output mismatch: " + res.executionResult.output);

  // Test 3: Dynamic IPC capability becomes visible to Gemini and executes correctly
  const { ApplicationCapabilityRegistry } = await import('./src/lib/ai/ApplicationCapabilityRegistry.js');
  
  // Simulate an IPC connection event
  import('@tauri-apps/api/event').then(({ emit }) => {
    emit('ipc://client_connected', {
      client_id: 'dynamic_app',
      capabilities: [{ name: 'dynamic.ipc_tool', description: 'Dynamic', parameters: {} }]
    });
  });

  // Wait for async event handler
  await new Promise(r => setTimeout(r, 100));

  assert(ToolRegistry.has('dynamic.ipc_tool'), "Dynamic tool should be in ToolRegistry");
  assert(CapabilityRegistry.has('dynamic.ipc_tool'), "Dynamic tool should ALSO be in CapabilityRegistry");
  
  res = await AIToolExecutor.execute({ id: '3', name: 'dynamic.ipc_tool', args: {} });
  assert(res.executionResult.success, "Dynamic IPC tool should execute");

  // Verify it's visible to Gemini
  const allCaps = CapabilityRegistry.getAll();
  assert(allCaps.some(c => c.id === 'dynamic.ipc_tool'), "Gemini should see dynamic tool");

  console.log("All 10.2 Phase C Registry Tests Passed! Success");
}

runTests().then(() => process.exit(0)).catch(e => { console.error("Test failed:", e); process.exit(1); });
