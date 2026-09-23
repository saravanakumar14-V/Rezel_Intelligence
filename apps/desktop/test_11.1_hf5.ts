import { DeterministicDevelopmentProvider } from './src/lib/reasoning/providers/DeterministicDevelopmentProvider';
import { VerificationEngine } from './src/lib/ai/verification/VerificationEngine';
import { PolicyEngine } from './src/lib/security/policy/PolicyEngine';
import { ToolRegistry, BUILT_IN_TOOLS } from './src/lib/ai/ToolRegistry';
import { ApplicationCapabilityRegistry } from './src/lib/ai/ApplicationCapabilityRegistry';
import { AIToolExecutor } from './src/lib/ai/ToolExecutor';
import { ToolExecutor as SecurityToolExecutor } from './src/lib/security/ToolExecutor';

async function run11_1HF5TestSuite() {
  console.log('=== Starting Rezel 11.1-HF5 Deterministic Real Blender Mutation Verification Test Suite ===\n');

  ToolRegistry.registerMany(BUILT_IN_TOOLS);

  // ─── A & B. Unique Sentinel Object Actions Generated ───
  console.log('--- A & B. Unique Sentinel Actions Generated ---');
  const provider = new DeterministicDevelopmentProvider();
  const goal = 'Open Blender and create a cube named Rezel_Test_Cube_001 and a camera named Rezel_Test_Camera_001, then inspect the scene and verify both exist.';
  
  const reasoningRes = await provider.reason({
    goal,
    context: {
      projectSnapshot: null,
      conversationSummary: { messageCount: 1, recentMessages: [{ role: 'user', content: goal }] },
      applicationContext: null,
      availableCapabilities: [],
      currentCycle: 1,
      remainingBudget: { cycles: 3, tokens: 100000 },
    },
  });

  if (!reasoningRes.structured || reasoningRes.structured.status !== 'ACTIONS') {
    throw new Error('Test A/B Failed: Structured actions missing in reasoning response');
  }

  const actions = reasoningRes.structured.actions;
  const cubeAction = actions.find((a) => a.capabilityId === 'blender.create_object');
  const cameraAction = actions.find((a) => a.capabilityId === 'blender.create_camera');

  if (!cubeAction || cubeAction.args.name !== 'Rezel_Test_Cube_001') {
    throw new Error(`Test A Failed: Expected cube name "Rezel_Test_Cube_001", got ${cubeAction?.args.name}`);
  }
  console.log('Test A Passed: Unique cube action generated with exact name Rezel_Test_Cube_001.');

  if (!cameraAction || cameraAction.args.name !== 'Rezel_Test_Camera_001') {
    throw new Error(`Test B Failed: Expected camera name "Rezel_Test_Camera_001", got ${cameraAction?.args.name}`);
  }
  console.log('Test B Passed: Unique camera action generated with exact name Rezel_Test_Camera_001.');

  // ─── C. Verification Predicates Target Exact Names ───
  console.log('\n--- C. Verification Predicates Target Exact Names ---');
  const predicates = reasoningRes.structured.verificationPredicates || [];
  if (predicates.length < 2) {
    throw new Error('Test C Failed: Expected at least 2 verification predicates');
  }

  const cubePredicate = predicates.find((p) => p.entityName === 'Rezel_Test_Cube_001');
  const camPredicate = predicates.find((p) => p.entityName === 'Rezel_Test_Camera_001');

  if (!cubePredicate || cubePredicate.value !== 'Rezel_Test_Cube_001') {
    throw new Error('Test C Failed: Cube predicate does not target Rezel_Test_Cube_001');
  }
  if (!camPredicate || camPredicate.value !== 'Rezel_Test_Camera_001') {
    throw new Error('Test C Failed: Camera predicate does not target Rezel_Test_Camera_001');
  }
  console.log('Test C Passed: Verification predicates explicitly require Rezel_Test_Cube_001 and Rezel_Test_Camera_001.');

  // ─── D & E. Default Objects Do NOT Satisfy Predicate ───
  console.log('\n--- D & E. Default Scene Objects Do NOT Satisfy Sentinels ---');
  // Scenario 1: Initial scene with ONLY default objects
  const defaultInitialSceneObservation: import('./src/lib/ai/verification/types').NormalizedObservation = {
    appId: 'blender',
    timestamp: Date.now(),
    status: 'READY',
    entities: [
      { id: '1', name: 'Cube', type: 'MESH', properties: { name: 'Cube' } },
      { id: '2', name: 'Camera', type: 'CAMERA', properties: { name: 'Camera' } },
      { id: '3', name: 'Light', type: 'LIGHT', properties: { name: 'Light' } },
    ],
    metadata: {},
    sourceCapability: 'blender.inspect_scene',
  };

  const defaultCubeResult = VerificationEngine.verify(defaultInitialSceneObservation, cubePredicate!);
  const defaultCamResult = VerificationEngine.verify(defaultInitialSceneObservation, camPredicate!);

  if (defaultCubeResult === 'VERIFIED') {
    throw new Error('Test D Failed: Default "Cube" falsely satisfied Rezel_Test_Cube_001 predicate');
  }
  console.log('Test D Passed: Default Cube is rejected; does NOT satisfy Rezel_Test_Cube_001.');

  if (defaultCamResult === 'VERIFIED') {
    throw new Error('Test E Failed: Default "Camera" falsely satisfied Rezel_Test_Camera_001 predicate');
  }
  console.log('Test E Passed: Default Camera is rejected; does NOT satisfy Rezel_Test_Camera_001.');

  // ─── F. Unique Sentinel Objects Satisfy Verification ───
  console.log('\n--- F. Mutated Scene with Sentinel Objects Passes Verification ---');
  // Scenario 2: Scene after Rezel creation (contains default objects PLUS sentinel objects)
  const mutatedSceneObservation: import('./src/lib/ai/verification/types').NormalizedObservation = {
    appId: 'blender',
    timestamp: Date.now(),
    status: 'READY',
    entities: [
      { id: '1', name: 'Cube', type: 'MESH', properties: { name: 'Cube' } },
      { id: '2', name: 'Camera', type: 'CAMERA', properties: { name: 'Camera' } },
      { id: '3', name: 'Light', type: 'LIGHT', properties: { name: 'Light' } },
      { id: '4', name: 'Rezel_Test_Cube_001', type: 'MESH', properties: { name: 'Rezel_Test_Cube_001' } },
      { id: '5', name: 'Rezel_Test_Camera_001', type: 'CAMERA', properties: { name: 'Rezel_Test_Camera_001' } },
    ],
    metadata: {},
    sourceCapability: 'blender.inspect_scene',
  };

  const sentinelCubeResult = VerificationEngine.verify(mutatedSceneObservation, cubePredicate!);
  const sentinelCamResult = VerificationEngine.verify(mutatedSceneObservation, camPredicate!);

  if (sentinelCubeResult !== 'VERIFIED') {
    throw new Error(`Test F Failed: Rezel_Test_Cube_001 verification failed: ${sentinelCubeResult}`);
  }
  if (sentinelCamResult !== 'VERIFIED') {
    throw new Error(`Test F Failed: Rezel_Test_Camera_001 verification failed: ${sentinelCamResult}`);
  }
  console.log('Test F Passed: Unique sentinel objects VERIFIED without deleting existing scene objects.');

  // ─── G. No Direct Provider Execution Invariant ───
  console.log('\n--- G. No Direct Provider Execution Invariant ---');
  if (typeof (provider as any).execute === 'function' || typeof (provider as any).callTauri === 'function') {
    throw new Error('Test G Failed: Provider must not contain direct execution methods');
  }
  console.log('Test G Passed: Deterministic provider is strictly non-executing.');

  // ─── H. PolicyEngine Security Invariant ───
  console.log('\n--- H. PolicyEngine Security Invariant ---');
  const policyCheck = await PolicyEngine.evaluate({
    capabilityId: 'blender.create_object',
    toolGroup: 'blender',
    args: { type: 'CUBE', name: 'Rezel_Test_Cube_001' },
    activeScopes: [],
  } as any);

  if (!policyCheck || !policyCheck.decision) {
    throw new Error('Test H Failed: PolicyEngine evaluation failed');
  }
  console.log('Test H Passed: PolicyEngine evaluated action independently.');

  // ─── I. ClientId Contract Invariant ───
  console.log('\n--- I. ClientId Contract Invariant ---');
  ApplicationCapabilityRegistry.handleClientConnected({
    client_id: 'blender',
    capabilities: [
      { name: 'blender.create_object', description: '', parameters: {}, risk: 'LOW' },
    ],
  });

  const interceptedCalls: any[] = [];
  const originalSecurityExecute = SecurityToolExecutor.execute;

  (SecurityToolExecutor as any).execute = async (
    tool: string,
    action: string,
    args: any
  ) => {
    interceptedCalls.push({ tool, action, args });
    return { success: true, output: JSON.stringify({ success: true, name: 'Rezel_Test_Cube_001' }) };
  };

  try {
    await AIToolExecutor.execute({
      id: 'call_create_sentinel',
      name: 'blender.create_object',
      args: { type: 'CUBE', name: 'Rezel_Test_Cube_001' },
    });

    const ipcCall = interceptedCalls[interceptedCalls.length - 1];
    if (ipcCall.args.clientId !== 'blender' || 'client_id' in ipcCall.args) {
      throw new Error('Test I Failed: Client ID contract broken');
    }
    console.log('Test I Passed: Canonical clientId boundary key strictly preserved.');
  } finally {
    (SecurityToolExecutor as any).execute = originalSecurityExecute;
  }

  console.log('\n===========================================================');
  console.log('✅ ALL 11.1-HF5 TESTS PASSED (100% GREEN)');
  console.log('===========================================================\n');
}

run11_1HF5TestSuite().catch((err) => {
  console.error('❌ 11.1-HF5 Test Suite Failed:', err);
  process.exit(1);
});
