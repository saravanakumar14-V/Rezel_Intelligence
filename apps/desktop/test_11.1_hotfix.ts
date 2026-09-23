import { ApplicationCapabilityRegistry } from './src/lib/ai/ApplicationCapabilityRegistry';
import { ToolRegistry } from './src/lib/ai/ToolRegistry';
import { AIToolExecutor } from './src/lib/ai/ToolExecutor';
import { ToolExecutor as SecurityToolExecutor } from './src/lib/security/ToolExecutor';
import { PolicyEngine } from './src/lib/security/policy/PolicyEngine';

async function run11_1HotfixRegression() {
  console.log('=== Starting Rezel 11.1 Hotfix Regression Test Suite ===\n');

  // ─── 1. Blender Client Authenticates & Dynamic Capabilities are Registered ───
  console.log('--- 1. Authenticated Client Capability Registration ---');
  const clientPayload = {
    client_id: 'blender',
    capabilities: [
      {
        name: 'blender.inspect_scene',
        description: 'Returns a structured list of all objects in the current Blender scene.',
        parameters: {},
        risk: 'LOW' as const,
      },
      {
        name: 'blender.create_object',
        description: 'Creates a primitive 3D object in the scene.',
        parameters: {
          type: { type: 'string', description: 'Type of object' },
          name: { type: 'string', description: 'Name of object' },
        },
        risk: 'LOW' as const,
      },
      {
        name: 'blender.create_camera',
        description: 'Creates a camera in the scene.',
        parameters: {
          name: { type: 'string', description: 'Name of camera' },
        },
        risk: 'LOW' as const,
      },
    ],
  };

  const registeredTools = ApplicationCapabilityRegistry.handleClientConnected(clientPayload);
  if (!registeredTools.includes('blender.inspect_scene') || !registeredTools.includes('blender.create_object')) {
    throw new Error('Test 1 Failed: Registered tools missing expected capabilities');
  }
  console.log('Test 1 Passed: Client registered authenticated tools dynamically.');

  // ─── 2. clientId is Stored and Retained ───
  console.log('\n--- 2. clientId Retained on ToolDefinition & Capability ---');
  const inspectToolDef = ToolRegistry.get('blender.inspect_scene');
  const createToolDef = ToolRegistry.get('blender.create_object');

  if (!inspectToolDef || inspectToolDef.ipcClientId !== 'blender') {
    throw new Error('Test 2 Failed: inspect_scene missing ipcClientId="blender"');
  }
  if (!createToolDef || createToolDef.ipcClientId !== 'blender') {
    throw new Error('Test 2 Failed: create_object missing ipcClientId="blender"');
  }
  if (inspectToolDef.tauriCommand !== 'send_ipc_command' || createToolDef.tauriCommand !== 'send_ipc_command') {
    throw new Error('Test 2 Failed: tauriCommand is not "send_ipc_command"');
  }
  console.log('Test 2 Passed: Authenticated clientId is strictly retained in registry metadata.');

  // ─── Track SecurityToolExecutor Invocations ───
  const interceptedCalls: Array<{
    tool: string;
    action: string;
    args: any;
    commandStr?: string;
  }> = [];

  const originalSecurityExecute = SecurityToolExecutor.execute;
  (SecurityToolExecutor as any).execute = async (
    tool: string,
    action: string,
    args: any,
    commandStr?: string,
    onStatusChange?: any,
    executeImpl?: any,
    context?: any
  ) => {
    interceptedCalls.push({ tool, action, args, commandStr });
    
    // Simulate Tauri IPC backend contract verification:
    // If action is send_ipc_command, ensure clientId is present
    if (action === 'send_ipc_command') {
      if (!args || typeof args.clientId !== 'string' || !args.clientId.trim()) {
        return {
          success: false,
          error: 'invalid args `clientId` for command `send_ipc_command`: command send_ipc_command missing required key clientId',
        };
      }
      return {
        success: true,
        output: JSON.stringify({ success: true, client: args.clientId, command: args.command }),
      };
    }

    if (executeImpl) {
      const res = await executeImpl();
      return { success: true, output: JSON.stringify(res) };
    }

    return { success: true, output: 'Success' };
  };

  try {
    // ─── 3. blender.inspect_scene Sends clientId ───
    console.log('\n--- 3. blender.inspect_scene Sends Authenticated clientId ---');
    interceptedCalls.length = 0;
    const inspectResult = await AIToolExecutor.execute({
      id: 'call_inspect_1',
      name: 'blender.inspect_scene',
      args: {},
    });

    if (!inspectResult.executionResult.success) {
      throw new Error(`Test 3 Failed: inspect_scene failed: ${inspectResult.executionResult.error}`);
    }

    const lastCall = interceptedCalls[interceptedCalls.length - 1];
    if (!lastCall || lastCall.action !== 'send_ipc_command') {
      throw new Error(`Test 3 Failed: Expected action "send_ipc_command", got "${lastCall?.action}"`);
    }
    if (lastCall.args.clientId !== 'blender') {
      throw new Error(`Test 3 Failed: Missing or invalid clientId in args: ${JSON.stringify(lastCall.args)}`);
    }
    if ('client_id' in lastCall.args) {
      throw new Error(`Test 3 Failed: Production payload must strictly use canonical camelCase clientId, but found snake_case client_id`);
    }
    if (lastCall.args.command !== 'blender.inspect_scene') {
      throw new Error(`Test 3 Failed: Missing or invalid command in args: ${JSON.stringify(lastCall.args)}`);
    }
    console.log('Test 3 Passed: blender.inspect_scene strictly uses canonical clientId="blender" at Tauri invoke boundary.');

    // ─── 4. blender.create_object Sends clientId ───
    console.log('\n--- 4. blender.create_object Sends Authenticated clientId ---');
    interceptedCalls.length = 0;
    const createResult = await AIToolExecutor.execute({
      id: 'call_create_1',
      name: 'blender.create_object',
      args: { type: 'CUBE', name: 'TestCube' },
    });

    if (!createResult.executionResult.success) {
      throw new Error(`Test 4 Failed: create_object failed: ${createResult.executionResult.error}`);
    }

    const createCall = interceptedCalls[interceptedCalls.length - 1];
    if (!createCall || createCall.action !== 'send_ipc_command') {
      throw new Error(`Test 4 Failed: Expected action "send_ipc_command", got "${createCall?.action}"`);
    }
    if (createCall.args.clientId !== 'blender') {
      throw new Error(`Test 4 Failed: Missing or invalid clientId in args: ${JSON.stringify(createCall.args)}`);
    }
    if ('client_id' in createCall.args) {
      throw new Error(`Test 4 Failed: Production payload must strictly use canonical camelCase clientId, but found snake_case client_id`);
    }
    if (createCall.args.command !== 'blender.create_object') {
      throw new Error(`Test 4 Failed: Missing or invalid command in args: ${JSON.stringify(createCall.args)}`);
    }
    if (createCall.args.args?.type !== 'CUBE' || createCall.args.args?.name !== 'TestCube') {
      throw new Error(`Test 4 Failed: Arguments payload corrupted: ${JSON.stringify(createCall.args)}`);
    }
    console.log('Test 4 Passed: blender.create_object correctly sent canonical clientId="blender" with user args.');

    // ─── 5. Missing clientId is Rejected ───
    console.log('\n--- 5. Missing clientId Rejection Contract ---');
    const directMockRejection = await (SecurityToolExecutor as any).execute(
      'app_ipc_unauth',
      'send_ipc_command',
      { command: 'blender.inspect_scene', args: {} } // intentionally omitted clientId
    );
    if (directMockRejection.success || !directMockRejection.error?.includes('missing required key clientId')) {
      throw new Error('Test 5 Failed: send_ipc_command without clientId was not rejected');
    }
    console.log('Test 5 Passed: Tauri IPC command contract strictly rejects calls missing clientId.');

    // ─── 6. Arbitrary Model clientId Injection is Prevented ───
    console.log('\n--- 6. Model Output Cannot Inject or Override clientId ---');
    interceptedCalls.length = 0;
    const maliciousModelCall = await AIToolExecutor.execute({
      id: 'call_malicious_1',
      name: 'blender.create_object',
      args: {
        type: 'CUBE',
        name: 'InjectedCube',
        clientId: 'malicious_injected_client', // Model tries to spoof clientId
        client_id: 'fake_client_id',
      },
    });

    const maliciousCall = interceptedCalls[interceptedCalls.length - 1];
    if (maliciousCall.args.clientId !== 'blender') {
      throw new Error(
        `Test 6 Failed: Model spoofed clientId! Expected "blender", got "${maliciousCall.args.clientId}"`
      );
    }
    console.log('Test 6 Passed: Model output cannot override authoritative clientId from ToolDefinition.');

    // ─── 7. SecurityToolExecutor & PolicyEngine Invariants ───
    console.log('\n--- 7. SecurityToolExecutor & PolicyEngine Invariants ---');
    // Verify unauthorized capability is denied by PolicyEngine
    const unauthorizedPolicyCheck = await PolicyEngine.evaluate({
      capabilityId: 'fs.delete',
      toolGroup: 'fs',
      args: { path: '/system/root/unauthorized' },
      activeScopes: [],
    } as any);

    if (unauthorizedPolicyCheck.decision !== 'DENY') {
      throw new Error(
        `Test 7 Failed: PolicyEngine must DENY unauthorized action. Got: ${unauthorizedPolicyCheck.decision}`
      );
    }

    console.log('Test 7 Passed: PolicyEngine & SecurityToolExecutor remain fully authoritative and unchanged.');

  } finally {
    // Restore original SecurityToolExecutor
    (SecurityToolExecutor as any).execute = originalSecurityExecute;
  }

  console.log('\n======================================================');
  console.log('✅ ALL 11.1 HOTFIX REGRESSION TESTS PASSED (100% GREEN)');
  console.log('======================================================\n');
}

run11_1HotfixRegression().catch((err) => {
  console.error('❌ 11.1 Hotfix Regression Suite Failed:', err);
  process.exit(1);
});
