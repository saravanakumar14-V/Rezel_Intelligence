import { WebSocketServer, WebSocket } from 'ws';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { emit } from '@tauri-apps/api/event';

export const _mockFileSystem: Record<string, string> = {};

let wss: WebSocketServer | null = null;
let blenderProcess: ChildProcess | null = null;
let blenderWs: WebSocket | null = null;
let requestCounter = 0;
const pendingRequests = new Map<string, (val: any) => void>();
export let authResult: boolean | null = null;

export async function invoke<T>(cmd: string, args?: any): Promise<T> {
  if (cmd === 'read_app_file') {
    const p = args?.path;
    if (!(p in _mockFileSystem)) throw new Error(`File not found: `);
    return _mockFileSystem[p] as any;
  }
  if (cmd === 'write_app_file') {
    _mockFileSystem[args?.path] = args?.content;
    return undefined as any;
  }
  if (cmd === 'get_api_key') return 'FAKE_API_KEY' as any;
  if (cmd === 'get_system_info') return { cpu: 0, ram: 0 } as any;

  if (cmd === 'launch_blender') {
    if (wss) {
      // already running
      return undefined as any;
    }
    
    authResult = null;
    
    await new Promise<void>((resolve, reject) => {
      try {
        wss = new WebSocketServer({ port: 49211, host: '127.0.0.1' }, () => { resolve(); });
        wss.on('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            console.error("DIAGNOSTIC: Port 49211 is already occupied. Is Rezel Tauri running?");
          }
          reject(err);
        });
      } catch (e) { reject(e); }
    });

    wss!.on('connection', (ws) => {
      blenderWs = ws;
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'auth') {
          if (msg.token !== 'fake_token' || msg.client_id !== 'blender') {
            authResult = false;
            ws.send(JSON.stringify({ type: 'auth_response', success: false, error: 'Invalid token' }));
            ws.close();
          } else {
            authResult = true;
            ws.send(JSON.stringify({ type: 'auth_response', success: true }));
            emit('ipc://client_connected', { client_id: msg.client_id, capabilities: msg.capabilities });
          }
        } else if (msg.type === 'response' || msg.type === 'error') {
          const cid = msg.correlation_id;
          if (cid) {
            const req = pendingRequests.get(cid);
            if (req) { req(msg); pendingRequests.delete(cid); }
          }
        }
      });
      ws.on('close', () => {
        if (blenderWs === ws) blenderWs = null;
        emit('ipc://client_disconnected', { client_id: 'blender' });
      });
    });

    const exe = process.env.REZEL_BLENDER_PATH || 'C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe';
    const pyScript = path.resolve('src-tauri/resources/blender_ipc_client.py');
    
    blenderProcess = spawn(exe, [
       ...(args?.background ? ['-b'] : []),
       '--python', pyScript,
       '--',
       args?.token_override || 'fake_token',
       '127.0.0.1',
       '49211'
    ], { stdio: 'inherit' });

    blenderProcess.on('exit', () => {
       blenderProcess = null;
       if (blenderWs) blenderWs.close();
    });

    return new Promise((resolve) => {
       const check = setInterval(() => {
          if (authResult === true || authResult === false) {
             clearInterval(check);
             resolve(undefined as any);
          }
       }, 100);
       // Also resolve if process exits or auth fails to avoid hanging forever
       blenderProcess!.on('exit', () => { clearInterval(check); resolve(undefined as any); });
    });
  }

  if (cmd === 'send_ipc_command') {
    if (!blenderWs || blenderWs.readyState !== WebSocket.OPEN) throw new Error(`Client 'blender' not connected`);
    const cid = `req-`;
    
    return new Promise((resolve, reject) => {
      pendingRequests.set(cid, (resp: any) => {
         if (resp.type === 'error') reject(new Error(resp.message || resp.error));
         else if (resp.success) resolve(resp.result);
         else reject(new Error(resp.error || `Unknown error`));
      });
      
      const payload = JSON.stringify({
        type: 'command',
        correlation_id: cid,
        command: args.command,
        args: args.args
      });
      
      blenderWs!.send(payload, (err) => {
         if (err) { pendingRequests.delete(cid); reject(err); }
      });
    }) as any;
  }
  
  throw new Error(`Unhandled mock invoke: `);
}

export async function cleanupE2E() {
   if (blenderProcess) {
      blenderProcess.kill('SIGKILL');
      blenderProcess = null;
   }
   if (wss) {
      await new Promise<void>((resolve) => {
         for (const client of wss!.clients) {
             client.terminate();
         }
         wss!.close(() => {
             setTimeout(resolve, 500);
         });
      });
      wss = null;
   }
}
