/**
 * Rezel 11.2B — Ollama Local Adapter Deterministic Test Suite
 *
 * Verifies:
 * - Local model discovery via GET /api/tags
 * - Capability-aware tool calling and NDJSON streaming
 * - OllamaReasoningAdapter structured JSON output (format: 'json')
 * - Offline / daemon unreachable error handling (code: 'OFFLINE')
 * - Zero API key requirement
 */

import { OllamaChatAdapter, OllamaReasoningAdapter, OllamaVendorPackage } from './src/lib/ai/providers/adapters/OllamaAdapter';
import { ModelCatalog } from './src/lib/ai/providers/ModelCatalog';

async function runOllamaAdapterTests() {
  console.log('=== Starting Rezel 11.2B Ollama Local Adapter Tests ===\n');

  // ─── 1. Local Model Discovery ───
  console.log('--- 1. Local Model Discovery (Mock /api/tags) ---');

  const mockTagsResponse = JSON.stringify({
    models: [
      { name: 'llama3.2:3b', model: 'llama3.2:3b', size: 2000000000 },
      { name: 'qwen2.5-coder:7b', model: 'qwen2.5-coder:7b', size: 4500000000 },
      { name: 'custom-local-model:latest', model: 'custom-local-model:latest', size: 3000000000 },
    ],
  });

  const mockTagsFetch = async (url: string | URL | Request): Promise<Response> => {
    const urlStr = String(url);
    if (urlStr.includes('/api/tags')) {
      return new Response(mockTagsResponse, { status: 200 });
    }
    return new Response('Not Found', { status: 404 });
  };

  const pkg = new OllamaVendorPackage({ fetchFn: mockTagsFetch as any });
  const discoveredModels = await pkg.discoverModels();

  if (discoveredModels.length < 3) {
    throw new Error(`Test 1 Failed: Expected at least 3 models, found ${discoveredModels.length}`);
  }

  const customModel = ModelCatalog.getModel('custom-local-model:latest');
  if (!customModel || customModel.vendor !== 'OLLAMA' || !customModel.isLocal) {
    throw new Error('Test 1 Failed: Custom local model not registered dynamically');
  }

  console.log('Test 1 Passed: Local models discovered and dynamically cataloged.');

  // ─── 2. NDJSON Streaming & Capability-Aware Tool Calling ───
  console.log('\n--- 2. NDJSON Streaming & Tool Call Normalization ---');

  const mockNdjsonStream = [
    JSON.stringify({ message: { content: 'Local response chunk 1' }, done: false }) + '\n',
    JSON.stringify({ message: { content: ' and chunk 2.' }, done: false }) + '\n',
    JSON.stringify({
      message: {
        tool_calls: [
          {
            function: {
              name: 'local_tool',
              arguments: { arg1: 'value1' },
            },
          },
        ],
      },
      done: true,
    }) + '\n',
  ].join('');

  const mockChatFetch = async (url: string | URL | Request): Promise<Response> => {
    const urlStr = String(url);
    if (urlStr.includes('/api/tags')) return new Response(mockTagsResponse, { status: 200 });
    return new Response(mockNdjsonStream, {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  };

  const chatAdapter = new OllamaChatAdapter({ fetchFn: mockChatFetch as any });
  const chunks: any[] = [];

  for await (const chunk of chatAdapter.chat('qwen2.5-coder:7b', [{ role: 'user', content: 'hello', timestamp: '' }])) {
    chunks.push(chunk);
  }

  const textChunks = chunks.filter((c) => c.type === 'text');
  const toolChunk = chunks.find((c) => c.type === 'tool_call');

  if (textChunks.length < 2 || !textChunks[0].text.includes('Local response chunk 1')) {
    throw new Error('Test 2 Failed: NDJSON text stream deltas missing');
  }
  if (!toolChunk || toolChunk.toolCall.name !== 'local_tool' || toolChunk.toolCall.args.arg1 !== 'value1') {
    throw new Error('Test 2 Failed: Tool call not parsed from local stream');
  }

  console.log('Test 2 Passed: NDJSON stream chunks and tool calls correctly normalized.');

  // ─── 3. Structured Reasoning Output ───
  console.log('\n--- 3. Structured Reasoning Output (format: json) ---');

  const mockReasoningResponse = JSON.stringify({
    message: {
      content: JSON.stringify({
        status: 'ACTIONS',
        summary: 'Local plan ready',
        actions: [{ type: 'READ_FILE', args: { path: 'local.txt' } }],
      }),
    },
    prompt_eval_count: 50,
    eval_count: 25,
  });

  const mockReasoningFetch = async (): Promise<Response> => {
    return new Response(mockReasoningResponse, { status: 200 });
  };

  const reasoningAdapter = new OllamaReasoningAdapter({ fetchFn: mockReasoningFetch as any });
  const reasoningRes = await reasoningAdapter.reason('qwen2.5-coder:7b', {
    goal: 'Read local file',
    context: {},
  });

  if (!reasoningRes.structured || reasoningRes.structured.status !== 'ACTIONS') {
    throw new Error('Test 3 Failed: Structured JSON output missing in local reasoning');
  }
  if (reasoningRes.tokenUsage.input !== 50 || reasoningRes.tokenUsage.output !== 25) {
    throw new Error('Test 3 Failed: Token count metrics mismatch');
  }

  console.log('Test 3 Passed: Ollama structured reasoning verified.');

  // ─── 4. Offline / Daemon Unreachable Detection ───
  console.log('\n--- 4. Offline / Daemon Unreachable Handling ---');

  const offlineFetch = async (): Promise<Response> => {
    throw new Error('fetch failed (ECONNREFUSED 127.0.0.1:11434)');
  };

  const offlineAdapter = new OllamaChatAdapter({ fetchFn: offlineFetch as any });
  const offlineChunks: any[] = [];
  for await (const chunk of offlineAdapter.chat('llama3.2:3b', [{ role: 'user', content: 'hi', timestamp: '' }])) {
    offlineChunks.push(chunk);
  }

  const errChunk = offlineChunks.find((c) => c.type === 'error');
  if (!errChunk || !errChunk.error.includes('offline or unreachable')) {
    throw new Error('Test 4 Failed: Expected offline error message on connection drop');
  }

  const isAvail = await offlineAdapter.isAvailable();
  if (isAvail !== false) {
    throw new Error('Test 4 Failed: isAvailable() should return false when daemon is unreachable');
  }

  console.log('Test 4 Passed: Daemon offline state handled gracefully without crash.');

  console.log('\n===========================================================');
  console.log('✅ ALL OLLAMA ADAPTER TESTS PASSED (100% GREEN)');
  console.log('===========================================================\n');
}

runOllamaAdapterTests().catch((err) => {
  console.error('\n❌ Ollama Adapter Test Failed:', err);
  process.exit(1);
});
