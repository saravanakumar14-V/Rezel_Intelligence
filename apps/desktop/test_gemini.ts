function assert(condition: boolean, message?: string) {
  if (!condition) throw new Error(`Assertion failed${message ? ': ' + message : ''}`);
}
import { GeminiProvider } from './src/lib/ai/GeminiProvider.js';

// Mock Tauri invoke to provide fake API key
const originalInvoke = (global as any).__TAURI_INVOKE__ || (async () => {});
(global as any).window = { __TAURI_INVOKE__: async (cmd: string) => {
  if (cmd === 'get_api_key') return 'FAKE_API_KEY_123';
  return '';
}};

// Setup fetch mock
const originalFetch = global.fetch;

async function runTests() {
  console.log("Starting GeminiProvider Integration Tests...");

  // Test 1: Configured model ID is used (Default)
  let capturedUrl = '';
  let capturedBody: any = null;
  global.fetch = async (url: any, init: any) => {
    capturedUrl = url.toString();
    if (init.body) capturedBody = JSON.parse(init.body);
    return new Response('data: [DONE]\n\n', { status: 200, headers: new Headers({'Content-Type': 'text/event-stream'}) });
  };
  
  // Since we are mocking, we ensure the api key is cleared to fetch it again
  GeminiProvider.clearApiKey();
  
  let chunks = [];
  for await (const chunk of GeminiProvider.chat([{ role: 'user', content: 'hello' }])) {
    chunks.push(chunk);
  }
  
  assert(capturedUrl.includes('models/gemini-3.6-flash'), `Default model should be gemini-3.6-flash, but got ${capturedUrl}`);
  assert(chunks.length === 1 && chunks[0].type === 'done', 'Should parse [DONE] correctly');
  assert(!capturedUrl.includes('FAKE_API_KEY_123'), 'API Key MUST NOT be in URL');
  assert(!JSON.stringify(capturedBody).includes('FAKE_API_KEY_123'), 'API Key MUST NOT be in body');
  
  // Test 2: Explicitly configured model override via setModel
  GeminiProvider.setModel('gemini-4.0-super');
  await GeminiProvider.chat([{ role: 'user', content: 'test' }]).next();
  assert(capturedUrl.includes('models/gemini-4.0-super'), 'Model override should be used');
  
  // Test 3: 404 Deprecated/Unavailable model handling
  global.fetch = async (url: any, init: any) => {
    capturedUrl = url.toString();
    return new Response('Model not found', { status: 404 });
  };
  
  let errorMsg = '';
  let fetchCallCount = 0;
  global.fetch = async (url: any, init: any) => {
    fetchCallCount++;
    return new Response('Model not found', { status: 404 });
  };
  for await (const chunk of GeminiProvider.chat([{ role: 'user', content: 'test' }])) {
    if (chunk.type === 'error') {
      errorMsg = chunk.error || '';
    }
  }
  assert(errorMsg.includes('404 Not Found'), 'Should produce a clear 404 error');
  assert(errorMsg.includes('gemini-4.0-super'), 'Error should identify the configured model');
  assert(fetchCallCount === 1, 'Should NOT retry on 404 (no infinite loops)');
  
  // Test 4: API Key Leakage Prevention on Errors
  global.fetch = async (url: any, init: any) => {
    return new Response('Your key FAKE_API_KEY_123 is invalid', { status: 400 });
  };
  for await (const chunk of GeminiProvider.chat([{ role: 'user', content: 'test' }])) {
    if (chunk.type === 'error') {
      errorMsg = chunk.error || '';
    }
  }
  assert(!errorMsg.includes('FAKE_API_KEY_123'), 'API key MUST NOT leak in error messages');
  assert(errorMsg.includes('***[API_KEY_HIDDEN]***'), 'API key should be redacted');
  
  // Test 5: Successful response parsing with tools
  global.fetch = async (url: any, init: any) => {
    const chunk = JSON.stringify({
      candidates: [{
        content: {
          parts: [{ functionCall: { name: 'test_tool', args: { a: 1 } } }]
        }
      }]
    });
    return new Response(`data: ${chunk}\n\ndata: [DONE]\n\n`, { status: 200, headers: new Headers({'Content-Type': 'text/event-stream'}) });
  };
  
  let parsedChunks = [];
  for await (const chunk of GeminiProvider.chat([{ role: 'user', content: 'test' }])) {
    parsedChunks.push(chunk);
  }
  assert(parsedChunks[0].type === 'tool_call', 'Should parse tool_call');
  assert((parsedChunks[0] as any).toolCall.name === 'test_tool', 'Should parse tool name');

  console.log("All GeminiProvider Integration Tests Passed! Success");
}

runTests().finally(() => {
  global.fetch = originalFetch;
}).catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
