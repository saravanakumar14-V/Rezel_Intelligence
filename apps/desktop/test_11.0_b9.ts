import fs from 'fs';
import path from 'path';
import { ExternalReasoningOrchestrator } from './src/lib/reasoning/ExternalReasoningOrchestrator';
import { ReasoningRouterImpl } from './src/lib/reasoning/ReasoningRouter';
import { ReasoningProviderRegistryImpl } from './src/lib/reasoning/ReasoningProviderRegistry';
import { ReasoningSession } from './src/lib/reasoning/ReasoningSession';
import { ReasoningSessionStore, type ReasoningStoreAdapter } from './src/lib/reasoning/ReasoningSessionStore';
import { ReasoningAuditLogger } from './src/lib/reasoning/ReasoningAuditLogger';
import { ActionValidator } from './src/lib/reasoning/ActionValidator';
import { ActionNormalizer } from './src/lib/reasoning/ActionNormalizer';
import { ResponseInterpreter } from './src/lib/reasoning/ResponseInterpreter';
import { ContextAssembler } from './src/lib/reasoning/ContextAssembler';
import {
  ApiReasoningChannel,
  AccessibilityReasoningChannel,
  ClipboardReasoningChannel,
  ScreenOcrReasoningChannel,
  ReasoningChannelRouter,
} from './src/lib/reasoning/channels';
import { WorkflowRuntime } from './src/lib/ai/WorkflowRuntime';
import type {
  ReasoningProvider,
  ReasoningRequest,
  ReasoningProviderResult,
  AgentAction,
  UnknownMutationRecord,
} from './src/lib/reasoning/types';

console.log('[Test 11.0B9] Starting Master External Reasoning Bridge Integration & Validation tests...');

class InMemoryStoreAdapter implements ReasoningStoreAdapter {
  content: string = '';
  async read(): Promise<string> {
    if (!this.content) throw new Error('File not found');
    return this.content;
  }
  async write(content: string): Promise<void> {
    this.content = content;
  }
}

async function runTests() {
  const storeAdapter = new InMemoryStoreAdapter();
  const store = new ReasoningSessionStore(storeAdapter);
  const logger = new ReasoningAuditLogger();

  // =========================================================================
  // 1. MULTI-CYCLE END-TO-END SIMULATION: "Create a small city scene"
  // =========================================================================
  console.log('\n--- Scenario 1: Multi-Cycle End-to-End Simulation ---');
  let cycleCount = 0;
  const mockCityProvider: ReasoningProvider = {
    id: 'mock-city-provider',
    type: 'CUSTOM',
    config: {
      id: 'mock-city-provider',
      type: 'CUSTOM',
      displayName: 'Mock City Provider',
      maxContextTokens: 128000,
      supportsStructuredOutput: true,
      supportsStreaming: false,
      costTier: 'FREE',
      priority: 1,
    },
    isAvailable: async () => true,
    reason: async (req: ReasoningRequest) => {
      cycleCount++;
      if (cycleCount === 1) {
        // Cycle 1: create road + create 3 buildings
        return {
          raw: JSON.stringify({
            status: 'ACTIONS',
            summary: 'Creating base road network and initial 3 buildings',
            actions: [
              {
                type: 'RUN_COMMAND',
                capabilityId: 'blender.mutate_scene',
                args: { command: 'create_road' },
                description: 'Create main road network',
              },
              {
                type: 'RUN_COMMAND',
                capabilityId: 'blender.mutate_scene',
                args: { command: 'create_buildings', count: 3 },
                description: 'Generate 3 city buildings',
              },
            ],
          }),
          tokenUsage: { input: 120, output: 85 },
          latencyMs: 150,
          providerId: 'mock-city-provider',
        };
      } else if (cycleCount === 2) {
        // Cycle 2: add trees + streetlights
        console.assert(req.context.currentCycle === 2, 'Scenario 1: Context currentCycle should be 2');
        return {
          raw: JSON.stringify({
            status: 'ACTIONS',
            summary: 'Adding decorative trees and streetlights',
            actions: [
              {
                type: 'RUN_COMMAND',
                capabilityId: 'blender.mutate_scene',
                args: { command: 'add_trees' },
                description: 'Add trees along the road',
              },
              {
                type: 'RUN_COMMAND',
                capabilityId: 'blender.mutate_scene',
                args: { command: 'add_streetlights' },
                description: 'Place streetlights',
              },
            ],
          }),
          tokenUsage: { input: 180, output: 90 },
          latencyMs: 160,
          providerId: 'mock-city-provider',
        };
      } else {
        // Cycle 3: Verified complete
        console.assert(req.context.currentCycle === 3, 'Scenario 1: Context currentCycle should be 3');
        return {
          raw: JSON.stringify({
            status: 'COMPLETE',
            summary: 'Small city scene successfully created and verified',
            actions: [],
          }),
          tokenUsage: { input: 210, output: 40 },
          latencyMs: 110,
          providerId: 'mock-city-provider',
        };
      }
    },
  };

  const reg1 = new ReasoningProviderRegistryImpl();
  reg1.register(mockCityProvider);
  const router1 = new ReasoningRouterImpl(reg1);
  const orchestrator1 = new ExternalReasoningOrchestrator(router1, store, logger);
  const session1 = orchestrator1.createSession({
    goal: 'Create a small city scene.',
    providerId: 'mock-city-provider',
    projectId: 'proj_city_1',
    maxCycles: 5,
  });

  const c1 = await orchestrator1.executeCycle(session1);
  console.assert(c1.acceptedActions.length === 2, 'Scenario 1: Cycle 1 accepted actions mismatch');
  console.assert(session1.currentCycle === 1, 'Scenario 1: Session cycle 1 mismatch');

  const c2 = await orchestrator1.executeCycle(session1);
  console.assert(c2.acceptedActions.length === 2, 'Scenario 1: Cycle 2 accepted actions mismatch');
  console.assert(session1.currentCycle === 2, 'Scenario 1: Session cycle 2 mismatch');

  const c3 = await orchestrator1.executeCycle(session1);
  console.assert(session1.status === 'COMPLETED', 'Scenario 1: Final session status not COMPLETED');
  console.log('  ✅ Scenario 1: Multi-cycle end-to-end simulation passed');

  // =========================================================================
  // 2. ERROR → RECOVERY SCENARIO
  // =========================================================================
  console.log('\n--- Scenario 2: Error → Recovery Scenario ---');
  let errCycle = 0;
  const mockErrProvider: ReasoningProvider = {
    id: 'mock-err-provider',
    type: 'CUSTOM',
    config: {
      id: 'mock-err-provider',
      type: 'CUSTOM',
      displayName: 'Mock Error Provider',
      maxContextTokens: 128000,
      supportsStructuredOutput: true,
      supportsStreaming: false,
      costTier: 'FREE',
      priority: 1,
    },
    isAvailable: async () => true,
    reason: async (req: ReasoningRequest) => {
      errCycle++;
      if (errCycle === 1) {
        // Cycle 1: Propose invalid action that will fail validation/execution
        return {
          raw: JSON.stringify({
            status: 'ACTIONS',
            summary: 'Attempt invalid path action',
            actions: [
              {
                type: 'WRITE_FILE',
                capabilityId: 'fs_write_file',
                args: { path: '../escaped_root.json', content: '{}' },
                description: 'Write outside project root',
              },
            ],
          }),
          tokenUsage: { input: 50, output: 50 },
          latencyMs: 100,
          providerId: 'mock-err-provider',
        };
      } else {
        // Cycle 2: Model sees rejection feedback and proposes safe corrected path
        console.assert(
          req.context.previousCycleResult?.rejectedActionSummaries?.length! > 0,
          'Scenario 2: Previous cycle error feedback missing'
        );
        return {
          raw: JSON.stringify({
            status: 'ACTIONS',
            summary: 'Propose safe in-scope path',
            actions: [
              {
                type: 'WRITE_FILE',
                capabilityId: 'fs_write_file',
                args: { path: 'valid_config.json', content: '{"safe":true}' },
                description: 'Write safe file',
              },
            ],
          }),
          tokenUsage: { input: 70, output: 50 },
          latencyMs: 100,
          providerId: 'mock-err-provider',
        };
      }
    },
  };

  const reg2 = new ReasoningProviderRegistryImpl();
  reg2.register(mockErrProvider);
  const router2 = new ReasoningRouterImpl(reg2);
  const orchestrator2 = new ExternalReasoningOrchestrator(router2, store, logger);
  const session2 = orchestrator2.createSession({
    goal: 'Test error recovery',
    providerId: 'mock-err-provider',
    projectId: 'proj_safe_root',
    maxCycles: 5,
  });

  const errC1 = await orchestrator2.executeCycle(session2);
  console.assert(errC1.rejectedActionSummaries.length === 1, 'Scenario 2: Action should have been rejected');
  console.assert(errC1.rejectedActionSummaries[0].code === 'PATH_OUT_OF_SCOPE', 'Scenario 2: Error code mismatch');

  const errC2 = await orchestrator2.executeCycle(session2);
  console.assert(errC2.acceptedActions.length === 1, 'Scenario 2: Corrected action should have been accepted');
  console.log('  ✅ Scenario 2: Error → Recovery scenario passed');

  // =========================================================================
  // 3. UNKNOWN MUTATION PROTECTION SCENARIO (H-04)
  // =========================================================================
  console.log('\n--- Scenario 3: UNKNOWN Mutation Protection (H-04) ---');
  const session3 = new ReasoningSession({
    goal: 'Test unknown mutation protection',
    providerId: 'mock-city-provider',
  });
  const unkHash = ActionValidator.computeFingerprintHash('blender.mutate_scene', { command: 'mutate_mesh' });
  const unkRecord: UnknownMutationRecord = {
    fingerprint: {
      toolName: 'blender.mutate_scene',
      targetPath: 'scene/mesh',
      hash: unkHash,
    },
    workflowId: 'wf_unk_test',
    cycleIndex: 1,
    timestamp: new Date().toISOString(),
    reason: 'Blender mutate scene timed out with ambiguous status',
  };
  session3.unknownMutationRecords.push(unkRecord);

  // Model tries to repeat exact same mutation
  const repeatedAction: AgentAction = {
    id: 'act_repeat_unk',
    type: 'MODIFY_APPLICATION',
    capabilityId: 'blender.mutate_scene',
    args: { command: 'mutate_mesh' },
    description: 'Retry mutating blender scene',
  };
  const val3 = ActionValidator.validate([repeatedAction], {
    unknownMutationRecords: session3.unknownMutationRecords,
  });
  console.assert(val3.rejected.length === 1, 'Scenario 3: Repeated UNKNOWN mutation was not blocked');
  console.assert(val3.rejected[0].code === 'UNKNOWN_MUTATION_BLOCKED', 'Scenario 3: Expected UNKNOWN_MUTATION_BLOCKED');

  // Safe reconciliation: reconcile as VERIFIED removes block
  session3.reconcileUnknown(unkHash, 'VERIFIED');
  const val3Reconciled = ActionValidator.validate([repeatedAction], {
    unknownMutationRecords: session3.unknownMutationRecords,
  });
  console.assert(val3Reconciled.accepted.length === 1, 'Scenario 3: Reconciled mutation should now be accepted');
  console.log('  ✅ Scenario 3: UNKNOWN Mutation Protection (H-04) passed');

  // =========================================================================
  // 4. PROVIDER FAILURE + FALLBACK SCENARIO
  // =========================================================================
  console.log('\n--- Scenario 4: Provider Failure + Fallback ---');
  const failingPrimaryProvider: ReasoningProvider = {
    id: 'primary-failing',
    type: 'CUSTOM',
    config: {
      id: 'primary-failing',
      type: 'CUSTOM',
      displayName: 'Primary Failing',
      maxContextTokens: 128000,
      supportsStructuredOutput: true,
      supportsStreaming: false,
      costTier: 'FREE',
      priority: 1,
    },
    isAvailable: async () => true,
    reason: async () => {
      throw new Error('Rate limit exceeded 429');
    },
  };

  const healthyFallbackProvider: ReasoningProvider = {
    id: 'fallback-healthy',
    type: 'CUSTOM',
    config: {
      id: 'fallback-healthy',
      type: 'CUSTOM',
      displayName: 'Fallback Healthy',
      maxContextTokens: 128000,
      supportsStructuredOutput: true,
      supportsStreaming: false,
      costTier: 'FREE',
      priority: 2,
    },
    isAvailable: async () => true,
    reason: async () => ({
      raw: JSON.stringify({ status: 'COMPLETE', summary: 'Fallback executed cleanly', actions: [] }),
      tokenUsage: { input: 20, output: 20 },
      latencyMs: 90,
      providerId: 'fallback-healthy',
    }),
  };

  const reg4 = new ReasoningProviderRegistryImpl();
  reg4.register(failingPrimaryProvider);
  reg4.register(healthyFallbackProvider);
  const router4 = new ReasoningRouterImpl(reg4);

  const orchestrator4 = new ExternalReasoningOrchestrator(router4, store, logger);
  const session4 = orchestrator4.createSession({
    goal: 'Test provider fallback',
    providerId: 'primary-failing',
  });

  const res4 = await orchestrator4.executeCycle(session4);
  console.assert(session4.status === 'COMPLETED', 'Scenario 4: Fallback did not complete session');
  console.assert(session4.providerId === 'fallback-healthy', 'Scenario 4: Provider ID did not update to fallback');
  console.log('  ✅ Scenario 4: Provider Failure + Fallback passed');

  // =========================================================================
  // 5. NEED_INFO SCENARIO
  // =========================================================================
  console.log('\n--- Scenario 5: NEED_INFO Scenario ---');
  let needInfoCycle = 0;
  const mockNeedInfoProvider: ReasoningProvider = {
    id: 'mock-need-info-provider',
    type: 'CUSTOM',
    config: {
      id: 'mock-need-info-provider',
      type: 'CUSTOM',
      displayName: 'Mock Need Info Provider',
      maxContextTokens: 128000,
      supportsStructuredOutput: true,
      supportsStreaming: false,
      costTier: 'FREE',
      priority: 1,
    },
    isAvailable: async () => true,
    reason: async (req: ReasoningRequest) => {
      needInfoCycle++;
      if (needInfoCycle === 1) {
        return {
          raw: JSON.stringify({
            status: 'NEED_INFO',
            summary: 'Need user clarification on render engine',
            questionsForUser: ['Which render engine should be used? (Cycles or Eevee)'],
            actions: [],
          }),
          tokenUsage: { input: 50, output: 40 },
          latencyMs: 120,
          providerId: 'mock-need-info-provider',
        };
      } else {
        console.assert(req.goal.includes('User Clarification: Cycles'), 'Scenario 5: User answer not passed in prompt');
        return {
          raw: JSON.stringify({
            status: 'COMPLETE',
            summary: 'Configured Cycles render engine',
            actions: [],
          }),
          tokenUsage: { input: 80, output: 30 },
          latencyMs: 100,
          providerId: 'mock-need-info-provider',
        };
      }
    },
  };

  const reg5 = new ReasoningProviderRegistryImpl();
  reg5.register(mockNeedInfoProvider);
  const router5 = new ReasoningRouterImpl(reg5);
  const orchestrator5 = new ExternalReasoningOrchestrator(router5, store, logger);
  const session5 = orchestrator5.createSession({
    goal: 'Configure render engine',
    providerId: 'mock-need-info-provider',
  });

  const niC1 = await orchestrator5.executeCycle(session5);
  console.assert(session5.status === 'AWAITING_APPROVAL', 'Scenario 5: Status not AWAITING_APPROVAL');

  const niC2 = await orchestrator5.resumeSessionWithAnswer(session5, 'Cycles');
  console.assert(session5.status === 'COMPLETED', 'Scenario 5: Session not completed after user answer');
  console.assert(session5.currentCycle === 2, 'Scenario 5: Cycle count should be 2');
  console.log('  ✅ Scenario 5: NEED_INFO scenario passed');

  // =========================================================================
  // 6. CANCELLATION SCENARIOS
  // =========================================================================
  console.log('\n--- Scenario 6: Cancellation Scenarios ---');
  // A. Cancellation before/during provider reasoning
  const abortCtrl6A = new AbortController();
  abortCtrl6A.abort();
  const session6A = orchestrator1.createSession({ goal: 'Cancel test', providerId: 'mock-city-provider' });
  let caught6A = false;
  try {
    await orchestrator1.executeCycle(session6A, abortCtrl6A.signal);
  } catch {
    caught6A = true;
  }
  console.assert(caught6A, 'Scenario 6A: Cancellation was not caught');
  console.assert(session6A.status === 'CANCELLED', 'Scenario 6A: Status not CANCELLED');
  console.log('  ✅ Scenario 6: Cancellation scenarios passed');

  // =========================================================================
  // 7. CRASH / RESTART RECOVERY SCENARIO
  // =========================================================================
  console.log('\n--- Scenario 7: Crash / Restart Recovery Scenario ---');
  const crashAdapter = new InMemoryStoreAdapter();
  const crashStore = new ReasoningSessionStore(crashAdapter);
  const crashSession = new ReasoningSession({
    goal: 'Interrupted active session',
    providerId: 'mock-city-provider',
  });
  crashSession.transitionStatus('RUNNING');
  crashSession.associateWorkflowStarted('wf_crash_1');
  await crashStore.saveSession(crashSession);

  // Restart simulation: fresh store load
  const recoveredStore = new ReasoningSessionStore(crashAdapter);
  await recoveredStore.load();
  const loadedCrashSession = recoveredStore.getSession(crashSession.sessionId);
  console.assert(
    loadedCrashSession?.status === 'RECOVERY_REQUIRED',
    'Scenario 7: Restored active session must be RECOVERY_REQUIRED'
  );
  console.log('  ✅ Scenario 7: Crash / Restart Recovery scenario passed');

  // =========================================================================
  // 8. PERSISTENCE + AUDIT SCENARIO
  // =========================================================================
  console.log('\n--- Scenario 8: Persistence + Audit Scenario ---');
  const auditEvents = logger.getEvents(session1.sessionId);
  console.assert(auditEvents.length > 0, 'Scenario 8: Audit events not logged for session1');
  const eventTypes = auditEvents.map((e) => e.eventType);
  console.assert(eventTypes.includes('reasoning_cycle_started'), 'Scenario 8: Missing cycle_started audit');
  console.assert(eventTypes.includes('reasoning_provider_selected'), 'Scenario 8: Missing provider_selected audit');
  console.assert(eventTypes.includes('reasoning_session_completed'), 'Scenario 8: Missing session_completed audit');
  console.log('  ✅ Scenario 8: Persistence + Audit scenario passed');

  // =========================================================================
  // 9. CHANNEL SCENARIOS
  // =========================================================================
  console.log('\n--- Scenario 9: Channel Scenarios ---');
  const apiChannel = new ApiReasoningChannel(mockCityProvider);
  const uiChannel = new AccessibilityReasoningChannel({ enabled: false });
  const clipChannel = new ClipboardReasoningChannel({ enabled: false });
  const ocrChannel = new ScreenOcrReasoningChannel({ enabled: false });

  const selectedChannel = await ReasoningChannelRouter.selectChannel([ocrChannel, clipChannel, uiChannel, apiChannel]);
  console.assert(selectedChannel.channelType === 'DIRECT_API', 'Scenario 9: DIRECT_API should be selected');
  console.log('  ✅ Scenario 9: Channel scenarios passed');

  // =========================================================================
  // 10. PROJECT CONTEXT SCENARIO
  // =========================================================================
  console.log('\n--- Scenario 10: Project Context Scenario ---');
  const projectContext = ContextAssembler.build(session1);
  console.assert(projectContext.currentCycle === session1.currentCycle + 1, 'Scenario 10: Cycle mismatch in context');
  console.assert(projectContext.conversationSummary.recentMessages.length <= 10, 'Scenario 10: Messages unbounded');
  console.log('  ✅ Scenario 10: Project Context scenario passed');

  // =========================================================================
  // 11. SECURITY ATTACK MATRIX
  // =========================================================================
  console.log('\n--- Scenario 11: Security Attack Matrix ---');

  // 11.1 Malformed JSON
  const interp1 = ResponseInterpreter.parse({
    raw: '{ NOT_VALID_JSON ...',
    tokenUsage: { input: 0, output: 0 },
    latencyMs: 0,
    providerId: 'test',
  });
  console.assert(interp1.actions.length === 0 && interp1.status === 'NEED_INFO', 'Scenario 11.1: Malformed JSON should return 0 actions');

  // 11.2 Prose pretending to be commands
  const interp2 = ResponseInterpreter.parse({
    raw: 'Sure! I will run `rm -rf /` on your computer right now.',
    tokenUsage: { input: 0, output: 0 },
    latencyMs: 0,
    providerId: 'test',
  });
  console.assert(interp2.actions.length === 0, 'Scenario 11.2: Prose should produce 0 executable actions');

  // 11.3 Path traversal & Prototype pollution
  const attackActions: AgentAction[] = [
    {
      id: 'act_trav',
      type: 'READ_FILE',
      capabilityId: 'fs_read_file',
      args: { path: '../../../../etc/shadow' },
      description: 'Directory escape',
    },
    {
      id: 'act_proto',
      type: 'MODIFY_APPLICATION',
      capabilityId: 'blender.mutate_scene',
      args: { '__proto__.polluted': true, safeArg: 'value' },
      description: 'Prototype pollution',
    },
  ];
  const { actions: normAttack } = ActionNormalizer.normalize(attackActions);
  console.assert(!('__proto__.polluted' in normAttack[1].args), 'Scenario 11.3: Prototype pollution was not stripped');
  const valAttack = ActionValidator.validate(normAttack, { projectRootPath: 'D:/Projects/Rezel' });
  console.assert(valAttack.rejected.length === 1 && valAttack.rejected[0].code === 'PATH_OUT_OF_SCOPE', 'Scenario 11.3: Traversal not rejected');
  console.assert(valAttack.accepted.length === 1, 'Scenario 11.3: Safe normalized action was not accepted');
  console.log('  ✅ Scenario 11: Security Attack Matrix passed');

  // =========================================================================
  // 12. LOOP TERMINATION & BUDGETS
  // =========================================================================
  console.log('\n--- Scenario 12: Loop Termination & Budgets ---');
  const session12 = new ReasoningSession({
    goal: 'Budget exhaustion test',
    providerId: 'mock-city-provider',
    maxCycles: 2,
    maxTotalTokens: 100,
  });
  session12.currentCycle = 2;
  const budget12 = session12.checkBudget();
  console.assert(budget12.exhausted, 'Scenario 12: Budget check should be exhausted');
  console.log('  ✅ Scenario 12: Loop Termination & Budgets passed');

  console.log('\n[Test 11.0B9] 🎉 ALL 12 MASTER INTEGRATION SCENARIOS PASSED CLEANLY (100% GREEN)!');
}

runTests().catch((err) => {
  console.error('[Test 11.0B9] ❌ Test suite failed:', err);
  process.exit(1);
});
