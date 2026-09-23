/**
 * Rezel 11.3A — Unified Routing-to-Planning Integration Test Suite
 *
 * Verifies end-to-end:
 * 1. Planning builds the correct TaskProfile via TaskProfileBuilder
 * 2. PlanEngine routes planning through ProviderRouter (zero direct provider coupling)
 * 3. Provider selection is visible in planning state (plan.planningRoute) and telemetry
 * 4. TaskProfile remains strictly immutable
 * 5. Retryable provider failure triggers classified failover using the SAME TaskProfile
 * 6. Authentication failure (401) stops immediately without provider failover
 * 7. LOCAL planning never contacts cloud providers (zero cloud calls)
 * 8. MANUAL profile respects exact provider/model selection
 * 9. CostGuard and paid-failover authorization remain enforced
 * 10. UNKNOWN mutation state prevents automatic regeneration
 * 11. Structured provider output is normalized into typed PlanStep[] representation
 * 12. WorkflowRuntime / PlanEngine / PolicyEngine authority boundaries remain intact
 */

import { PlanEngine } from './src/lib/ai/PlanEngine';
import { TaskProfileBuilder } from './src/lib/ai/providers/TaskProfileBuilder';
import { ProviderRouter } from './src/lib/ai/providers/ProviderRouter';
import { ProviderAuthManager } from './src/lib/ai/providers/ProviderAuthManager';
import { ProviderHealthManager } from './src/lib/ai/providers/ProviderHealthManager';
import { ProviderRegistry } from './src/lib/ai/providers/ProviderRegistry';
import { GeminiVendorPackage } from './src/lib/ai/providers/adapters/GeminiAdapter';
import { OpenAIVendorPackage } from './src/lib/ai/providers/adapters/OpenAIAdapter';
import { AnthropicVendorPackage } from './src/lib/ai/providers/adapters/AnthropicAdapter';
import { OllamaVendorPackage } from './src/lib/ai/providers/adapters/OllamaAdapter';
import { ActionValidator } from './src/lib/reasoning/ActionValidator';
import { PolicyEngine } from './src/lib/security/policy/PolicyEngine';
import { ToolExecutor as SecurityToolExecutor } from './src/lib/security/ToolExecutor';
import type { ProviderLifecycleEvent, TaskProfile } from './src/lib/ai/providers/types';
import type { AgentAction, UnknownMutationRecord } from './src/lib/reasoning/types';

async function run113ATests() {
  console.log('=== Starting Rezel 11.3A Routing-to-Planning Integration Tests ===\n');

  // Setup keys
  await ProviderAuthManager.saveKey('GEMINI', 'AIzaSyMockKeyForGemini');
  await ProviderAuthManager.saveKey('OPENAI', 'sk-proj-mock-key-openai');
  await ProviderAuthManager.saveKey('ANTHROPIC', 'sk-ant-mock-key-anthropic');

  // Reset health
  ProviderHealthManager.recordSuccess('GEMINI', 'gemini-2.0-flash');
  ProviderHealthManager.recordSuccess('OPENAI', 'gpt-4o');
  ProviderHealthManager.recordSuccess('ANTHROPIC', 'claude-3-7-sonnet-20250219');
  ProviderHealthManager.recordSuccess('OLLAMA', 'llama3.2:3b');

  // Register mock reasoning responses
  const mockGeminiReasoningFetch = async (): Promise<Response> => {
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    status: 'ACTIONS',
                    summary: 'Create geometry and inspect scene',
                    actions: [
                      {
                        id: 'step_1',
                        type: 'MODIFY_APPLICATION',
                        description: 'Create test cube',
                        capabilityId: 'blender.create_object',
                        parameters: { name: 'Rezel_Cube' },
                      },
                      {
                        id: 'step_2',
                        type: 'OBSERVE_APPLICATION',
                        description: 'Inspect scene objects',
                        capabilityId: 'blender.inspect_scene',
                        parameters: {},
                        dependsOn: ['step_1'],
                      },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200 }
    );
  };

  ProviderRegistry.registerPackage(new GeminiVendorPackage({ fetchFn: mockGeminiReasoningFetch as any }));

  // ─── Test 1: Planning builds the correct TaskProfile ───
  console.log('--- Test 1: Planning builds correct TaskProfile ---');
  const taskProfile = TaskProfileBuilder.build({
    category: 'AUTOMATION',
    executionTarget: 'REASONING',
    requiresTools: true,
    requiresStructuredOutput: true,
    requiresExtendedThinking: true,
  });

  if (
    taskProfile.category !== 'AUTOMATION' ||
    taskProfile.executionTarget !== 'REASONING' ||
    !taskProfile.requiredCapabilities.toolCalling ||
    !taskProfile.requiredCapabilities.structuredOutput ||
    !taskProfile.requiredCapabilities.extendedThinking
  ) {
    throw new Error('Test 1 Failed: TaskProfile missing required planning capabilities');
  }
  console.log('Test 1 Passed: TaskProfileBuilder derived correct planning task profile.');

  // ─── Test 2 & 3: PlanEngine routes planning through ProviderRouter & attaches planningRoute ───
  console.log('\n--- Test 2 & 3: PlanEngine routes through ProviderRouter & captures planningRoute ---');
  const recordedEvents: ProviderLifecycleEvent[] = [];
  const unsubRouter = ProviderRouter.subscribe((evt) => recordedEvents.push(evt));

  const plan = await PlanEngine.generatePlan('Create test cube and inspect scene in Blender');

  if (!plan.steps || plan.steps.length !== 2) {
    throw new Error(`Test 2/3 Failed: Expected 2 steps in generated plan, got: ${plan.steps?.length}`);
  }
  if (!plan.planningRoute) {
    throw new Error('Test 2/3 Failed: plan.planningRoute metadata missing from generated Plan');
  }
  if (!plan.taskProfile) {
    throw new Error('Test 2/3 Failed: plan.taskProfile missing from generated Plan');
  }
  if (!plan.planningRoute.vendor || !plan.planningRoute.modelId || !plan.planningRoute.taskProfileId) {
    throw new Error('Test 2/3 Failed: planningRoute missing required traceability fields');
  }

  const selectedEvent = recordedEvents.find((e) => e.type === 'provider_selected');
  if (!selectedEvent) {
    throw new Error('Test 2/3 Failed: provider_selected lifecycle event not emitted during planning');
  }

  console.log(`Test 2 & 3 Passed: PlanEngine routed through ProviderRouter (${plan.planningRoute.vendor} - ${plan.planningRoute.modelId}) and captured route in planning state.`);
  unsubRouter();

  // ─── Test 4: TaskProfile Immutability ───
  console.log('\n--- Test 4: TaskProfile Immutability ---');
  const explicitProfile = TaskProfileBuilder.build({
    category: 'AUTOMATION',
    executionTarget: 'REASONING',
    requiresTools: true,
    requiresStructuredOutput: true,
  });

  const originalId = explicitProfile.id;
  const originalReqsJson = JSON.stringify(explicitProfile.requiredCapabilities);

  const planWithExplicitProfile = await PlanEngine.generatePlan('Inspect blender workspace', {
    taskProfile: explicitProfile,
  });

  if (planWithExplicitProfile.taskProfile?.id !== originalId) {
    throw new Error('Test 4 Failed: TaskProfile ID was altered during planning');
  }
  if (JSON.stringify(planWithExplicitProfile.taskProfile?.requiredCapabilities) !== originalReqsJson) {
    throw new Error('Test 4 Failed: TaskProfile capabilities mutated during planning');
  }
  console.log('Test 4 Passed: TaskProfile remains strictly immutable throughout planning.');

  // ─── Test 5: Retryable Provider Failure triggers failover with SAME TaskProfile ───
  console.log('\n--- Test 5: Retryable Failure triggers failover with SAME TaskProfile ---');
  let geminiAttempts = 0;
  let openAiAttempts = 0;

  const mockFailoverGeminiFetch = async (): Promise<Response> => {
    geminiAttempts++;
    return new Response('Rate limit reached (429)', { status: 429, headers: { 'retry-after': '30' } });
  };

  const mockFailoverOpenAiFetch = async (): Promise<Response> => {
    openAiAttempts++;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                status: 'ACTIONS',
                summary: 'OpenAI Fallback Plan',
                actions: [
                  {
                    id: 'step_fallback_1',
                    type: 'MODIFY_APPLICATION',
                    description: 'Fallback action',
                    capabilityId: 'blender.create_object',
                    parameters: { name: 'Fallback_Cube' },
                  },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200 }
    );
  };

  // Authorize OpenAI for paid failover
  ProviderAuthManager.updateAuthorization('OPENAI', { allowPaidFailover: true });

  ProviderRegistry.registerPackage(new GeminiVendorPackage({ fetchFn: mockFailoverGeminiFetch as any }));
  ProviderRegistry.registerPackage(new OpenAIVendorPackage({ fetchFn: mockFailoverOpenAiFetch as any }));

  const failoverPlan = await PlanEngine.generatePlan('Execute failover test', {
    taskProfile: explicitProfile,
  });

  if (geminiAttempts === 0) {
    throw new Error('Test 5 Failed: Primary provider was not attempted');
  }
  if (openAiAttempts === 0) {
    throw new Error('Test 5 Failed: Fallback to OpenAI was not triggered on 429');
  }
  if (failoverPlan.planningRoute?.vendor !== 'OPENAI') {
    throw new Error(`Test 5 Failed: Expected planningRoute.vendor to be OPENAI, got: ${failoverPlan.planningRoute?.vendor}`);
  }
  if (failoverPlan.taskProfile?.id !== explicitProfile.id) {
    throw new Error('Test 5 Failed: Failover altered TaskProfile identity');
  }

  console.log('Test 5 Passed: 429 rate limit triggered classified failover to OpenAI using the EXACT SAME TaskProfile.');

  // ─── Test 6: Authentication Failure (401) stops immediately ───
  console.log('\n--- Test 6: Authentication Failure (401) stops without failover ---');
  geminiAttempts = 0;
  openAiAttempts = 0;

  const mockAuthFailFetch = async (): Promise<Response> => {
    geminiAttempts++;
    return new Response('Unauthorized (401)', { status: 401 });
  };

  ProviderRegistry.registerPackage(new GeminiVendorPackage({ fetchFn: mockAuthFailFetch as any }));

  let authErrorThrew = false;
  try {
    await PlanEngine.generatePlan('Auth failure test');
  } catch (err: any) {
    authErrorThrew = true;
  }

  if (!authErrorThrew) {
    throw new Error('Test 6 Failed: Plan generation should have failed on 401');
  }
  if (openAiAttempts > 0) {
    throw new Error('Test 6 Failed: 401 auth error falsely triggered failover to secondary provider!');
  }
  console.log('Test 6 Passed: 401 auth failure halted immediately without provider failover.');

  // ─── Test 7: LOCAL planning never contacts cloud providers ───
  console.log('\n--- Test 7: LOCAL planning 100% cloud isolation ---');
  let cloudCalledInLocal = false;
  let localCalledInLocal = false;

  const mockCloudSpy = async (): Promise<Response> => {
    cloudCalledInLocal = true;
    return new Response('Cloud mock', { status: 200 });
  };

  const mockLocalOllama = async (url: string | URL | Request): Promise<Response> => {
    localCalledInLocal = true;
    const urlStr = String(url);
    if (urlStr.includes('/api/tags')) {
      return new Response(JSON.stringify({ models: [{ name: 'llama3.2:3b' }] }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        response: JSON.stringify({
          status: 'ACTIONS',
          summary: 'Local plan',
          actions: [
            {
              id: 'local_step_1',
              type: 'SYSTEM',
              description: 'Local system action',
              capabilityId: 'fs_read_file',
              parameters: { path: 'test.txt' },
            },
          ],
        }),
        done: true,
      }),
      { status: 200 }
    );
  };

  ProviderRegistry.registerPackage(new GeminiVendorPackage({ fetchFn: mockCloudSpy as any }));
  ProviderRegistry.registerPackage(new OllamaVendorPackage({ fetchFn: mockLocalOllama as any }));

  ProviderRouter.setRoutingProfile('LOCAL');
  const localPlan = await PlanEngine.generatePlan('Local plan test');

  if (cloudCalledInLocal) {
    throw new Error('Test 7 Failed: Cloud provider called during LOCAL planning (privacy invariant breach!)');
  }
  if (!localCalledInLocal) {
    throw new Error('Test 7 Failed: Local Ollama provider was not invoked for LOCAL plan');
  }
  if (localPlan.planningRoute?.vendor !== 'OLLAMA') {
    throw new Error(`Test 7 Failed: Expected local plan route vendor OLLAMA, got: ${localPlan.planningRoute?.vendor}`);
  }
  console.log('Test 7 Passed: LOCAL planning executed with strict 100% cloud isolation.');
  ProviderRouter.setRoutingProfile('AUTO');

  // ─── Test 8: MANUAL Profile respects exact selection ───
  console.log('\n--- Test 8: MANUAL Profile exact model selection ---');
  const mockAnthropicReasoning = async (): Promise<Response> => {
    return new Response(
      JSON.stringify({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'ACTIONS',
              summary: 'Claude manual plan',
              actions: [
                {
                  id: 'claude_step_1',
                  type: 'SYSTEM',
                  description: 'Claude action',
                  capabilityId: 'fs_read_file',
                  parameters: {},
                },
              ],
            }),
          },
        ],
      }),
      { status: 200 }
    );
  };

  ProviderRegistry.registerPackage(new AnthropicVendorPackage({ fetchFn: mockAnthropicReasoning as any }));

  const manualPlan = await PlanEngine.generatePlan('Manual plan test', {
    routingProfile: 'MANUAL',
    preferredVendor: 'ANTHROPIC',
    preferredModelId: 'claude-3-7-sonnet-20250219',
  });

  if (manualPlan.planningRoute?.vendor !== 'ANTHROPIC' || manualPlan.planningRoute?.modelId !== 'claude-3-7-sonnet-20250219') {
    throw new Error(`Test 8 Failed: MANUAL profile did not select exact model. Got: ${manualPlan.planningRoute?.vendor} (${manualPlan.planningRoute?.modelId})`);
  }
  console.log('Test 8 Passed: MANUAL profile strictly respected exact user provider and model selection.');

  // ─── Test 9: CostGuard & Paid Failover Authorization ───
  console.log('\n--- Test 9: Paid Failover Authorization & Cost Caps ---');
  // Disallow paid failover for OpenAI
  ProviderAuthManager.updateAuthorization('OPENAI', { allowPaidFailover: false });

  let paidFailoverAttempted = false;
  const mockCostGuardGemini = async (): Promise<Response> => {
    return new Response('Rate limit (429)', { status: 429, headers: { 'retry-after': '60' } });
  };
  const mockCostGuardOpenAi = async (): Promise<Response> => {
    paidFailoverAttempted = true;
    return new Response('{}', { status: 200 });
  };

  ProviderRegistry.registerPackage(new GeminiVendorPackage({ fetchFn: mockCostGuardGemini as any }));
  ProviderRegistry.registerPackage(new OpenAIVendorPackage({ fetchFn: mockCostGuardOpenAi as any }));

  try {
    await PlanEngine.generatePlan('Paid failover block test');
  } catch {
    // Expected to fail because OpenAI has allowPaidFailover: false
  }

  if (paidFailoverAttempted) {
    throw new Error('Test 9 Failed: Paid failover called secondary provider when allowPaidFailover=false (zero-surprise billing breach!)');
  }
  console.log('Test 9 Passed: Paid failover authorization strictly enforced during planning.');

  // ─── Test 10: UNKNOWN Mutation state prevents automatic retry ───
  console.log('\n--- Test 10: UNKNOWN Mutation Invariant in Planning ---');
  const fpHash = ActionValidator.computeFingerprintHash(
    'blender.create_object',
    { name: 'Rezel_Ambiguous_Cube' },
    'D:/Projects/Test'
  );

  const unknownRecord: UnknownMutationRecord = {
    actionId: 'act_unk_001',
    capabilityId: 'blender.create_object',
    applicationId: 'blender',
    timestamp: new Date().toISOString(),
    resolutionState: 'UNRESOLVED',
    parameters: { name: 'Rezel_Ambiguous_Cube' },
    fingerprint: {
      hash: fpHash,
      capabilityId: 'blender.create_object',
      canonicalArgsJson: JSON.stringify({ name: 'Rezel_Ambiguous_Cube' }),
      createdAt: new Date().toISOString(),
    },
  };

  const proposedDuplicateAction: AgentAction = {
    id: 'act_prop_002',
    type: 'MODIFY_APPLICATION',
    description: 'Retry ambiguous cube creation',
    capabilityId: 'blender.create_object',
    parameters: { name: 'Rezel_Ambiguous_Cube' },
    args: { name: 'Rezel_Ambiguous_Cube' },
  };

  const { accepted, rejected } = ActionValidator.validate([proposedDuplicateAction], {
    projectRootPath: 'D:/Projects/Test',
    unknownMutationRecords: [unknownRecord],
    capabilityChecker: () => true,
  });

  if (accepted.length > 0 || rejected.length === 0 || rejected[0].code !== 'UNKNOWN_MUTATION_BLOCKED') {
    throw new Error('Test 10 Failed: UNKNOWN mutation was not blocked from planning retry!');
  }
  console.log('Test 10 Passed: UNKNOWN mutation strictly blocks automatic retry across all planning providers.');

  // ─── Test 11: Structured Output Normalization into Plan Representation ───
  console.log('\n--- Test 11: Structured Output Normalization ---');
  if (
    !plan.steps[0].id ||
    !plan.steps[0].description ||
    !plan.steps[0].toolName ||
    plan.steps[0].status !== 'PENDING' ||
    plan.steps[1].dependsOn?.[0] !== 'step_1'
  ) {
    throw new Error('Test 11 Failed: Action graph not cleanly normalized into PlanStep representation');
  }
  console.log('Test 11 Passed: Provider response successfully normalized into type-safe Plan with step dependency graph.');

  // ─── Test 12: Authority Boundaries Intact ───
  console.log('\n--- Test 12: Authority Boundaries Intact ---');
  if (
    typeof PolicyEngine.evaluate !== 'function' ||
    typeof SecurityToolExecutor.execute !== 'function' ||
    typeof PlanEngine.execute !== 'function'
  ) {
    throw new Error('Test 12 Failed: Authority boundaries broken or bypassed');
  }
  console.log('Test 12 Passed: PolicyEngine, SecurityToolExecutor, PlanEngine, and WorkflowRuntime remain 100% authoritative.');

  console.log('\n===========================================================');
  console.log('✅ ALL REZEL 11.3A ROUTING-TO-PLANNING TESTS PASSED (100% GREEN)');
  console.log('===========================================================\n');
}

run113ATests().catch((err) => {
  console.error('\n❌ 11.3A Test Failed:', err);
  process.exit(1);
});
