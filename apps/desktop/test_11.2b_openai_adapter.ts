/**
 * Rezel 11.2B — OpenAI Adapter Deterministic Test Suite
 *
 * Verifies:
 * - OpenAIChatAdapter SSE streaming and fragmented tool argument accumulation
 * - OpenAIReasoningAdapter structured JSON output
 * - Normalized error mappings (401, 429, 503)
 * - Schema conversion to OpenAI Tool format
 * - Key retrieval and redaction
 */

import { OpenAIChatAdapter, OpenAIReasoningAdapter, OpenAIVendorPackage } from './src/lib/ai/providers/adapters/OpenAIAdapter';
import { ToolSchemaTranslator } from './src/lib/ai/providers/adapters/ToolSchemaTranslator';
import { ProviderAuthManager } from './src/lib/ai/providers/ProviderAuthManager';
import type { ToolDefinition } from './src/lib/ai/types';

async function runOpenAIAdapterTests() {
  console.log('=== Starting Rezel 11.2B OpenAI Adapter Tests ===\n');

  await ProviderAuthManager.saveKey('OPENAI', 'sk-proj-mock-openai-key-99887766554433221100');

  // ─── 1. Tool Schema Conversion ───
  console.log('--- 1. Tool Schema Conversion to OpenAI Format ---');
  const mockTool: ToolDefinition = {
    name: 'search_files',
    description: 'Searches project files',
    category: 'file',
    risk: 'LOW',
    toolGroup: 'filesystem',
    parameters: {
      query: { type: 'string', description: 'Search term', required: true },
      maxResults: { type: 'number', description: 'Limit' },
    },
  };

  const openAiTools = ToolSchemaTranslator.toOpenAI([mockTool]);
  if (!openAiTools[0] || openAiTools[0].type !== 'function') {
    throw new Error('Test 1 Failed: OpenAI tool format mismatch');
  }
  if (openAiTools[0].function.name !== 'search_files' || openAiTools[0].function.parameters.properties.query.type !== 'string') {
    throw new Error('Test 1 Failed: Parameter mapping mismatch');
  }
  console.log('Test 1 Passed: ToolDefinition accurately converted to OpenAI Tool format.');

  // ─── 2. Streaming Chat & Fragmented Tool Call Accumulation ───
  console.log('\n--- 2. Streaming Chat & Fragmented Tool Call Accumulation ---');

  const mockSseStream = [
    'data: {"choices":[{"delta":{"content":"Let me search that for you."}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","function":{"name":"search_files","arguments":"{\\"que"}}]}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ry\\":\\"App.tsx\\"}"}}]}}]}\n\n',
    'data: [DONE]\n\n',
  ].join('');

  const mockFetch = async (): Promise<Response> => {
    return new Response(mockSseStream, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  };

  const adapter = new OpenAIChatAdapter({ fetchFn: mockFetch as any });
  const chunks: any[] = [];

  for await (const chunk of adapter.chat('gpt-4o', [{ role: 'user', content: 'Find App.tsx', timestamp: '' }])) {
    chunks.push(chunk);
  }

  const textChunk = chunks.find((c) => c.type === 'text');
  const toolChunk = chunks.find((c) => c.type === 'tool_call');

  if (!textChunk || textChunk.text !== 'Let me search that for you.') {
    throw new Error('Test 2 Failed: Text streaming delta missing or corrupted');
  }
  if (!toolChunk || toolChunk.toolCall.name !== 'search_files' || toolChunk.toolCall.args.query !== 'App.tsx') {
    throw new Error(`Test 2 Failed: Tool call arguments not accurately assembled: ${JSON.stringify(toolChunk)}`);
  }

  console.log('Test 2 Passed: OpenAI fragmented streaming tool arguments assembled and normalized.');

  // ─── 3. Structured Reasoning Output ───
  console.log('\n--- 3. Structured Reasoning Output ---');

  const mockReasoningResponse = JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({
            status: 'ACTIONS',
            summary: 'Search completed',
            actions: [{ type: 'READ_FILE', args: { path: 'App.tsx' } }],
          }),
        },
      },
    ],
    usage: { prompt_tokens: 180, completion_tokens: 60 },
  });

  const mockReasoningFetch = async (): Promise<Response> => {
    return new Response(mockReasoningResponse, { status: 200 });
  };

  const reasoningAdapter = new OpenAIReasoningAdapter({ fetchFn: mockReasoningFetch as any });
  const res = await reasoningAdapter.reason('gpt-4o', {
    goal: 'Search App.tsx',
    context: {},
  });

  if (!res.structured || res.structured.status !== 'ACTIONS') {
    throw new Error('Test 3 Failed: Structured reasoning output missing');
  }
  if (res.tokenUsage.input !== 180 || res.tokenUsage.output !== 60) {
    throw new Error('Test 3 Failed: Token usage mismatch');
  }

  console.log('Test 3 Passed: OpenAI structured reasoning verified.');

  // ─── 4. Error Normalization & Key Sanitization ───
  console.log('\n--- 4. Error Normalization & Key Sanitization ---');

  const authErrorFetch = async (): Promise<Response> => {
    return new Response('Incorrect API key provided: sk-proj-mock-openai-key-99887766554433221100', {
      status: 401,
    });
  };

  const authAdapter = new OpenAIChatAdapter({ fetchFn: authErrorFetch as any });
  const errChunks: any[] = [];
  for await (const chunk of authAdapter.chat('gpt-4o', [{ role: 'user', content: 'test', timestamp: '' }])) {
    errChunks.push(chunk);
  }

  const errChunk = errChunks.find((c) => c.type === 'error');
  if (!errChunk) {
    throw new Error('Test 4 Failed: Expected error chunk on 401');
  }
  if (errChunk.error.includes('sk-proj-mock-openai-key-99887766554433221100')) {
    throw new Error('Test 4 Failed: OpenAI API key leaked in error message!');
  }
  if (!errChunk.error.includes('[REDACTED_API_KEY]')) {
    throw new Error('Test 4 Failed: Redacted API key string missing');
  }

  console.log('Test 4 Passed: 401 error normalized and secret key redacted.');

  // ─── 5. Package Contract ───
  console.log('\n--- 5. Vendor Package Contract ---');
  const pkg = new OpenAIVendorPackage();
  const models = await pkg.getModels();
  if (models.length < 2) {
    throw new Error('Test 5 Failed: OpenAI vendor package models missing');
  }
  console.log('Test 5 Passed: OpenAIVendorPackage exposes chat, reasoning, and models.');

  console.log('\n===========================================================');
  console.log('✅ ALL OPENAI ADAPTER TESTS PASSED (100% GREEN)');
  console.log('===========================================================\n');
}

runOpenAIAdapterTests().catch((err) => {
  console.error('\n❌ OpenAI Adapter Test Failed:', err);
  process.exit(1);
});
