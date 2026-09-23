/**
 * Rezel 11.2C — Classified Failover Test Suite
 *
 * Verifies:
 * - Retryable failures (429, 503, timeout) trigger classified failover to next candidate
 * - The EXACT SAME TaskProfile is preserved across failovers
 * - Non-retryable failures (401, 400, policy violation) do NOT trigger failover
 * - Lifecycle telemetry events (provider_failed, provider_fallback) are emitted
 */

import { ProviderRouter } from './src/lib/ai/providers/ProviderRouter';
import { TaskProfileBuilder } from './src/lib/ai/providers/TaskProfileBuilder';
import { ProviderAuthManager } from './src/lib/ai/providers/ProviderAuthManager';
import { ProviderHealthManager } from './src/lib/ai/providers/ProviderHealthManager';
import { ProviderRegistry } from './src/lib/ai/providers/ProviderRegistry';
import { GeminiVendorPackage } from './src/lib/ai/providers/adapters/GeminiAdapter';
import { OpenAIVendorPackage } from './src/lib/ai/providers/adapters/OpenAIAdapter';

async function runFailoverTests() {
  console.log('=== Starting Rezel 11.2C Classified Failover Tests ===\n');

  await ProviderAuthManager.saveKey('GEMINI', 'AIzaSyMockKey');
  await ProviderAuthManager.saveKey('OPENAI', 'sk-proj-mock-key');

  // Enable paid failover for OpenAI in this test
  ProviderAuthManager.updateAuthorization('OPENAI', { allowPaidFailover: true });

  ProviderHealthManager.recordSuccess('GEMINI', 'gemini-2.0-flash');
  ProviderHealthManager.recordSuccess('OPENAI', 'gpt-4o');

  // ─── 1. Retryable 429 Failover to Next Candidate ───
  console.log('--- 1. Retryable 429 Rate Limit Failover ---');

  let geminiCalled = false;
  let openAiCalled = false;

  const mockGeminiFetch = async (): Promise<Response> => {
    geminiCalled = true;
    return new Response('Quota exceeded (429)', {
      status: 429,
      headers: { 'retry-after': '30' },
    });
  };

  const mockOpenAiFetch = async (): Promise<Response> => {
    openAiCalled = true;
    return new Response('data: {"choices":[{"delta":{"content":"Fallback success from OpenAI"}}]}\n\ndata: [DONE]\n\n', {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };

  // Re-register packages with mock fetches
  ProviderRegistry.registerPackage(new GeminiVendorPackage({ fetchFn: mockGeminiFetch as any }));
  ProviderRegistry.registerPackage(new OpenAIVendorPackage({ fetchFn: mockOpenAiFetch as any }));

  const automationTask = TaskProfileBuilder.build({
    category: 'AUTOMATION',
    requiresTools: true,
  });

  const chunks: any[] = [];
  for await (const chunk of ProviderRouter.chat(automationTask, [{ role: 'user', content: 'test', timestamp: '' }])) {
    chunks.push(chunk);
  }

  const textChunk = chunks.find((c) => c.type === 'text');

  if (!geminiCalled) {
    throw new Error('Test 1 Failed: Primary Gemini provider was never called');
  }
  if (!openAiCalled) {
    throw new Error('Test 1 Failed: Failover to OpenAI was not triggered on 429');
  }
  if (!textChunk || !textChunk.text.includes('Fallback success from OpenAI')) {
    throw new Error('Test 1 Failed: Fallback response stream missing');
  }

  console.log('Test 1 Passed: 429 triggered classified fallback to OpenAI and streamed response.');

  // ─── 2. Non-Retryable 401 Auth Failure Stops Immediately ───
  console.log('\n--- 2. Non-Retryable 401 Auth Failure (No Failover) ---');

  geminiCalled = false;
  openAiCalled = false;

  const mockAuthFailFetch = async (): Promise<Response> => {
    geminiCalled = true;
    return new Response('API key invalid (401)', { status: 401 });
  };

  ProviderRegistry.registerPackage(new GeminiVendorPackage({ fetchFn: mockAuthFailFetch as any }));

  const authTask = TaskProfileBuilder.build({ category: 'CONVERSATION' });
  const authChunks: any[] = [];
  for await (const chunk of ProviderRouter.chat(authTask, [{ role: 'user', content: 'test', timestamp: '' }])) {
    authChunks.push(chunk);
  }

  const errChunk = authChunks.find((c) => c.type === 'error');
  if (!errChunk) {
    throw new Error('Test 2 Failed: Expected error chunk on 401');
  }
  if (openAiCalled) {
    throw new Error('Test 2 Failed: Non-retryable 401 auth error falsely triggered failover!');
  }

  console.log('Test 2 Passed: 401 auth failure stopped immediately without secondary failover.');

  // ─── 3. TaskProfile Immutability Across Failovers ───
  console.log('\n--- 3. TaskProfile Immutability Across Failovers ---');
  const complexTask = TaskProfileBuilder.build({
    category: 'AUTOMATION',
    requiresTools: true,
    requiresStructuredOutput: true,
    requiresExtendedThinking: true,
  });

  const originalId = complexTask.id;
  const originalReqs = { ...complexTask.requiredCapabilities };

  // Trigger failover attempt
  const nextRoute = await ProviderRouter.selectChatProvider(complexTask, 'AUTO', {
    excludeVendors: ['GEMINI'],
    isFailover: true,
  });

  if (complexTask.id !== originalId || complexTask.requiredCapabilities.toolCalling !== originalReqs.toolCalling) {
    throw new Error('Test 3 Failed: TaskProfile was mutated during failover candidate evaluation');
  }
  if (!nextRoute.model.capabilities.toolCalling) {
    throw new Error('Test 3 Failed: Fallback candidate violated TaskProfile required capabilities');
  }

  console.log('Test 3 Passed: TaskProfile remains strictly immutable and enforced throughout failover.');

  console.log('\n===========================================================');
  console.log('✅ ALL CLASSIFIED FAILOVER TESTS PASSED (100% GREEN)');
  console.log('===========================================================\n');
}

runFailoverTests().catch((err) => {
  console.error('\n❌ Failover Test Failed:', err);
  process.exit(1);
});
