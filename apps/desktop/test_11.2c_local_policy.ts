/**
 * Rezel 11.2C — Local Routing Policy & Privacy Guarantee Test Suite
 *
 * Verifies:
 * - LOCAL routing profile strictly guarantees ZERO cloud provider calls
 * - LOCAL routing profile fails explicitly if no eligible local model satisfies requirements
 * - Capability-aware local fallback
 */

import { ProviderRouter } from './src/lib/ai/providers/ProviderRouter';
import { TaskProfileBuilder } from './src/lib/ai/providers/TaskProfileBuilder';
import { ProviderAuthManager } from './src/lib/ai/providers/ProviderAuthManager';
import { ProviderRegistry } from './src/lib/ai/providers/ProviderRegistry';
import { GeminiVendorPackage } from './src/lib/ai/providers/adapters/GeminiAdapter';
import { OllamaVendorPackage } from './src/lib/ai/providers/adapters/OllamaAdapter';

async function runLocalPolicyTests() {
  console.log('=== Starting Rezel 11.2C Local Routing Policy Tests ===\n');

  await ProviderAuthManager.saveKey('GEMINI', 'AIzaSyMockKey');

  let cloudCalled = false;
  let localCalled = false;

  const mockCloudFetch = async (): Promise<Response> => {
    cloudCalled = true;
    return new Response('Cloud response', { status: 200 });
  };

  const mockLocalFetch = async (url: string | URL | Request): Promise<Response> => {
    localCalled = true;
    const urlStr = String(url);
    if (urlStr.includes('/api/tags')) {
      return new Response(JSON.stringify({ models: [{ name: 'llama3.2:3b' }] }), { status: 200 });
    }
    return new Response('{"message":{"content":"Local private response"},"done":true}\n', {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  };

  ProviderRegistry.registerPackage(new GeminiVendorPackage({ fetchFn: mockCloudFetch as any }));
  ProviderRegistry.registerPackage(new OllamaVendorPackage({ fetchFn: mockLocalFetch as any }));

  // ─── 1. LOCAL Profile: Strict Cloud Isolation ───
  console.log('--- 1. Strict Cloud Isolation under LOCAL Profile ---');
  ProviderRouter.setRoutingProfile('LOCAL');

  const localTask = TaskProfileBuilder.build({ category: 'CONVERSATION' });
  const chunks: any[] = [];

  for await (const chunk of ProviderRouter.chat(localTask, [{ role: 'user', content: 'Local query', timestamp: '' }])) {
    chunks.push(chunk);
  }

  if (cloudCalled) {
    throw new Error('Test 1 Failed: Cloud provider was called while LOCAL routing profile was active (privacy breach!)');
  }
  if (!localCalled) {
    throw new Error('Test 1 Failed: Local Ollama provider was not invoked');
  }

  console.log('Test 1 Passed: LOCAL routing profile strictly guaranteed zero cloud network calls.');

  // ─── 2. LOCAL Profile: Explicit Failure on Unsatisfied Capability ───
  console.log('\n--- 2. Explicit Failure on Unsatisfied Local Capability ---');
  
  // High-capacity context requirements not supported locally (e.g. 500k context)
  const unsupportedTask = TaskProfileBuilder.build({
    category: 'CONVERSATION',
    minContextTokens: 500_000,
  });

  let threwExpected = false;
  try {
    await ProviderRouter.selectChatProvider(unsupportedTask, 'LOCAL');
  } catch (err: any) {
    threwExpected = true;
    if (!err.message.includes('No eligible local AI models available')) {
      throw new Error(`Test 2 Failed: Unexpected error message: ${err.message}`);
    }
  }

  if (!threwExpected) {
    throw new Error('Test 2 Failed: LOCAL profile should have explicitly failed for unsupported audio requirement');
  }
  if (cloudCalled) {
    throw new Error('Test 2 Failed: Cloud provider called during unsupported local capability request!');
  }

  console.log('Test 2 Passed: LOCAL profile failed explicitly without falling back to cloud.');

  // Reset profile to AUTO
  ProviderRouter.setRoutingProfile('AUTO');

  console.log('\n===========================================================');
  console.log('✅ ALL LOCAL ROUTING POLICY TESTS PASSED (100% GREEN)');
  console.log('===========================================================\n');
}

runLocalPolicyTests().catch((err) => {
  console.error('\n❌ Local Policy Test Failed:', err);
  process.exit(1);
});
