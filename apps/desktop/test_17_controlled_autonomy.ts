/**
 * REZEL PHASE 17 — CONTROLLED AUTONOMY ACCEPTANCE TEST SUITE
 *
 * Validates bounded autonomous goal pursuit, deterministic safety budgets,
 * auditable decision traces (zero CoT), capability safety gating,
 * fresh-state bounded corrections (zero blind replay), and disconnect handling.
 */

import { AutonomySupervisor } from './src/lib/ai/autonomy/AutonomySupervisor';
import { ControlledAutonomyStateMachine } from './src/lib/ai/autonomy/ControlledAutonomyStateMachine';
import { SafetyBudgetManager } from './src/lib/ai/autonomy/SafetyBudgetManager';
import { AutonomyDecisionLogger } from './src/lib/ai/autonomy/AutonomyDecisionLogger';
import { ApplicationProfileRegistry } from './src/lib/ai/profiles/ApplicationProfileRegistry';
import { ApplicationRegistry } from './src/lib/applications/ApplicationRegistry';
import { BlenderApplicationAdapter } from './src/lib/applications/adapters/BlenderApplicationAdapter';
import { AfterEffectsApplicationAdapter } from './src/lib/applications/adapters/AfterEffectsApplicationAdapter';
import { EmergencyAbort } from './src/lib/ai/computer/EmergencyAbort';
import type { ApplicationOperation, ApplicationOperationResult } from './src/lib/applications/types';

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string, details?: string) {
  total++;
  if (condition) {
    passed++;
    console.log(`  [PASS] ${testName}`);
  } else {
    console.error(`  [FAIL] ${testName}`);
    if (details) console.error(`         ${details}`);
    throw new Error(`Test failed: ${testName} - ${details || ''}`);
  }
}

// ─── High-Fidelity Mock Adapters ─────────────────────────────────────────────

class MockBlenderAdapter extends BlenderApplicationAdapter {
  private connected = true;
  private objects = new Map<string, any>();
  private materials = new Map<string, any>();
  public executedCapabilities: string[] = [];

  constructor() {
    super();
    this.reset();
  }

  public reset() {
    this.objects.clear();
    this.materials.clear();
    this.objects.set('HeroAsset', { name: 'HeroAsset', type: 'MESH', location: [0, 0, 0] });
    this.objects.set('Cube', { name: 'Cube', type: 'MESH', location: [0, 0, 0] });
    this.objects.set('BlenderModel', { name: 'BlenderModel', type: 'MESH', location: [0, 0, 0] });
    this.objects.set('SciFi_Core', { name: 'SciFi_Core', type: 'MESH', location: [0, 0, 0] });
    this.executedCapabilities = [];
    this.connected = true;
  }

  public setConnected(val: boolean) {
    this.connected = val;
  }

  public override getHealth(_sessionId?: string) {
    if (!this.connected) {
      return {
        state: 'DISCONNECTED' as const,
        lastHeartbeat: Date.now() - 10000,
        message: 'Mock Blender disconnected',
      };
    }
    return {
      state: 'READY' as const,
      lastHeartbeat: Date.now(),
      connectionId: 'mock_blender_conn',
      message: 'Mock Blender connected',
    };
  }

  public override async inspect(request?: any): Promise<any> {
    if (!this.connected) {
      return {
        applicationId: 'blender',
        sessionId: request?.sessionId,
        timestamp: Date.now(),
        status: 'ERROR',
        entities: [],
        error: 'Blender disconnected',
      };
    }

    const objectList = Array.from(this.objects.values()).map((o) => ({
      id: o.name,
      name: o.name,
      type: o.type,
      location: o.location,
      collection_names: ['Collection'],
      visible: true,
      selected: true,
      active: true,
    }));

    return {
      applicationId: 'blender',
      sessionId: request?.sessionId,
      timestamp: Date.now(),
      status: 'SUCCESS',
      entities: objectList,
      rawOutput: {
        scene_name: 'Scene',
        file_path: 'C:/Renders/scene.blend',
        active_object_name: 'HeroAsset',
        objects: objectList,
      },
    };
  }

  public override async execute(operation: ApplicationOperation): Promise<ApplicationOperationResult> {
    this.executedCapabilities.push(operation.capabilityId);

    if (!this.connected) {
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: false,
        outcome: 'FAILED',
        error: 'Blender adapter is disconnected',
        durationMs: 5,
        mutatesExternalState: operation.mutatesExternalState,
      };
    }

    if (operation.capabilityId === 'blender.create_object' || operation.capabilityId === 'create_object') {
      const name = (operation.parameters as any)?.name || 'NewObject';
      const objType = (operation.parameters as any)?.type || 'CUBE';
      this.objects.set(name, { name, type: 'MESH', location: [0, 0, 0] });

      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: true,
        outcome: {
          success: true,
          name,
          type: 'MESH',
          path: `C:/Renders/${name}.obj`,
          size: 2048,
          scene_name: 'Scene',
        },
        durationMs: 10,
        mutatesExternalState: true,
      };
    }

    if (operation.capabilityId === 'blender.transform_object' || operation.capabilityId === 'transform_object') {
      const objId = (operation.parameters as any)?.objectId || 'HeroAsset';
      const loc = (operation.parameters as any)?.location;
      if (this.objects.has(objId)) {
        this.objects.get(objId).location = loc;
      }
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: true,
        outcome: { success: true, name: objId, location: loc },
        durationMs: 5,
        mutatesExternalState: true,
      };
    }

    if (operation.capabilityId === 'blender.material.create' || operation.capabilityId === 'material.create' || operation.capabilityId === 'material_create') {
      const name = (operation.parameters as any)?.name || 'NewMaterial';
      this.materials.set(name, { name });
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: true,
        outcome: { success: true, name },
        durationMs: 5,
        mutatesExternalState: true,
      };
    }

    if (operation.capabilityId === 'blender.material.assign' || operation.capabilityId === 'material.assign' || operation.capabilityId === 'material_assign') {
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: true,
        outcome: { success: true, assigned: true },
        durationMs: 5,
        mutatesExternalState: true,
      };
    }

    if (operation.capabilityId === 'blender.render.image' || operation.capabilityId === 'render.image' || operation.capabilityId === 'render_image') {
      const outPath = (operation.parameters as any)?.outputPath || (operation.parameters as any)?.output_path || 'C:\\renders\\hero_asset.png';
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: true,
        outcome: {
          success: true,
          output_path: outPath,
          path: outPath,
          size: 1048576,
        },
        durationMs: 25,
        mutatesExternalState: true,
      };
    }

    if (operation.capabilityId === 'blender.inspect_scene') {
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: true,
        outcome: { success: true, active: true },
        durationMs: 5,
        mutatesExternalState: false,
      };
    }

    return super.execute(operation);
  }
}

class MockAfterEffectsAdapter extends AfterEffectsApplicationAdapter {
  private connected = true;
  private comps = new Map<string, any>();
  public executedCapabilities: string[] = [];

  constructor() {
    super();
    this.reset();
  }

  public reset() {
    this.comps.clear();
    this.comps.set('FinalExportComp', { name: 'FinalExportComp', type: 'COMPOSITION' });
    this.comps.set('AE_Composite_Comp', { name: 'AE_Composite_Comp', type: 'COMPOSITION' });
    this.comps.set('PromoVideo_Comp', { name: 'PromoVideo_Comp', type: 'COMPOSITION' });
    this.comps.set('Master_VFX_Comp', { name: 'Master_VFX_Comp', type: 'COMPOSITION' });
    this.executedCapabilities = [];
    this.connected = true;
  }

  public setConnected(val: boolean) {
    this.connected = val;
  }

  public override getHealth(_sessionId?: string) {
    if (!this.connected) {
      return {
        state: 'DISCONNECTED' as const,
        lastHeartbeat: Date.now() - 10000,
        message: 'Mock After Effects disconnected',
      };
    }
    return {
      state: 'READY' as const,
      lastHeartbeat: Date.now(),
      connectionId: 'mock_ae_conn',
      message: 'Mock After Effects connected',
    };
  }

  public override async inspect(request?: any): Promise<any> {
    if (!this.connected) {
      return {
        applicationId: 'after_effects',
        sessionId: request?.sessionId,
        timestamp: Date.now(),
        status: 'ERROR',
        entities: [],
        error: 'After Effects disconnected',
      };
    }

    const compList = Array.from(this.comps.values()).map((c) => ({
      id: c.name,
      name: c.name,
      type: 'COMPOSITION',
    }));

    return {
      applicationId: 'after_effects',
      sessionId: request?.sessionId,
      timestamp: Date.now(),
      status: 'SUCCESS',
      entities: compList,
      rawOutput: { comps: compList },
    };
  }

  public override async execute(operation: ApplicationOperation): Promise<ApplicationOperationResult> {
    this.executedCapabilities.push(operation.capabilityId);

    if (!this.connected) {
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: false,
        outcome: 'FAILED',
        error: 'After Effects adapter is disconnected',
        durationMs: 5,
        mutatesExternalState: operation.mutatesExternalState,
      };
    }

    if (operation.capabilityId === 'ae_create_comp' || operation.capabilityId === 'create_comp') {
      const name = (operation.parameters as any)?.name || 'NewComp';
      this.comps.set(name, { name, type: 'COMPOSITION' });
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: true,
        outcome: { success: true, name, id: 'comp_id_mock' },
        durationMs: 15,
        mutatesExternalState: true,
      };
    }

    if (operation.capabilityId === 'ae_add_text_layer' || operation.capabilityId === 'add_text_layer') {
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: true,
        outcome: { success: true, text: (operation.parameters as any)?.text },
        durationMs: 10,
        mutatesExternalState: true,
      };
    }

    if (operation.capabilityId === 'ae_import_file' || operation.capabilityId === 'import_file') {
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: true,
        outcome: { success: true, imported: (operation.parameters as any)?.filePath },
        durationMs: 10,
        mutatesExternalState: true,
      };
    }

    if (operation.capabilityId === 'ae_add_to_render_queue' || operation.capabilityId === 'add_to_render_queue') {
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: true,
        outcome: { success: true, queueIndex: 1 },
        durationMs: 5,
        mutatesExternalState: true,
      };
    }

    if (operation.capabilityId === 'ae_set_render_output_path' || operation.capabilityId === 'set_render_output_path') {
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: true,
        outcome: { success: true, path: (operation.parameters as any)?.outputFilePath },
        durationMs: 5,
        mutatesExternalState: true,
      };
    }

    if (operation.capabilityId === 'ae_start_render' || operation.capabilityId === 'start_render') {
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: true,
        outcome: { success: true, rendered: true },
        durationMs: 30,
        mutatesExternalState: true,
      };
    }

    if (operation.capabilityId === 'ae_inspect_project') {
      return {
        operationId: operation.operationId,
        applicationId: this.applicationId,
        sessionId: operation.sessionId,
        success: true,
        outcome: { success: true, active: true },
        durationMs: 5,
        mutatesExternalState: false,
      };
    }

    return super.execute(operation);
  }
}

async function runAcceptanceTests() {
  console.log('======================================================================');
  console.log('REZEL PHASE 17 — CONTROLLED AUTONOMY ACCEPTANCE SUITE');
  console.log('======================================================================\n');

  // Reset registries and load defaults
  ApplicationProfileRegistry.reset();
  ApplicationProfileRegistry.loadDefaults();

  const blenderAdapter = new MockBlenderAdapter();
  const aeAdapter = new MockAfterEffectsAdapter();
  ApplicationRegistry.register(blenderAdapter);
  ApplicationRegistry.register(aeAdapter);

  // ───────────────────────────────────────────────────────────────────────────
  console.log('SECTION 1: Safety Budget Enforcement');
  // ───────────────────────────────────────────────────────────────────────────

  // Test 1: Operation budget exhaustion halts execution cleanly
  {
    const budgetMgr = new SafetyBudgetManager({ maxOperations: 2 });
    assert(budgetMgr.consumeOperation(1), 'Operation slot 1 consumed');
    assert(budgetMgr.consumeOperation(1), 'Operation slot 2 consumed');
    assert(!budgetMgr.consumeOperation(1), 'Operation slot 3 rejected');
    assert(budgetMgr.isExhausted(), 'Budget marked exhausted on operation limit breach');
    assert(
      budgetMgr.getExhaustionReason()?.includes('Operation budget exhausted') || false,
      'Exhaustion reason accurately recorded'
    );
  }

  // Test 2: Correction budget exhaustion
  {
    const budgetMgr = new SafetyBudgetManager({ maxCorrections: 1 });
    assert(budgetMgr.consumeCorrection(1), 'Correction slot 1 consumed');
    assert(!budgetMgr.consumeCorrection(1), 'Correction slot 2 rejected');
    assert(budgetMgr.isExhausted(), 'Budget marked exhausted on correction limit breach');
  }

  // Test 3: Token budget exhaustion
  {
    const budgetMgr = new SafetyBudgetManager({ maxTokens: 100 });
    assert(budgetMgr.consumeTokens(50), 'Tokens 50 consumed');
    assert(!budgetMgr.consumeTokens(60), 'Tokens 60 rejected (breaches 100)');
    assert(budgetMgr.isExhausted(), 'Budget marked exhausted on token limit breach');
  }

  // Test 4: Time budget expiration
  {
    const budgetMgr = new SafetyBudgetManager({ maxDurationMs: 5 });
    await new Promise((r) => setTimeout(r, 15));
    assert(!budgetMgr.checkTimeBudget(), 'Time budget expired');
    assert(budgetMgr.isExhausted(), 'Budget marked exhausted on time limit breach');
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\nSECTION 2: Controlled State Machine Progression');
  // ───────────────────────────────────────────────────────────────────────────

  // Test 5: Legal state transitions IDLE -> GOAL_MET
  {
    const sm = new ControlledAutonomyStateMachine('IDLE');
    sm.transition('ANALYZING_GOAL');
    sm.transition('FORMULATING_BOUNDED_PLAN');
    sm.transition('EXECUTING');
    sm.transition('OBSERVING_STATE');
    sm.transition('GOAL_MET');
    assert(sm.getState() === 'GOAL_MET', 'State machine reached GOAL_MET legally');
    assert(sm.isTerminal(), 'GOAL_MET is a terminal state');
  }

  // Test 6: Illegal transitions are strictly rejected
  {
    const sm = new ControlledAutonomyStateMachine('IDLE');
    let threw = false;
    try {
      sm.transition('GOAL_MET'); // Cannot jump from IDLE to GOAL_MET
    } catch {
      threw = true;
    }
    assert(threw, 'Illegal state transition throws descriptive error');
  }

  // Test 7: Terminal states cannot be exited
  {
    const sm = new ControlledAutonomyStateMachine('GOAL_MET');
    let threw = false;
    try {
      sm.transition('EXECUTING');
    } catch {
      threw = true;
    }
    assert(threw, 'Cannot transition out of terminal GOAL_MET state');
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\nSECTION 3: Auditable Decision Traces (Zero CoT Exposure)');
  // ───────────────────────────────────────────────────────────────────────────

  // Test 8: Decision traces log discrete structured records
  {
    const budgetMgr = new SafetyBudgetManager();
    const logger = new AutonomyDecisionLogger('sess_test_1');
    const decision = logger.logDecision(
      {
        decisionType: 'PLAN_SELECTION',
        selectedTemplate: 'workflow_a_blender_asset_prep',
        reason: 'Selected Blender asset prep template for 3D modeling request',
        metadata: { inputs: { meshName: 'HeroAsset' } },
      },
      budgetMgr
    );

    assert(decision.decisionType === 'PLAN_SELECTION', 'Decision type correctly recorded');
    assert(decision.selectedTemplate === 'workflow_a_blender_asset_prep', 'Template recorded');
    assert(decision.budgetRemaining.operations > 0, 'Remaining budget snapshotted');
  }

  // Test 9: Decision logger sanitizes reasoning/thinking tags (zero CoT leakage)
  {
    const budgetMgr = new SafetyBudgetManager();
    const logger = new AutonomyDecisionLogger('sess_test_2');
    const decision = logger.logDecision(
      {
        decisionType: 'OPERATION_EXECUTION',
        reason: '<thinking>Internal chain of thought reasoning should be stripped</thinking>Execute transform',
        metadata: { chainOfThought: 'secret_tokens', validParam: 123 },
      },
      budgetMgr
    );

    assert(!decision.reason.includes('<thinking>'), 'Thinking XML tags removed from decision reason');
    assert(!decision.reason.includes('Internal chain of thought'), 'Internal CoT stripped from reason');
    assert(decision.metadata?.chainOfThought === undefined, 'chainOfThought key stripped from metadata');
    assert(decision.metadata?.validParam === 123, 'Legitimate metadata preserved');
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\nSECTION 4: Capability Safety Checks & Negative Capability Tests');
  // ───────────────────────────────────────────────────────────────────────────

  // Test 10: Negative capability test A: "Organize my AE project assets into folders"
  {
    const res = await AutonomySupervisor.pursueGoal({
      goalId: 'goal_neg_a',
      rawQuery: 'Organize my AE project assets into folders',
      targetApplication: 'after_effects',
    });

    assert(res.state === 'UNSUPPORTED_GOAL', 'Goal classified as UNSUPPORTED_GOAL');
    assert(res.classification === 'OPERATION_UNAVAILABLE', 'Classification is OPERATION_UNAVAILABLE');
    assert(!res.success, 'Goal marked as unsuccessful');
    assert(res.error?.includes('ae.organize_assets') || false, 'Error message identifies missing capability');
  }

  // Test 11: Negative capability test C: "Fix the broken expression in layer 3"
  {
    const res = await AutonomySupervisor.pursueGoal({
      goalId: 'goal_neg_c',
      rawQuery: 'Fix the broken expression in layer 3',
      targetApplication: 'after_effects',
    });

    assert(res.state === 'UNSUPPORTED_GOAL', 'Expression editing classified as UNSUPPORTED_GOAL');
    assert(res.classification === 'OPERATION_UNAVAILABLE', 'Classification is OPERATION_UNAVAILABLE');
  }

  // Test 12: Negative capability test D: "Model a procedural city without template"
  {
    const res = await AutonomySupervisor.pursueGoal({
      goalId: 'goal_neg_d',
      rawQuery: 'Model procedural city without template and modify mesh',
      targetApplication: 'blender',
    });

    assert(res.state === 'UNSUPPORTED_GOAL', 'Unstructured mesh modification rejected as UNSUPPORTED_GOAL');
    assert(res.classification === 'OPERATION_UNAVAILABLE', 'Classification is OPERATION_UNAVAILABLE');
  }

  // Test 13: Negative capability test E: "Delete all compositions in After Effects"
  {
    const res = await AutonomySupervisor.pursueGoal({
      goalId: 'goal_neg_e',
      rawQuery: 'Delete all comp items in After Effects',
      targetApplication: 'after_effects',
    });

    assert(res.state === 'UNSUPPORTED_GOAL', 'AE item deletion rejected as UNSUPPORTED_GOAL');
    assert(res.classification === 'OPERATION_UNAVAILABLE', 'Classification is OPERATION_UNAVAILABLE');
  }

  // Test 14: Target application unknown
  {
    const res = await AutonomySupervisor.pursueGoal({
      goalId: 'goal_unknown_app',
      rawQuery: 'Render scene in Maya',
      targetApplication: 'maya_3d',
    });

    assert(res.state === 'UNSUPPORTED_GOAL', 'Unknown application rejected as UNSUPPORTED_GOAL');
    assert(res.error?.includes('not found') || false, 'Target application not found error returned');
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\nSECTION 5: Disconnection & Real Observation Handling');
  // ───────────────────────────────────────────────────────────────────────────

  // Test 15: Disconnected adapter reports APPLICATION_DISCONNECTED
  {
    blenderAdapter.setConnected(false);
    const res = await AutonomySupervisor.pursueGoal({
      goalId: 'goal_disconnect',
      rawQuery: 'Create cube primitive in Blender',
      targetApplication: 'blender',
    });

    assert(res.classification === 'APPLICATION_DISCONNECTED', 'Disconnected app reports APPLICATION_DISCONNECTED');
    assert(!res.success, 'Disconnected execution fails cleanly');
    blenderAdapter.setConnected(true);
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\nSECTION 6: Bounded Fresh-State Correction (Zero Blind Replay)');
  // ───────────────────────────────────────────────────────────────────────────

  // Test 16: Budget exhaustion during autonomous execution
  {
    const res = await AutonomySupervisor.pursueGoal({
      goalId: 'goal_budget_exhaust',
      rawQuery: 'Blender asset prep HeroAsset',
      targetApplication: 'blender',
      budget: { maxOperations: 1 }, // Workflow A has 5 steps; budget allows only 1
    });

    assert(res.state === 'BUDGET_EXHAUSTED', 'Autonomous run halts when operation budget exhausted');
    assert(res.classification === 'BUDGET_EXHAUSTED', 'Classification is BUDGET_EXHAUSTED');
    assert(res.budget.operationsUsed === 1, 'Operation usage strictly matches budget');
  }

  // Test 17: Emergency Abort halts execution immediately
  {
    EmergencyAbort.trigger('Test emergency abort');
    const res = await AutonomySupervisor.pursueGoal({
      goalId: 'goal_abort',
      rawQuery: 'Blender asset prep HeroAsset',
      targetApplication: 'blender',
    });

    assert(res.state === 'ABORTED', 'Supervisor enters ABORTED on emergency abort');
    assert(res.classification === 'ABORTED', 'Classification is ABORTED');
    EmergencyAbort.reset();
  }

  // ───────────────────────────────────────────────────────────────────────────
  console.log('\nSECTION 7: End-to-End Bounded Autonomous Goal Execution');
  // ───────────────────────────────────────────────────────────────────────────

  // Test 18: Autonomous Workflow A (Blender Asset Preparation)
  {
    const res = await AutonomySupervisor.pursueGoal({
      goalId: 'goal_wf_a',
      rawQuery: 'Run Blender asset prep for HeroAsset',
      targetApplication: 'blender',
      declaredInputs: {
        meshName: 'HeroAsset',
        materialName: 'HeroMaterial',
        renderOutputPath: 'C:\\renders\\hero_asset.png',
      },
    });

    assert(res.success, 'Workflow A completed successfully');
    assert(res.state === 'GOAL_MET', 'State transitioned to GOAL_MET');
    assert(res.classification === 'GOAL_ACCOMPLISHED', 'Classification is GOAL_ACCOMPLISHED');
    assert(res.outputArtifacts.length > 0, 'Output file artifact produced');
    assert(res.outputArtifacts[0].uri === 'C:\\renders\\hero_asset.png', 'File artifact URI is accurate');
    assert(res.decisions.length >= 5, 'Auditable decision traces logged for each step');
  }

  // Test 19: Autonomous Workflow B (Blender to After Effects Handoff)
  {
    const res = await AutonomySupervisor.pursueGoal({
      goalId: 'goal_wf_b',
      rawQuery: 'Execute Blender to AE handoff',
      declaredInputs: {
        meshName: 'BlenderModel',
        renderOutputPath: 'C:\\renders\\blender_render.png',
        compName: 'AE_Composite_Comp',
      },
    });

    assert(res.success, 'Workflow B completed successfully');
    assert(res.state === 'GOAL_MET', 'State is GOAL_MET');
    assert(res.classification === 'GOAL_ACCOMPLISHED', 'Classification is GOAL_ACCOMPLISHED');
  }

  // Test 20: Autonomous Workflow C (After Effects Production Export)
  {
    const res = await AutonomySupervisor.pursueGoal({
      goalId: 'goal_wf_c',
      rawQuery: 'Execute AE production export FinalExportComp',
      targetApplication: 'after_effects',
      declaredInputs: {
        compName: 'FinalExportComp',
        titleText: 'Rezel Intelligence',
        outputMoviePath: 'C:\\renders\\ae_output.mov',
      },
    });

    assert(res.success, 'Workflow C completed successfully');
    assert(res.state === 'GOAL_MET', 'State is GOAL_MET');
    assert(res.outputArtifacts.some((a) => a.uri === 'C:\\renders\\ae_output.mov'), 'Movie output artifact recorded');
  }

  // Test 21: Autonomous Workflow D (Parameterized Motion Graphics)
  {
    const res = await AutonomySupervisor.pursueGoal({
      goalId: 'goal_wf_d',
      rawQuery: 'Create motion graphic promo video in AE',
      targetApplication: 'after_effects',
      declaredInputs: {
        projectName: 'PromoVideo',
        headline: 'Next Gen OS',
        durationSeconds: 15,
      },
    });

    assert(res.success, 'Workflow D completed successfully');
    assert(res.state === 'GOAL_MET', 'State is GOAL_MET');
  }

  // Test 22: Autonomous Workflow E (Full Cross-App 3D to VFX Pipeline)
  {
    const res = await AutonomySupervisor.pursueGoal({
      goalId: 'goal_wf_e',
      rawQuery: 'Run full creative pipeline 3D to VFX SciFi_Core',
      declaredInputs: {
        modelName: 'SciFi_Core',
        blenderRenderPath: 'C:\\renders\\core_3d.png',
        finalExportPath: 'C:\\renders\\final_vfx.mov',
      },
    });

    assert(res.success, 'Workflow E completed successfully');
    assert(res.state === 'GOAL_MET', 'State is GOAL_MET');
    assert(res.outputArtifacts.some((a) => a.uri === 'C:\\renders\\final_vfx.mov'), 'Final movie file artifact produced');
  }

  // Test 23: Direct single-step autonomous capability execution with verification
  {
    const res = await AutonomySupervisor.pursueGoal({
      goalId: 'goal_direct_cube',
      rawQuery: 'Create cube primitive in Blender',
      targetApplication: 'blender',
    });

    assert(res.success, 'Direct capability execution succeeded');
    assert(res.state === 'GOAL_MET', 'State is GOAL_MET');
  }

  // Test 24: Decision trace verification & immutability
  {
    const res = await AutonomySupervisor.pursueGoal({
      goalId: 'goal_trace_check',
      rawQuery: 'Inspect After Effects project',
      targetApplication: 'after_effects',
    });

    assert(res.success, 'Inspect AE succeeded');
    assert(res.decisions.length >= 2, 'Multiple decision points recorded');
    for (const d of res.decisions) {
      assert(typeof d.timestamp === 'number', 'Decision has timestamp');
      assert(typeof d.reason === 'string', 'Decision has reason');
      assert(d.budgetRemaining !== undefined, 'Decision includes budget snapshot');
      assert(!d.reason.includes('<thinking>'), 'Zero CoT in decision trace');
    }
  }

  console.log('\n======================================================================');
  console.log(`PHASE 17 ACCEPTANCE SUITE RESULTS: ${passed}/${total} PASSED (100% SUCCESS)`);
  console.log('======================================================================\n');
}

runAcceptanceTests().catch((err) => {
  console.error('[FATAL] Phase 17 Acceptance Test Failure:', err);
  process.exit(1);
});
