/**
 * IsolatedCodeRunner
 *
 * Executes user/generated JavaScript in an isolated WebWorker sandbox.
 * The Worker thread runs with:
 * - NO window object
 * - NO document / DOM access
 * - NO localStorage / sessionStorage
 * - NO Tauri IPC internals (window.__TAURI_INTERNALS__ cannot be reached)
 * - NO application state or secrets
 * - Hard execution timeout (2500ms) to prevent infinite loops
 */

export interface ExecutionResult {
  success: boolean;
  output: string;
  durationMs: number;
  logs: string[];
}

export class IsolatedCodeRunner {
  private static readonly TIMEOUT_MS = 2500;

  public static async execute(code: string): Promise<ExecutionResult> {
    const startTime = performance.now();

    // Worker payload with console interception and safe evaluation
    const workerScript = `
      self.onmessage = function(e) {
        const logs = [];
        const originalLog = console.log;
        console.log = function(...args) {
          logs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
        };

        try {
          // Pure isolated evaluation
          const fn = new Function(e.data);
          const result = fn();
          self.postMessage({
            success: true,
            result: result !== undefined ? (typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)) : null,
            logs: logs
          });
        } catch (err) {
          self.postMessage({
            success: false,
            error: err && err.message ? err.message : String(err),
            logs: logs
          });
        }
      };
    `;

    return new Promise((resolve) => {
      let worker: Worker | null = null;
      let blobUrl: string | null = null;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let isResolved = false;

      const cleanup = () => {
        if (timer) clearTimeout(timer);
        if (worker) {
          worker.terminate();
          worker = null;
        }
        if (blobUrl) {
          URL.revokeObjectURL(blobUrl);
          blobUrl = null;
        }
      };

      try {
        const blob = new Blob([workerScript], { type: 'application/javascript' });
        blobUrl = URL.createObjectURL(blob);
        worker = new Worker(blobUrl);

        timer = setTimeout(() => {
          if (!isResolved) {
            isResolved = true;
            cleanup();
            const durationMs = Math.round(performance.now() - startTime);
            resolve({
              success: false,
              output: `Execution timed out (> ${IsolatedCodeRunner.TIMEOUT_MS}ms). Terminated isolated sandbox.`,
              durationMs,
              logs: [],
            });
          }
        }, IsolatedCodeRunner.TIMEOUT_MS);

        worker.onmessage = (event: MessageEvent) => {
          if (!isResolved) {
            isResolved = true;
            const durationMs = Math.round(performance.now() - startTime);
            const data = event.data;
            cleanup();

            if (data.success) {
              const outParts = [];
              if (data.logs && data.logs.length > 0) {
                outParts.push(`Logs: ${data.logs.join(' | ')}`);
              }
              if (data.result !== null) {
                outParts.push(`Result: ${data.result}`);
              } else if (outParts.length === 0) {
                outParts.push('Completed with no return value.');
              }
              resolve({
                success: true,
                output: outParts.join('\n'),
                durationMs,
                logs: data.logs || [],
              });
            } else {
              resolve({
                success: false,
                output: `Sandbox Runtime Error: ${data.error}`,
                durationMs,
                logs: data.logs || [],
              });
            }
          }
        };

        worker.onerror = (err: ErrorEvent) => {
          if (!isResolved) {
            isResolved = true;
            const durationMs = Math.round(performance.now() - startTime);
            cleanup();
            resolve({
              success: false,
              output: `Sandbox Error: ${err.message || 'Worker failure'}`,
              durationMs,
              logs: [],
            });
          }
        };

        worker.postMessage(code);
      } catch (err: any) {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          resolve({
            success: false,
            output: `Execution unavailable: Isolated sandbox cannot be created (${err?.message || 'Unknown error'}).`,
            durationMs: 0,
            logs: [],
          });
        }
      }
    });
  }
}
