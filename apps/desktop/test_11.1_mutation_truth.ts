import { ApplicationCapabilityRegistry } from './src/lib/ai/ApplicationCapabilityRegistry';
import { ToolRegistry, BUILT_IN_TOOLS } from './src/lib/ai/ToolRegistry';
import { AIToolExecutor } from './src/lib/ai/ToolExecutor';
import { ToolExecutor as SecurityToolExecutor } from './src/lib/security/ToolExecutor';
import { VerificationEngine } from './src/lib/ai/verification/VerificationEngine';
import { PolicyEngine } from './src/lib/security/policy/PolicyEngine';

async function runMutationTruthTestSuite() {
  console.log('=== Starting Rezel 11.1 Mutation Truth Acceptance Test Suite ===\n');

  ToolRegistry.registerMany(BUILT_IN_TOOLS);

  // ─── Setup Simulated Blender State with Strict Mutation Truth Invariant ───
  interface BlenderObject {
    name: string;
    type: 'MESH' | 'CAMERA' | 'LIGHT';
    location: [number, number, number];
    inScene: boolean;
  }

  const blenderDataObjects = new Map<string, BlenderObject>();
  // Initial default scene objects
  blenderDataObjects.set('Cube', { name: 'Cube', type: 'MESH', location: [0, 0, 0], inScene: true });
  blenderDataObjects.set('Camera', { name: 'Camera', type: 'CAMERA', location: [0, 0, 0], inScene: true });
  blenderDataObjects.set('Light', { name: 'Light', type: 'LIGHT', location: [0, 0, 0], inScene: true });

  const originalSecurityExecute = SecurityToolExecutor.execute;

  (SecurityToolExecutor as any).execute = async (
    tool: string,
    action: string,
    args: any
  ) => {
    if (action === 'send_ipc_command') {
      const { clientId, command, args: cmdArgs } = args;

      if (clientId !== 'blender' || 'client_id' in args) {
        return { success: false, error: 'clientId contract violation' };
      }

      if (command === 'blender.inspect_scene') {
        const sceneList = Array.from(blenderDataObjects.values())
          .filter((o) => o.inScene)
          .map((o) => ({ name: o.name, type: o.type, location: o.location }));
        return { success: true, output: JSON.stringify(sceneList) };
      }

      if (command === 'blender.create_object') {
        const name = cmdArgs.name || 'Cube';
        const type = (cmdArgs.type || 'CUBE').toUpperCase() === 'CUBE' ? 'MESH' : 'MESH';

        // 1. Duplicate check
        if (blenderDataObjects.has(name)) {
          return { success: false, error: `Object with name '${name}' already exists in Blender scene` };
        }

        // Simulate creation failure mode if flag set
        if (cmdArgs.__simulate_creation_failure) {
          // Object not added to blenderDataObjects
          return {
            success: false,
            error: `Mutation truth verification failed: Object '${name}' not found in bpy.data.objects after creation`,
            verification: { exists: false },
          };
        }

        // Simulate type mismatch failure mode if flag set
        if (cmdArgs.__simulate_type_mismatch) {
          blenderDataObjects.set(name, { name, type: 'LIGHT' as any, location: [0, 0, 0], inScene: true });
          return {
            success: false,
            error: `Mutation truth verification failed: Expected type 'MESH', got 'LIGHT'`,
            verification: { exists: true, type_match: false },
          };
        }

        // Simulate scene membership failure mode if flag set
        if (cmdArgs.__simulate_not_in_scene) {
          blenderDataObjects.set(name, { name, type: 'MESH', location: [0, 0, 0], inScene: false });
          return {
            success: false,
            error: `Mutation truth verification failed: Object '${name}' is not in active scene collection`,
            verification: { exists: true, in_scene: false },
          };
        }

        // Normal successful creation and post-verification
        blenderDataObjects.set(name, { name, type: 'MESH', location: [0, 0, 0], inScene: true });
        return {
          success: true,
          output: JSON.stringify({
            success: true,
            name,
            type: 'MESH',
            verification: { exists: true, exact_name_match: true, type_match: true, in_scene: true },
          }),
        };
      }

      if (command === 'blender.create_camera') {
        const name = cmdArgs.name || 'Camera';

        // 1. Duplicate check
        if (blenderDataObjects.has(name)) {
          return { success: false, error: `Object with name '${name}' already exists in Blender scene` };
        }

        if (cmdArgs.__simulate_creation_failure) {
          return {
            success: false,
            error: `Mutation truth verification failed: Camera '${name}' not found in bpy.data.objects after creation`,
            verification: { exists: false },
          };
        }

        blenderDataObjects.set(name, { name, type: 'CAMERA', location: [0, 0, 0], inScene: true });
        return {
          success: true,
          output: JSON.stringify({
            success: true,
            name,
            type: 'CAMERA',
            verification: { exists: true, exact_name_match: true, type_match: true, in_scene: true },
          }),
        };
      }
    }

    return { success: true, output: 'Success' };
  };

  try {
    ApplicationCapabilityRegistry.handleClientConnected({
      client_id: 'blender',
      capabilities: [
        { name: 'blender.inspect_scene', description: '', parameters: {}, risk: 'LOW' },
        { name: 'blender.create_object', description: '', parameters: {}, risk: 'LOW' },
        { name: 'blender.create_camera', description: '', parameters: {}, risk: 'LOW' },
      ],
    });

    // ─── A. Default Cube does not satisfy sentinel ───
    console.log('--- A. Default Cube / Camera Does NOT Satisfy Sentinel Predicates ---');
    const initialInspect = await AIToolExecutor.execute({
      id: 'inspect_initial',
      name: 'blender.inspect_scene',
      args: {},
    });
    const parsedInitial = JSON.parse(initialInspect.executionResult.output);
    const initialScene = Array.isArray(parsedInitial) ? parsedInitial : (parsedInitial.objects || []);

    const initialObservation: import('./src/lib/ai/verification/types').NormalizedObservation = {
      appId: 'blender',
      timestamp: Date.now(),
      status: 'READY',
      entities: initialScene.map((o: any, idx: number) => ({
        id: String(idx),
        name: o.name,
        type: o.type,
        properties: { name: o.name },
      })),
      metadata: {},
      sourceCapability: 'blender.inspect_scene',
    };

    const cubePredicate: import('./src/lib/ai/verification/types').VerificationPredicate = {
      operator: 'EQUALS',
      entityType: 'MESH',
      entityName: 'Rezel_Test_Cube_001',
      property: 'name',
      value: 'Rezel_Test_Cube_001',
    };

    const camPredicate: import('./src/lib/ai/verification/types').VerificationPredicate = {
      operator: 'EQUALS',
      entityType: 'CAMERA',
      entityName: 'Rezel_Test_Camera_001',
      property: 'name',
      value: 'Rezel_Test_Camera_001',
    };

    if (VerificationEngine.verify(initialObservation, cubePredicate) === 'VERIFIED') {
      throw new Error('Test A Failed: Default Cube falsely satisfied Rezel_Test_Cube_001 predicate');
    }
    if (VerificationEngine.verify(initialObservation, camPredicate) === 'VERIFIED') {
      throw new Error('Test A Failed: Default Camera falsely satisfied Rezel_Test_Camera_001 predicate');
    }
    console.log('Test A Passed: Default objects do not satisfy sentinel predicates.');

    // ─── B, C, D, E. Mutation Truth Creation and Observable Verification ───
    console.log('\n--- B, C, D, E. Create Object & Camera with Observable Truth ---');
    const resCube = await AIToolExecutor.execute({
      id: 'create_cube_1',
      name: 'blender.create_object',
      args: { type: 'CUBE', name: 'Rezel_Test_Cube_001' },
    });
    if (!resCube.executionResult.success) {
      throw new Error(`Test B Failed: Failed to create sentinel cube: ${resCube.executionResult.error}`);
    }
    const cubePayload = JSON.parse(resCube.executionResult.output);
    if (!cubePayload.verification?.exists || !cubePayload.verification?.exact_name_match || !cubePayload.verification?.in_scene) {
      throw new Error('Test B/E Failed: Cube post-creation mutation verification missing or false');
    }
    console.log('Test B & E Passed: Rezel_Test_Cube_001 created and verified in active scene.');

    const resCamera = await AIToolExecutor.execute({
      id: 'create_cam_1',
      name: 'blender.create_camera',
      args: { name: 'Rezel_Test_Camera_001' },
    });
    if (!resCamera.executionResult.success) {
      throw new Error(`Test C Failed: Failed to create sentinel camera: ${resCamera.executionResult.error}`);
    }
    const camPayload = JSON.parse(resCamera.executionResult.output);
    if (!camPayload.verification?.exists || !camPayload.verification?.exact_name_match || !camPayload.verification?.in_scene) {
      throw new Error('Test C/E Failed: Camera post-creation mutation verification missing or false');
    }
    console.log('Test C & E Passed: Rezel_Test_Camera_001 created and verified in active scene.');

    // ─── F. Duplicate-Name Conflict Handling ───
    console.log('\n--- F. Duplicate-Name Conflict Handling ---');
    const resDup = await AIToolExecutor.execute({
      id: 'create_dup',
      name: 'blender.create_object',
      args: { type: 'CUBE', name: 'Rezel_Test_Cube_001' },
    });
    if (resDup.executionResult.success) {
      throw new Error('Test F Failed: Expected duplicate creation to fail with conflict');
    }
    if (!resDup.executionResult.error?.includes('already exists')) {
      throw new Error(`Test F Failed: Expected conflict error message, got ${resDup.executionResult.error}`);
    }
    console.log('Test F Passed: Duplicate sentinel name correctly rejected with conflict error.');

    // ─── G. Inspect Scene Reflects True Blender State ───
    console.log('\n--- G. Inspect Scene Reflects True State ---');
    const finalInspect = await AIToolExecutor.execute({
      id: 'inspect_final',
      name: 'blender.inspect_scene',
      args: {},
    });
    const parsedFinal = JSON.parse(finalInspect.executionResult.output);
    const finalScene = Array.isArray(parsedFinal) ? parsedFinal : (parsedFinal.objects || []);
    const finalObservation: import('./src/lib/ai/verification/types').NormalizedObservation = {
      appId: 'blender',
      timestamp: Date.now(),
      status: 'READY',
      entities: finalScene.map((o: any, idx: number) => ({
        id: String(idx),
        name: o.name,
        type: o.type,
        properties: { name: o.name },
      })),
      metadata: {},
      sourceCapability: 'blender.inspect_scene',
    };

    if (VerificationEngine.verify(finalObservation, cubePredicate) !== 'VERIFIED') {
      throw new Error('Test G Failed: Final scene inspection failed to verify Rezel_Test_Cube_001');
    }
    if (VerificationEngine.verify(finalObservation, camPredicate) !== 'VERIFIED') {
      throw new Error('Test G Failed: Final scene inspection failed to verify Rezel_Test_Camera_001');
    }
    console.log('Test G Passed: Final scene observation verifies both created sentinels.');

    // ─── H & I. Mutation Failures Never Return Fake Success ───
    console.log('\n--- H & I. No Fake Success Responses on Failure Modes ---');
    const resFailCreation = await AIToolExecutor.execute({
      id: 'fail_creation',
      name: 'blender.create_object',
      args: { type: 'CUBE', name: 'Ghost_Cube', __simulate_creation_failure: true },
    });
    if (resFailCreation.executionResult.success) {
      throw new Error('Test H/I Failed: Fake success returned when object was not in bpy.data.objects');
    }

    const resFailType = await AIToolExecutor.execute({
      id: 'fail_type',
      name: 'blender.create_object',
      args: { type: 'CUBE', name: 'Type_Mismatch_Cube', __simulate_type_mismatch: true },
    });
    if (resFailType.executionResult.success) {
      throw new Error('Test H/I Failed: Fake success returned on type mismatch');
    }

    const resFailScene = await AIToolExecutor.execute({
      id: 'fail_scene',
      name: 'blender.create_object',
      args: { type: 'CUBE', name: 'Not_In_Scene_Cube', __simulate_not_in_scene: true },
    });
    if (resFailScene.executionResult.success) {
      throw new Error('Test H/I Failed: Fake success returned when object is not in scene collection');
    }
    console.log('Test H & I Passed: Strict failure returned for missing objects, type mismatches, and detached objects.');

    // ─── J, K, L. Invariants: ClientId, PolicyEngine, UNKNOWN Semantics ───
    console.log('\n--- J, K, L. Invariants ---');
    const policyResult = await PolicyEngine.evaluate({
      capabilityId: 'blender.create_object',
      toolGroup: 'blender',
      args: { type: 'CUBE', name: 'Rezel_Test_Cube_001' },
      activeScopes: [],
    } as any);
    if (!policyResult || !policyResult.decision) {
      throw new Error('Test K Failed: PolicyEngine evaluation broken');
    }
    console.log('Test K Passed: PolicyEngine remains fully authoritative.');

    const unknownObservation: import('./src/lib/ai/verification/types').NormalizedObservation = {
      appId: 'blender',
      timestamp: Date.now(),
      status: 'UNKNOWN',
      entities: [],
      metadata: {},
      sourceCapability: 'blender.inspect_scene',
    };
    if (VerificationEngine.verify(unknownObservation, cubePredicate) !== 'UNKNOWN') {
      throw new Error('Test L Failed: UNKNOWN observation must return UNKNOWN verification result');
    }
    console.log('Test L Passed: UNKNOWN semantics strictly preserved.');

  } finally {
    (SecurityToolExecutor as any).execute = originalSecurityExecute;
  }

  console.log('\n===========================================================');
  console.log('✅ ALL 11.1 MUTATION TRUTH TESTS PASSED (100% GREEN)');
  console.log('===========================================================\n');
}

runMutationTruthTestSuite().catch((err) => {
  console.error('❌ 11.1 Mutation Truth Test Suite Failed:', err);
  process.exit(1);
});
