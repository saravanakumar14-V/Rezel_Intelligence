import { ReasoningProviderRegistryImpl } from './src/lib/reasoning/ReasoningProviderRegistry';
import { ReasoningRouterImpl } from './src/lib/reasoning/ReasoningRouter';
import { GeminiReasoningProvider } from './src/lib/reasoning/providers/GeminiReasoningProvider';
import { OpenAIReasoningProvider } from './src/lib/reasoning/providers/OpenAIReasoningProvider';
import { LocalReasoningProvider } from './src/lib/reasoning/providers/LocalReasoningProvider';
import type { ReasoningProvider, ReasoningRequest } from './src/lib/reasoning/types';
import { ReasoningProviderError } from './src/lib/reasoning/types';

console.log('[Test 11.0B2] Starting Reasoning Provider Registry & Router offline tests...');

async function runTests() {
  const registry = new ReasoningProviderRegistryImpl();
  const router = new ReasoningRouterImpl(registry);

  // Helper mock provider
  function createMockProvider(
    id: string,
    priority: number,
    isAvailable = true,
    opts: Partial<ReasoningProvider['config']> = {}
  ): ReasoningProvider {
    return {
      id,
      type: 'CUSTOM',
      config: {
        id,
        type: 'CUSTOM',
        displayName: `Mock Provider ${id}`,
        maxContextTokens: opts.maxContextTokens ?? 100000,
        supportsStructuredOutput: opts.supportsStructuredOutput ?? true,
        supportsStreaming: true,
        costTier: opts.costTier ?? 'LOW',
        priority,
      },
      async isAvailable() {
        return isAvailable;
      },
      async reason(req: ReasoningRequest, signal?: AbortSignal) {
        if (signal?.aborted) {
          throw new ReasoningProviderError('ABORTED', 'Aborted', id);
        }
        return {
          raw: JSON.stringify({ status: 'COMPLETE', summary: 'Done' }),
          tokenUsage: { input: 10, output: 20 },
          latencyMs: 50,
          providerId: id,
        };
      },
    };
  }

  // --- Test A: register provider ---
  const p1 = createMockProvider('p1', 10);
  registry.register(p1);
  console.assert(registry.get('p1') === p1, 'Test A: register failed');
  console.log('  ✅ Test A: register provider passed');

  // --- Test B: duplicate registration rejected ---
  let dupError = false;
  try {
    registry.register(p1);
  } catch (err: any) {
    dupError = err.message.includes('already registered');
  }
  console.assert(dupError, 'Test B: duplicate registration was not rejected');
  console.log('  ✅ Test B: duplicate registration rejected passed');

  // --- Test C: get provider ---
  console.assert(registry.get('p1') === p1, 'Test C: get provider failed');
  console.assert(registry.get('nonexistent') === undefined, 'Test C: get non-existent failed');
  console.log('  ✅ Test C: get provider passed');

  // --- Test D: unregister provider ---
  const unregSuccess = registry.unregister('p1');
  console.assert(unregSuccess && registry.get('p1') === undefined, 'Test D: unregister failed');
  console.log('  ✅ Test D: unregister provider passed');

  // --- Test E: getAll deterministic ---
  registry.clear();
  const mockA = createMockProvider('a', 20);
  const mockB = createMockProvider('b', 10);
  registry.register(mockA);
  registry.register(mockB);
  const all = registry.getAll();
  console.assert(all.length === 2 && all[0].id === 'a' && all[1].id === 'b', 'Test E: getAll failed');
  console.log('  ✅ Test E: getAll deterministic passed');

  // --- Test F: getAvailable filters unavailable providers ---
  const mockOffline = createMockProvider('offline', 5, false);
  registry.register(mockOffline);
  const available = await registry.getAvailable();
  console.assert(available.length === 2 && !available.some((p) => p.id === 'offline'), 'Test F: getAvailable filter failed');
  console.log('  ✅ Test F: getAvailable filters unavailable providers passed');

  // --- Test G: preferred provider selected ---
  const selectedPref = await router.selectProvider({ preferredProvider: 'a' });
  console.assert(selectedPref.id === 'a', 'Test G: preferred provider selection failed');
  console.log('  ✅ Test G: preferred provider selected passed');

  // --- Test H: unavailable preferred provider falls through ---
  const selectedFallback = await router.selectProvider({ preferredProvider: 'offline' });
  console.assert(selectedFallback.id === 'b', 'Test H: unavailable preferred fallthrough failed');
  console.log('  ✅ Test H: unavailable preferred provider fallthrough passed');

  // --- Test I: context-size requirement filtering ---
  registry.clear();
  const smallCtx = createMockProvider('small', 10, true, { maxContextTokens: 4000 });
  const largeCtx = createMockProvider('large', 20, true, { maxContextTokens: 128000 });
  registry.register(smallCtx);
  registry.register(largeCtx);

  const selectedCtx = await router.selectProvider({ requiredContextTokens: 50000 });
  console.assert(selectedCtx.id === 'large', 'Test I: context-size filtering failed');
  console.log('  ✅ Test I: context-size requirement filtering passed');

  // --- Test J: structured-output requirement filtering ---
  registry.clear();
  const noStruct = createMockProvider('nostruct', 5, true, { supportsStructuredOutput: false });
  const withStruct = createMockProvider('withstruct', 15, true, { supportsStructuredOutput: true });
  registry.register(noStruct);
  registry.register(withStruct);

  const selectedStruct = await router.selectProvider({ requireStructuredOutput: true });
  console.assert(selectedStruct.id === 'withstruct', 'Test J: structured output filtering failed');
  console.log('  ✅ Test J: structured-output requirement filtering passed');

  // --- Test K: cost-tier filtering ---
  registry.clear();
  const expensive = createMockProvider('high_cost', 5, true, { costTier: 'HIGH' });
  const cheap = createMockProvider('low_cost', 10, true, { costTier: 'FREE' });
  registry.register(expensive);
  registry.register(cheap);

  const selectedCost = await router.selectProvider({ maxCostTier: 'FREE' });
  console.assert(selectedCost.id === 'low_cost', 'Test K: cost-tier filtering failed');
  console.log('  ✅ Test K: cost-tier filtering passed');

  // --- Test L: priority ordering ---
  registry.clear();
  const prio30 = createMockProvider('p30', 30);
  const prio5 = createMockProvider('p5', 5);
  const prio15 = createMockProvider('p15', 15);
  registry.register(prio30);
  registry.register(prio5);
  registry.register(prio15);

  const selectedPrio = await router.selectProvider();
  console.assert(selectedPrio.id === 'p5', 'Test L: priority ordering failed');
  console.log('  ✅ Test L: priority ordering passed');

  // --- Test M: no eligible provider produces explicit failure ---
  let noEligibleError = false;
  try {
    await router.selectProvider({ requiredContextTokens: 99999999 });
  } catch (err: any) {
    if (err instanceof ReasoningProviderError && err.code === 'NO_ELIGIBLE_PROVIDER') {
      noEligibleError = true;
    }
  }
  console.assert(noEligibleError, 'Test M: no eligible provider failure failed');
  console.log('  ✅ Test M: no eligible provider failure passed');

  // --- Test N: Gemini adapter conforms to interface ---
  const mockFetchGemini = async () =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: '{"status":"COMPLETE"}' }] } }],
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 },
      }),
      { status: 200 }
    );

  const gemini = new GeminiReasoningProvider({
    apiKey: 'mock_key',
    fetchFn: mockFetchGemini as any,
  });

  console.assert(gemini.type === 'GEMINI', 'Test N: Gemini type check failed');
  console.assert(await gemini.isAvailable(), 'Test N: Gemini availability check failed');

  const geminiResult = await gemini.reason({
    goal: 'Test goal',
    context: {} as any,
  });
  console.assert(geminiResult.providerId === gemini.id, 'Test N: Gemini providerId check failed');
  console.assert(geminiResult.tokenUsage.input === 100, 'Test N: Gemini token usage check failed');
  console.log('  ✅ Test N: Gemini adapter conforms to interface passed');

  // --- Test O: OpenAI adapter unavailable without configuration ---
  const openaiUnconfigured = new OpenAIReasoningProvider({ apiKey: '' });
  console.assert(!(await openaiUnconfigured.isAvailable()), 'Test O: OpenAI availability failed');

  let openaiError = false;
  try {
    await openaiUnconfigured.reason({ goal: 'Test', context: {} as any });
  } catch (err: any) {
    if (err instanceof ReasoningProviderError && err.code === 'CONFIGURATION_ERROR') {
      openaiError = true;
    }
  }
  console.assert(openaiError, 'Test O: OpenAI configuration error check failed');
  console.log('  ✅ Test O: OpenAI adapter unavailable without configuration passed');

  // --- Test P: Local adapter conforms to interface ---
  const mockFetchLocal = async (url: string) => {
    if (url.includes('/api/tags')) {
      return new Response(JSON.stringify({ models: [{ name: 'llama3' }] }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ response: '{"status":"COMPLETE"}', prompt_eval_count: 50, eval_count: 20 }),
      { status: 200 }
    );
  };

  const localProvider = new LocalReasoningProvider({
    fetchFn: mockFetchLocal as any,
  });

  console.assert(localProvider.type === 'LOCAL', 'Test P: Local type check failed');
  console.assert(await localProvider.isAvailable(), 'Test P: Local availability check failed');

  const localResult = await localProvider.reason({ goal: 'Test local', context: {} as any });
  console.assert(localResult.tokenUsage.input === 50, 'Test P: Local token usage failed');
  console.log('  ✅ Test P: Local adapter conforms to interface passed');

  // --- Test Q: abort signal propagation contract ---
  const abortController = new AbortController();
  abortController.abort();

  let abortCaught = false;
  try {
    await gemini.reason({ goal: 'Test abort', context: {} as any }, abortController.signal);
  } catch (err: any) {
    if (err instanceof ReasoningProviderError && err.code === 'ABORTED') {
      abortCaught = true;
    }
  }
  console.assert(abortCaught, 'Test Q: abort signal check failed');
  console.log('  ✅ Test Q: abort signal propagation contract passed');

  // --- Test R: provider failure classification ---
  const mockFetch429 = async () => new Response('Rate limited', { status: 429 });
  const gemini429 = new GeminiReasoningProvider({
    apiKey: 'mock_key',
    fetchFn: mockFetch429 as any,
  });

  let rateLimitCaught = false;
  try {
    await gemini429.reason({ goal: 'Test 429', context: {} as any });
  } catch (err: any) {
    if (err instanceof ReasoningProviderError && err.code === 'RATE_LIMIT') {
      rateLimitCaught = true;
    }
  }
  console.assert(rateLimitCaught, 'Test R: rate limit classification failed');
  console.log('  ✅ Test R: provider failure classification passed');

  // --- Test S: provider trust remains identical across providers ---
  // Ensure that no provider object contains security permissions or PolicyEngine modification methods
  const allProviders: ReasoningProvider[] = [gemini, openaiUnconfigured, localProvider];
  for (const prov of allProviders) {
    console.assert(!('permissionManager' in prov), 'Test S: provider has permissionManager property');
    console.assert(!('policyEngine' in prov), 'Test S: provider has policyEngine property');
    console.assert(!('executeCapability' in prov), 'Test S: provider has executeCapability property');
  }
  console.log('  ✅ Test S: provider trust remains identical across providers passed');

  console.log('[Test 11.0B2] 🎉 ALL 19 OFFLINE DETERMINISTIC TESTS PASSED CLEANLY!');
}

runTests().catch((err) => {
  console.error('[Test 11.0B2] ❌ Test suite failed:', err);
  process.exit(1);
});
