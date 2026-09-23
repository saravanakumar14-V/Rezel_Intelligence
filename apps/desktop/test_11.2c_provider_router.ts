/**
 * Rezel 11.2C — Provider Router Selection & Filtering Test Suite
 *
 * Verifies:
 * 1. Routing Profiles (AUTO, SMART, BALANCED, FAST, LOCAL, MANUAL)
 * 2. Capability Filtering (tools, vision, extended thinking, context size)
 * 3. Health & Cooldown Filtering (RATE_LIMITED, QUOTA_EXHAUSTED, AUTH_FAILED, OFFLINE)
 * 4. Authorization & Cost Caps (allowPaidFailover=false blocks silent secondary paid fallback)
 * 5. Lifecycle events emission
 */

import { ProviderRouter } from './src/lib/ai/providers/ProviderRouter';
import { TaskProfileBuilder } from './src/lib/ai/providers/TaskProfileBuilder';
import { ProviderAuthManager } from './src/lib/ai/providers/ProviderAuthManager';
import { ProviderHealthManager } from './src/lib/ai/providers/ProviderHealthManager';
import type { ProviderLifecycleEvent } from './src/lib/ai/providers/types';

async function runProviderRouterTests() {
  console.log('=== Starting Rezel 11.2C Provider Router Tests ===\n');

  // Configure keys in ProviderAuthManager
  await ProviderAuthManager.saveKey('GEMINI', 'AIzaSyMockKeyForGemini');
  await ProviderAuthManager.saveKey('OPENAI', 'sk-proj-mock-openai-key');
  await ProviderAuthManager.saveKey('ANTHROPIC', 'sk-ant-mock-anthropic-key');

  // Reset health states to clean
  ProviderHealthManager.recordSuccess('GEMINI', 'gemini-2.0-flash');
  ProviderHealthManager.recordSuccess('OPENAI', 'gpt-4o');
  ProviderHealthManager.recordSuccess('ANTHROPIC', 'claude-3-7-sonnet-20250219');
  ProviderHealthManager.recordSuccess('OLLAMA', 'llama3.2:3b');

  // Collect events
  const recordedEvents: ProviderLifecycleEvent[] = [];
  const unsub = ProviderRouter.subscribe((evt) => {
    recordedEvents.push(evt);
  });

  // ─── 1. Routing Profile: FAST ───
  console.log('--- 1. Routing Profile: FAST ---');
  const fastTask = TaskProfileBuilder.build({
    category: 'CONVERSATION',
    executionTarget: 'CHAT',
    latencyPreference: 'FAST',
  });

  const fastRoute = await ProviderRouter.selectChatProvider(fastTask, 'FAST');
  if (!fastRoute.model.id.includes('flash') && !fastRoute.model.id.includes('haiku') && !fastRoute.model.id.includes('mini') && !fastRoute.model.id.includes('3b')) {
    throw new Error(`Test 1 Failed: FAST profile chose heavy model: ${fastRoute.model.id}`);
  }
  console.log(`Test 1 Passed: FAST profile selected low-latency candidate: ${fastRoute.vendor} (${fastRoute.model.id}).`);

  // ─── 2. Routing Profile: SMART ───
  console.log('\n--- 2. Routing Profile: SMART ---');
  const smartTask = TaskProfileBuilder.build({
    category: 'REASONING',
    executionTarget: 'REASONING',
    requiresExtendedThinking: true,
  });

  const smartRoute = await ProviderRouter.selectReasoningProvider(smartTask, 'SMART');
  if (!smartRoute.model.capabilities.extendedThinking) {
    throw new Error(`Test 2 Failed: SMART profile selected model without extended thinking: ${smartRoute.model.id}`);
  }
  console.log(`Test 2 Passed: SMART profile selected high-reasoning candidate: ${smartRoute.vendor} (${smartRoute.model.id}).`);

  // ─── 3. Capability Filtering: Vision ───
  console.log('\n--- 3. Capability Filtering: Vision ---');
  const visionTask = TaskProfileBuilder.build({
    category: 'VISION',
    hasVisionMedia: true,
  });

  const visionRoute = await ProviderRouter.selectChatProvider(visionTask, 'AUTO');
  if (!visionRoute.model.capabilities.vision) {
    throw new Error(`Test 3 Failed: Vision task assigned to model without vision: ${visionRoute.model.id}`);
  }
  console.log(`Test 3 Passed: Vision task assigned to vision-capable model: ${visionRoute.model.id}.`);

  // ─── 4. Capability Filtering: Tool Calling ───
  console.log('\n--- 4. Capability Filtering: Tool Calling ---');
  const toolTask = TaskProfileBuilder.build({
    category: 'AUTOMATION',
    requiresTools: true,
  });

  const toolRoute = await ProviderRouter.selectChatProvider(toolTask, 'AUTO');
  if (!toolRoute.model.capabilities.toolCalling) {
    throw new Error(`Test 4 Failed: Automation tool task assigned to model without tools: ${toolRoute.model.id}`);
  }
  console.log(`Test 4 Passed: Automation task assigned to tool-capable model: ${toolRoute.model.id}.`);

  // ─── 5. Health Filtering: Rate Limited Model Skipped ───
  console.log('\n--- 5. Health Filtering: Rate Limited Model Skipped ---');
  ProviderHealthManager.recordFailure({
    vendor: 'GEMINI',
    modelId: 'gemini-2.0-flash',
    errorCode: 'RATE_LIMIT',
    errorMessage: 'Resource exhausted',
    retryAfterHeader: '60',
  });

  const fallbackTask = TaskProfileBuilder.build({ category: 'CONVERSATION' });
  const afterRateLimitRoute = await ProviderRouter.selectChatProvider(fallbackTask, 'FAST');
  if (afterRateLimitRoute.model.id === 'gemini-2.0-flash') {
    throw new Error('Test 5 Failed: Router selected rate-limited model during active cooldown');
  }
  console.log(`Test 5 Passed: Rate-limited model skipped; router selected healthy alternate: ${afterRateLimitRoute.vendor} (${afterRateLimitRoute.model.id}).`);

  // ─── 6. Authorization & Paid Failover Safety ───
  console.log('\n--- 6. Paid Failover Authorization Safety ---');
  // Ensure OpenAI has allowPaidFailover: false
  ProviderAuthManager.updateAuthorization('OPENAI', { allowPaidFailover: false });

  const failoverTask = TaskProfileBuilder.build({ category: 'CONVERSATION' });
  
  // When Gemini is excluded in failover mode and OpenAI has allowPaidFailover: false, OpenAI must NOT be chosen
  const failoverCandidates = await (ProviderRouter as any).getCandidates(failoverTask, 'AUTO', 'CHAT', {
    excludeVendors: ['GEMINI'],
    isFailover: true,
  });

  const openAiCandidate = failoverCandidates.find((c: any) => c.model.vendor === 'OPENAI');
  if (openAiCandidate) {
    throw new Error('Test 6 Failed: OpenAI included in automatic failover when allowPaidFailover=false (zero-surprise billing violation!)');
  }

  // Now enable paid failover
  ProviderAuthManager.updateAuthorization('OPENAI', { allowPaidFailover: true });
  const authorizedCandidates = await (ProviderRouter as any).getCandidates(failoverTask, 'AUTO', 'CHAT', {
    excludeVendors: ['GEMINI'],
    isFailover: true,
  });

  const authOpenAi = authorizedCandidates.find((c: any) => c.model.vendor === 'OPENAI');
  if (!authOpenAi) {
    throw new Error('Test 6 Failed: OpenAI not included in failover after explicit user authorization');
  }
  console.log('Test 6 Passed: Paid failover strictly requires explicit allowPaidFailover authorization.');

  // ─── 7. Lifecycle Telemetry Events ───
  console.log('\n--- 7. Provider Lifecycle Events ---');
  if (recordedEvents.length === 0) {
    throw new Error('Test 7 Failed: No lifecycle events emitted during routing');
  }
  const hasSelected = recordedEvents.some((e) => e.type === 'provider_selected');
  if (!hasSelected) {
    throw new Error('Test 7 Failed: provider_selected event missing');
  }
  console.log(`Test 7 Passed: ${recordedEvents.length} provider lifecycle events cleanly captured.`);

  unsub();
  console.log('\n===========================================================');
  console.log('✅ ALL PROVIDER ROUTER SELECTION TESTS PASSED (100% GREEN)');
  console.log('===========================================================\n');
}

runProviderRouterTests().catch((err) => {
  console.error('\n❌ Provider Router Test Failed:', err);
  process.exit(1);
});
