/**
 * REZEL 13.3.1 — NATIVE APPLICATION OPERATION BRIDGE ACCEPTANCE TEST SUITE
 *
 * Verifies:
 * 1. Profile Contract & Validation (empty execution + native capability accepted, invalid empty rejected)
 * 2. Planning Integration (intent resolution, operation selection, pure compilation with nativeStrategy, zero ComputerActions)
 * 3. Unified Execution Routing (READY -> native dispatch, DISCONNECTED/UNKNOWN -> safe typed failure, result normalization)
 * 4. Security Parity (PolicyEngine, EmergencyAbort, ResourceLockManager acquisition & guaranteed release)
 * 5. Real / Default Environment Behavior (honest reporting when bridge is not running)
 */

import { ApplicationPlanningAdapter } from './src/lib/ai/planning/app/ApplicationPlanningAdapter';
import { ApplicationIntentResolver } from './src/lib/ai/planning/app/ApplicationIntentResolver';
import { OperationSelectionEngine } from './src/lib/ai/planning/app/OperationSelectionEngine';
import { DeclarativeOperationCompiler } from './src/lib/ai/compiler/DeclarativeOperationCompiler';
import { ApplicationProfileRegistry } from './src/lib/ai/profiles/ApplicationProfileRegistry';
import { AFTER_EFFECTS_PROFILE } from './src/lib/ai/profiles/builtin/after_effects.profile';
import { validateApplicationProfile } from './src/lib/ai/profiles/validator';
import { ApplicationRegistry } from './src/lib/applications/ApplicationRegistry';
import { AfterEffectsApplicationAdapter } from './src/lib/applications/adapters/AfterEffectsApplicationAdapter';
import { EmergencyAbort } from './src/lib/ai/computer/EmergencyAbort';
import { ResourceLockManager } from './src/lib/ai/scheduler/ResourceLockManager';
import { PolicyEngine } from './src/lib/security/policy/PolicyEngine';
import { ToolRegistry, BUILT_IN_TOOLS } from './src/lib/ai/ToolRegistry';
import { ApplicationCapabilityRegistry } from './src/lib/ai/ApplicationCapabilityRegistry';
import './mock_tauri_core';
import type { ApplicationProfile } from './src/lib/ai/profiles/types';
import type { ApplicationOperation, ApplicationOperationResult, ApplicationSession } from './src/lib/applications/types';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passCount++;
    console.log(`  [PASS] ${message}`);
  } else {
    failCount++;
    console.error(`  [FAIL] ${message}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('REZEL 13.3.1 — NATIVE APPLICATION OPERATION BRIDGE TEST SUITE');
  console.log('================================================================\n');

  ToolRegistry.registerMany(BUILT_IN_TOOLS);
  ApplicationCapabilityRegistry.handleClientConnected({
    client_id: 'after_effects',
    capabilities: [
      { name: 'ae_get_status', description: 'Get status', parameters: {}, category: 'SYSTEM' as any, risk: 'LOW' as any },
      { name: 'ae_inspect_project', description: 'Inspect project', parameters: {}, category: 'PROJECT' as any, risk: 'LOW' as any },
      { name: 'ae_create_project', description: 'Create project', parameters: {}, category: 'PROJECT' as any, risk: 'HIGH' as any },
      { name: 'ae_create_comp', description: 'Create comp', parameters: {}, category: 'COMPOSITION' as any, risk: 'HIGH' as any },
      { name: 'ae_add_text_layer', description: 'Add text layer', parameters: {}, category: 'LAYER' as any, risk: 'HIGH' as any },
      { name: 'ae_add_layer', description: 'Add layer', parameters: {}, category: 'LAYER' as any, risk: 'HIGH' as any },
      { name: 'ae_set_transform', description: 'Set transform', parameters: {}, category: 'LAYER' as any, risk: 'HIGH' as any },
      { name: 'ae_save_project', description: 'Save project', parameters: {}, category: 'PROJECT' as any, risk: 'MEDIUM' as any },
    ],
  });

  const mockAeAdapter: import('./src/lib/applications/types').ApplicationAdapter = {
    applicationId: 'after_effects',
    displayName: 'Adobe After Effects (Mock)',
    getCapabilities: () => [],
    discover: async () => ({
      applicationId: 'after_effects',
      displayName: 'Adobe After Effects',
      isInstalled: true,
      isRunning: true,
      availableSessions: [],
    }),
    connect: async () => ({} as ApplicationSession),
    disconnect: async () => {},
    getHealth: () => ({
      state: 'READY',
      lastHeartbeat: Date.now(),
      message: 'Connected to ExtendScript IPC',
    }),
    getSessions: () => [],
    getSession: () => undefined,
    inspect: async () => ({
      applicationId: 'after_effects',
      timestamp: Date.now(),
      status: 'SUCCESS',
      rawOutput: {
        projectOpen: true,
        activeCompositionId: '1',
        compositions: [
          {
            id: 1,
            name: 'Active Comp',
            layers: [],
          },
        ],
      },
      entities: [
        {
          entityId: 'comp_1',
          entityType: 'COMPOSITION',
          name: 'Active Comp',
          properties: { active: true },
        },
      ],
    }),
    execute: async (op: ApplicationOperation): Promise<ApplicationOperationResult> => {
      return {
        operationId: op.operationId,
        applicationId: op.applicationId,
        sessionId: op.sessionId,
        success: true,
        outcome: 'SUCCESS',
        output: { layerId: 1, name: 'Hello World' },
        durationMs: 45,
        mutatesExternalState: true,
      };
    },
    verify: async () => 'VERIFIED',
  };

  ApplicationRegistry.register(mockAeAdapter);

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 1: PROFILE CONTRACT & VALIDATION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('--- SUITE 1: PROFILE CONTRACT & VALIDATION ---');
  {
    // 1.1 After Effects profile validates cleanly
    const vResult = validateApplicationProfile(AFTER_EFFECTS_PROFILE);
    assert(vResult.valid === true, 'After Effects profile passes validation');
    assert(vResult.errors.length === 0, 'After Effects profile has 0 validation errors');
    assert(AFTER_EFFECTS_PROFILE.appId === 'after_effects', 'Profile appId is "after_effects"');
    assert(AFTER_EFFECTS_PROFILE.controlStrategy.preferNativeAdapter === true, 'Profile preferNativeAdapter is true');

    // 1.2 execution: [] + nativeCapabilityId is valid
    const textLayerOp = AFTER_EFFECTS_PROFILE.operations.add_text_layer;
    assert(textLayerOp !== undefined, 'add_text_layer operation is declared');
    assert(textLayerOp.execution.length === 0, 'add_text_layer has empty execution: []');
    assert(textLayerOp.nativeCapabilityId === 'ae_add_text_layer', 'nativeCapabilityId is "ae_add_text_layer"');

    const compOp = AFTER_EFFECTS_PROFILE.operations.create_comp;
    assert(compOp !== undefined, 'create_comp operation is declared');
    assert(compOp.execution.length === 0, 'create_comp has empty execution: []');
    assert(compOp.nativeCapabilityId === 'ae_create_comp', 'nativeCapabilityId is "ae_create_comp"');

    // 1.3 empty execution without native strategy is rejected
    const invalidEmptyProfile: ApplicationProfile = {
      appId: 'invalid_empty_app',
      name: 'Invalid Empty App',
      aliases: ['invalid'],
      executableNames: ['invalid.exe'],
      capabilities: { read: [], interact: ['click'], write: [], execute: [] },
      landmarks: {},
      states: {},
      operations: {
        broken_op: {
          id: 'broken_op',
          description: 'Broken op with empty execution and no native strategy',
          capabilities: ['interact'],
          preconditions: [],
          execution: [], // Empty execution
          postconditions: [],
        },
      },
      controlStrategy: {
        preferredTier: 'UIA_ELEMENT_INTERACTION',
        requiresFocusBeforeInput: false,
        preferNativeAdapter: false, // No native strategy!
      },
    };
    const vInvalid = validateApplicationProfile(invalidEmptyProfile);
    assert(vInvalid.valid === false, 'Empty execution without native strategy is rejected');
    assert(vInvalid.errors.some(e => e.includes('missing native strategy')), 'Error identifies missing native strategy');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 2: INTENT & PLANNING INTEGRATION
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 2: INTENT & PLANNING INTEGRATION ---');
  {
    // 2.1 Natural language intent resolution
    const intent = ApplicationIntentResolver.resolveIntent(
      'Add a text layer saying Hello World in After Effects'
    );
    assert(intent.explicitAppId === 'after_effects', 'Intent resolved explicitAppId as "after_effects"');
    assert(intent.parameters.text === 'Hello World', 'Intent extracted parameter text: "Hello World"');

    // 2.2 Operation selection chooses add_text_layer
    const opRes = OperationSelectionEngine.selectOperation(
      intent.operationQuery,
      AFTER_EFFECTS_PROFILE
    );
    assert(opRes.success === true, 'Operation selection succeeded');
    if (opRes.success) {
      assert(opRes.operation.id === 'add_text_layer', 'Selected operation is "add_text_layer"');
      assert(opRes.operation.nativeCapabilityId === 'ae_add_text_layer', 'Selected operation has nativeCapabilityId "ae_add_text_layer"');
    }

    // 2.3 Pure compiler produces nativeStrategy with 0 ComputerActions
    const compileRes = await DeclarativeOperationCompiler.compile({
      appId: 'after_effects',
      operationId: 'add_text_layer',
      parameters: { text: 'Hello World' },
    });
    assert(compileRes.success === true, 'Compilation succeeded');
    if (compileRes.success) {
      assert(compileRes.plan.nativeStrategy !== undefined, 'Compiled plan includes nativeStrategy');
      assert(compileRes.plan.nativeStrategy?.adapterId === 'after_effects', 'nativeStrategy adapterId is "after_effects"');
      assert(compileRes.plan.nativeStrategy?.capabilityId === 'ae_add_text_layer', 'nativeStrategy capabilityId is "ae_add_text_layer"');
      assert(compileRes.plan.actions.length === 0, 'Compiled plan has exactly 0 ComputerActions (pure native)');
    }

    // 2.4 End-to-end planOperation
    const planRes = await ApplicationPlanningAdapter.planOperation({
      query: 'Add a text layer saying Hello World in After Effects',
    });
    assert(planRes.success === true, 'ApplicationPlanningAdapter.planOperation succeeded');
    if (planRes.success) {
      assert(planRes.plannedOperation.applicationId === 'after_effects', 'Planned application is after_effects');
      assert(planRes.plannedOperation.operationId === 'add_text_layer', 'Planned operation is add_text_layer');
      assert(planRes.plannedOperation.compiledPlan.actions.length === 0, 'Plan contains 0 ComputerActions');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 3: UNIFIED NATIVE EXECUTION ROUTING
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 3: UNIFIED NATIVE EXECUTION ROUTING ---');
  {
    // Create a mock adapter with controlled state
    let executedOperation: ApplicationOperation | undefined = undefined;

    const mockAeAdapter: import('./src/lib/applications/types').ApplicationAdapter = {
      applicationId: 'after_effects',
      displayName: 'Adobe After Effects (Mock)',
      getCapabilities: () => [],
      discover: async () => ({
        applicationId: 'after_effects',
        displayName: 'Adobe After Effects',
        isInstalled: true,
        isRunning: true,
        availableSessions: [],
      }),
      connect: async () => ({} as ApplicationSession),
      disconnect: async () => {},
      getHealth: () => ({
        state: 'READY',
        lastHeartbeat: Date.now(),
        message: 'Connected to ExtendScript IPC',
      }),
      getSessions: () => [],
      getSession: () => undefined,
      inspect: async () => ({
        applicationId: 'after_effects',
        timestamp: Date.now(),
        status: 'SUCCESS',
        entities: [
          {
            entityId: 'comp_1',
            entityType: 'COMPOSITION',
            name: 'Active Comp',
            properties: { active: true },
          },
        ],
      }),
      execute: async (op: ApplicationOperation): Promise<ApplicationOperationResult> => {
        executedOperation = op;
        return {
          operationId: op.operationId,
          applicationId: op.applicationId,
          sessionId: op.sessionId,
          success: true,
          outcome: 'SUCCESS',
          output: { layerId: 1, name: 'Hello World' },
          durationMs: 45,
          mutatesExternalState: true,
        };
      },
      verify: async () => 'VERIFIED',
    };

    // Register mock adapter in ApplicationRegistry
    ApplicationRegistry.register(mockAeAdapter);

    // 3.1 READY adapter -> routes to native execution
    const planRes = await ApplicationPlanningAdapter.planOperation({
      query: 'Add a text layer saying Hello World in After Effects',
    });
    assert(planRes.success === true, 'Planned After Effects operation');

    if (planRes.success) {
      const execRes = await ApplicationPlanningAdapter.executePlannedOperation(
        planRes.plannedOperation
      );
      assert(execRes.success === true, 'executePlannedOperation succeeded');
      assert(execRes.status === 'SUCCESS', 'ExecutionResult status is "SUCCESS"');
      assert(executedOperation !== undefined, 'Mock adapter execute() was invoked');
      assert(executedOperation?.capabilityId === 'ae_add_text_layer', 'Dispatched capabilityId is "ae_add_text_layer"');
      assert((executedOperation?.parameters as any)?.text === 'Hello World', 'Dispatched parameter text is "Hello World"');
      assert(execRes.executionResult?.adapterId === 'after_effects', 'Result tracks adapterId provenance');
      assert(execRes.results.length === 0, 'Zero UIA ComputerActions executed');
    }

    // 3.2 DISCONNECTED adapter -> returns ADAPTER_DISCONNECTED / DISCONNECTED status
    const disconnectedMockAdapter = {
      ...mockAeAdapter,
      getHealth: () => ({
        state: 'DISCONNECTED' as const,
        lastHeartbeat: 0,
        message: 'After Effects not running',
      }),
    };
    ApplicationRegistry.register(disconnectedMockAdapter);

    if (planRes.success) {
      const discExecRes = await ApplicationPlanningAdapter.executePlannedOperation(
        planRes.plannedOperation
      );
      assert(discExecRes.success === false, 'Disconnected adapter fails execution cleanly');
      assert(discExecRes.status === 'DISCONNECTED', 'ExecutionResult status is "DISCONNECTED"');
      assert(discExecRes.error?.includes('unavailable') === true, 'Error message indicates adapter unavailable');
      assert(discExecRes.results.length === 0, 'Zero blind UIA clicks attempted on disconnected state');
    }

    // 3.3 UNKNOWN health adapter -> safe rejection
    const unknownHealthMockAdapter = {
      ...mockAeAdapter,
      getHealth: () => ({
        state: 'UNKNOWN' as const,
        lastHeartbeat: 0,
        message: 'Unknown state',
      }),
    };
    ApplicationRegistry.register(unknownHealthMockAdapter);

    if (planRes.success) {
      const unkExecRes = await ApplicationPlanningAdapter.executePlannedOperation(
        planRes.plannedOperation
      );
      assert(unkExecRes.success === false, 'Unknown health adapter fails execution safely');
      assert(unkExecRes.status === 'DISCONNECTED', 'ExecutionResult status is DISCONNECTED');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 4: SECURITY PARITY & RESOURCE LOCKING
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 4: SECURITY PARITY & RESOURCE LOCKING ---');
  {
    let callCount = 0;
    const trackingAdapter: import('./src/lib/applications/types').ApplicationAdapter = {
      applicationId: 'after_effects',
      displayName: 'Adobe After Effects (Security Mock)',
      getCapabilities: () => [],
      discover: async () => ({
        applicationId: 'after_effects',
        displayName: 'Adobe After Effects',
        isInstalled: true,
        isRunning: true,
        availableSessions: [],
      }),
      connect: async () => ({} as ApplicationSession),
      disconnect: async () => {},
      getHealth: () => ({ state: 'READY', lastHeartbeat: Date.now() }),
      getSessions: () => [],
      getSession: () => undefined,
      inspect: async () => ({ applicationId: 'after_effects', timestamp: Date.now(), status: 'SUCCESS', entities: [] }),
      execute: async (op: ApplicationOperation) => {
        callCount++;
        return {
          operationId: op.operationId,
          applicationId: op.applicationId,
          success: true,
          outcome: 'SUCCESS',
          durationMs: 10,
          mutatesExternalState: true,
        };
      },
      verify: async () => 'VERIFIED',
    };
    ApplicationRegistry.register(trackingAdapter);

    const planRes = await ApplicationPlanningAdapter.planOperation({
      query: 'create comp named IntroScene in After Effects',
    });
    assert(planRes.success === true, 'Planned create_comp operation');

    if (planRes.success) {
      assert(planRes.plannedOperation.compiledPlan.nativeStrategy?.capabilityId === 'ae_create_comp', 'Compiled capabilityId is "ae_create_comp"');

      // 4.1 PolicyEngine Denial
      const origEvaluate = PolicyEngine.evaluate;
      PolicyEngine.evaluate = async () => ({
        decision: 'DENY',
        reason: 'Policy prohibits After Effects mutation in restricted mode',
        riskLevel: 'HIGH',
      } as any);

      callCount = 0;
      const policyDeniedRes = await ApplicationPlanningAdapter.executePlannedOperation(
        planRes.plannedOperation
      );
      assert(policyDeniedRes.success === false, 'Policy denial prevents execution');
      assert(policyDeniedRes.status === 'DENIED', 'Status is "DENIED"');
      assert(callCount === 0, 'Adapter was NOT invoked upon policy denial');

      // Restore PolicyEngine
      PolicyEngine.evaluate = origEvaluate;

      // 4.2 EmergencyAbort Interlock
      EmergencyAbort.reset();
      EmergencyAbort.trigger('Test operator emergency abort');

      callCount = 0;
      const abortRes = await ApplicationPlanningAdapter.executePlannedOperation(
        planRes.plannedOperation
      );
      assert(abortRes.success === false, 'EmergencyAbort halts execution');
      assert(abortRes.status === 'CANCELLED', 'Status is "CANCELLED"');
      assert(abortRes.error?.includes('EmergencyAbort') === true, 'Error indicates EmergencyAbort');
      assert(callCount === 0, 'Adapter was NOT invoked after EmergencyAbort');

      EmergencyAbort.reset();

      // 4.3 ResourceLockManager acquisition & release
      assert(ResourceLockManager.isLocked('app:after_effects') === false, 'Lock is free before execution');
      const normalExec = await ApplicationPlanningAdapter.executePlannedOperation(
        planRes.plannedOperation
      );
      assert(normalExec.success === true, 'Normal execution succeeds after reset');
      assert(ResourceLockManager.isLocked('app:after_effects') === false, 'Lock is guaranteed released after execution (finally block)');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUITE 5: REAL / DEFAULT ENVIRONMENT REPORTING
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n--- SUITE 5: REAL / DEFAULT ENVIRONMENT REPORTING ---');
  {
    // Re-register real BaseApplicationAdapter / AfterEffectsApplicationAdapter
    const realAdapter = new AfterEffectsApplicationAdapter();
    ApplicationRegistry.register(realAdapter);

    const planRes = await ApplicationPlanningAdapter.planOperation({
      query: 'Create a composition named Comp1 in After Effects',
    });
    assert(planRes.success === true, 'Planning succeeds with real profile & adapter registered');

    if (planRes.success) {
      const realExec = await ApplicationPlanningAdapter.executePlannedOperation(
        planRes.plannedOperation
      );

      // In CI/headless test environments without active After Effects running,
      // it must honestly report DISCONNECTED / unavailable (no false claims)
      if (realAdapter.getHealth().state === 'READY') {
        assert(realExec.success === true, 'Live After Effects bridge executed operation');
      } else {
        assert(realExec.success === false, 'Non-connected environment honestly reports failure');
        assert(realExec.status === 'DISCONNECTED', 'Status is DISCONNECTED when bridge is inactive');
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`TEST SUMMARY: ${passCount} Passed, ${failCount} Failed`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
