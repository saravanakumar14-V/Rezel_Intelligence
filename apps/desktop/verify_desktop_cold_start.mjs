import { spawn } from 'child_process';
import { WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import os from 'os';

console.log('=== REAL TAURI DESKTOP COLD START ACCEPTANCE TEST ===');

const appExe = path.resolve('src-tauri/target/release/app.exe');
console.log('Target Binary:', appExe);

if (!fs.existsSync(appExe)) {
  console.error('Binary not found at:', appExe);
  process.exit(1);
}

// Find app data dir
const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const rezelDataDir = path.join(appData, 'com.rezel.desktop');
const tokenFile = path.join(rezelDataDir, 'ipc_token.txt');

console.log('Expected token path:', tokenFile);

// Remove stale token if present
if (fs.existsSync(tokenFile)) {
  try { fs.unlinkSync(tokenFile); } catch (e) {}
}

console.log('Spawning Rezel Tauri desktop process...');
const appProc = spawn(appExe, [], {
  stdio: 'pipe',
  detached: false
});

let procExited = false;
let exitCode = null;

appProc.on('exit', (code) => {
  procExited = true;
  exitCode = code;
  console.log(`[Rezel Process] Exited with code: ${code}`);
});

appProc.stdout?.on('data', (d) => {
  console.log(`[Rezel stdout] ${d.toString().trim()}`);
});

appProc.stderr?.on('data', (d) => {
  console.log(`[Rezel stderr] ${d.toString().trim()}`);
});

async function runCheck() {
  // Wait up to 10 seconds for process startup & token file creation
  let token = null;
  const start = Date.now();
  
  while (Date.now() - start < 10000) {
    if (procExited) {
      console.error(`Process exited prematurely with code ${exitCode}`);
      break;
    }
    if (fs.existsSync(tokenFile)) {
      try {
        const content = fs.readFileSync(tokenFile, 'utf-8').trim();
        if (content.length > 0) {
          token = content;
          console.log(`Found IPC token: ${token.substring(0, 8)}... (length=${token.length})`);
          break;
        }
      } catch (e) {}
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  if (!token) {
    console.error('FAILED: IPC token file was not created within 10 seconds.');
    appProc.kill();
    process.exit(1);
  }

  // Connect to IPC WebSocket server running inside the real Tauri app
  console.log('Connecting to Rezel IPC server on ws://127.0.0.1:49211...');
  let wsConnected = false;
  let authSucceeded = false;

  await new Promise((resolve) => {
    try {
      const ws = new WebSocket('ws://127.0.0.1:49211');
      
      const timeout = setTimeout(() => {
        if (!wsConnected) {
          console.error('Timeout connecting to ws://127.0.0.1:49211');
          ws.close();
          resolve();
        }
      }, 5000);

      ws.on('open', () => {
        wsConnected = true;
        console.log('[WS] Connected to Rezel Tauri IPC server!');
        
        // Send Auth Message with valid application identity
        ws.send(JSON.stringify({
          type: 'auth',
          token: token,
          client_id: 'ae_cep_client',
          launch_id: 'verifier_' + Date.now(),
          process_id: process.pid,
          capabilities: []
        }));
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          console.log('[WS] Response from Rezel IPC:', msg);
          if (msg.type === 'auth_response' && msg.success === true) {
            authSucceeded = true;
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        } catch (e) {}
      });

      ws.on('error', (err) => {
        console.error('[WS Error]:', err.message);
        clearTimeout(timeout);
        resolve();
      });
    } catch (e) {
      console.error('WS exception:', e);
      resolve();
    }
  });

  console.log('\n=======================================================');
  console.log('REAL TAURI DESKTOP COLD START SUMMARY:');
  console.log('1. Process Launch (PID ' + appProc.pid + '): ' + (!procExited ? 'REAL PASS' : 'REAL FAIL'));
  console.log('2. App Data Dir & Token Generation: ' + (token ? 'REAL PASS' : 'REAL FAIL'));
  console.log('3. IPC WebSocket Server Port 49211: ' + (wsConnected ? 'REAL PASS' : 'REAL FAIL'));
  console.log('4. Authenticated IPC Handshake: ' + (authSucceeded ? 'REAL PASS' : 'REAL FAIL'));
  console.log('=======================================================\n');

  console.log('Terminating Rezel test desktop process...');
  appProc.kill('SIGTERM');
  setTimeout(() => {
    try { appProc.kill('SIGKILL'); } catch (e) {}
    process.exit(0);
  }, 1000);
}

runCheck();
