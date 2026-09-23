import { fetchWithTimeout } from './src/lib/ai/providers/utils/fetchTimeout';
import { withIdleTimeout, StreamTimeoutError } from './src/lib/ai/providers/utils/StreamTimeout';
import { ToolExecutor } from './src/lib/security/ToolExecutor';

let passed = 0;
let total = 0;
function ok(cond: boolean, label: string) { total++; if (cond) { passed++; console.log('PASS ' + label); } else { console.log('FAIL ' + label); } }

async function runTests() {
  console.log('1. Stream Timeout');
  async function* hangingStream() {
    yield { type: 'text', text: 'Hello ' };
    await new Promise(() => {});
  }
  try {
    const stream = withIdleTimeout(hangingStream() as any, 100);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    ok(false, 'Hanging stream should have thrown StreamTimeoutError');
  } catch (err: any) {
    ok(err instanceof StreamTimeoutError, 'StreamTimeoutError was thrown on idle stream');
  }

  console.log('2. fetchWithTimeout');
  const mockFetch = async (url: string | URL, opts: RequestInit) => {
    return new Promise<Response>((resolve, reject) => {
      const id = setTimeout(() => resolve(new Response('OK')), 5000);
      if (opts.signal) {
        opts.signal.addEventListener('abort', () => { clearTimeout(id); const err = new Error('AbortError'); err.name = 'AbortError'; reject(err); });
      }
    });
  };
  try {
    await fetchWithTimeout(mockFetch as any, 'http://test', {}, 100);
    ok(false, 'fetchWithTimeout should have thrown TIMEOUT');
  } catch (err: any) {
    ok(err.message === 'TIMEOUT', 'fetchWithTimeout threw TIMEOUT error');
  }

  console.log('3. ToolExecutor Timeout');
  const mockTool = async () => { await new Promise(r => setTimeout(r, 1000)); return 'done'; };
  const res = await ToolExecutor.execute('test', 'test', {}, 'test', undefined, mockTool, { timeoutMs: 100 });
  ok(!res.success && res.errorCode === 'TOOL_TIMEOUT', 'ToolExecutor timed out correctly');

  console.log('4. ToolExecutor Cancellation');
  const ac = new AbortController();
  const cancelPromise = ToolExecutor.execute('test', 'test', {}, 'test', undefined, mockTool, { signal: ac.signal });
  setTimeout(() => ac.abort(), 50);
  const cancelRes = await cancelPromise;
  ok(!cancelRes.success && cancelRes.errorCode === 'TOOL_CANCELLED', 'ToolExecutor cancelled correctly');

  console.log(passed + '/' + total + ' passed');
}
runTests();
