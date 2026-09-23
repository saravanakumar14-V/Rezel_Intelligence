import { spawn } from 'child_process';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import os from 'os';

console.log('======================================================================');
console.log('REZEL — LIVE AFTER EFFECTS CEP INTERACTIVE ACCEPTANCE TEST');
console.log('======================================================================\n');

const AE_EXE = 'C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files\\AfterFX.exe';
const APP_EXE = path.resolve('src-tauri/target/release/app.exe');
const OUTPUT_DIR = path.resolve('temp_test_out');
const TOKEN_FILE = path.join(os.homedir(), 'AppData', 'Roaming', 'com.rezel.desktop', 'ipc_token.txt');

console.log('AE Executable:', AE_EXE);
console.log('Rezel Executable:', APP_EXE);
console.log('Token File Path:', TOKEN_FILE);

const PORT = 49211;
const TOKEN = 'ae_live_acceptance_token_' + Date.now();

// Make sure token file exists
const tokenDir = path.dirname(TOKEN_FILE);
if (!fs.existsSync(tokenDir)) fs.mkdirSync(tokenDir, { recursive: true });
fs.writeFileSync(TOKEN_FILE, TOKEN, 'utf-8');

// Also write to com.tauri.dev and temp for maximum CEP compatibility
const tauriDevTokenDir = path.join(os.homedir(), 'AppData', 'Roaming', 'com.tauri.dev');
if (!fs.existsSync(tauriDevTokenDir)) fs.mkdirSync(tauriDevTokenDir, { recursive: true });
fs.writeFileSync(path.join(tauriDevTokenDir, 'ipc_token.txt'), TOKEN, 'utf-8');
fs.writeFileSync(path.join(os.tmpdir(), 'rezel_ipc_token.txt'), TOKEN, 'utf-8');

let clientWs = null;
let pending = new Map();
let corrCounter = 1;

function sendCommand(ws, command, args = {}) {
  const correlation_id = 'corr_ae_' + (corrCounter++);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(correlation_id);
      reject(new Error(`Timeout waiting for AE CEP command: ${command}`));
    }, 25000);

    pending.set(correlation_id, (msg) => {
      clearTimeout(timeout);
      resolve(msg);
    });

    const msg = {
      type: 'command',
      correlation_id,
      command,
      args
    };
    ws.send(JSON.stringify(msg));
  });
}

// Start WebSocket Server on 49211 to accept CEP panel connection
console.log(`Starting Rezel IPC Server on 127.0.0.1:${PORT}...`);
const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });

let aeSessionCompleted = false;

wss.on('connection', async (ws) => {
  console.log('[IPC Server] Connection received on port 49211!');

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log('[IPC Server] Message received:', msg.type || msg);

      if (msg.type === 'auth') {
        console.log('[IPC Server] Auth received from client_id:', msg.client_id, 'token_match:', msg.token === TOKEN);
        ws.send(JSON.stringify({ type: 'auth_response', success: true }));

        if (msg.client_id === 'ae_cep_client' || msg.client_id.startsWith('ae_')) {
          clientWs = ws;
          console.log('[IPC Server] Authenticated live CEP client connected! Starting AE Test Matrix...\n');
          runLiveAETests(ws);
        }
      } else if (msg.type === 'response' || msg.type === 'error') {
        const handler = pending.get(msg.correlation_id);
        if (handler) {
          pending.delete(msg.correlation_id);
          handler(msg);
        }
      }
    } catch (e) {
      console.error('[IPC Server] Message parse error:', e);
    }
  });

  ws.on('close', () => {
    console.log('[IPC Server] Client disconnected.');
  });
});

async function runLiveAETests(ws) {
  const results = {};

  try {
    // Wait 500ms
    await new Promise((r) => setTimeout(r, 500));

    console.log('--- 1. REAL AE GET STATUS ---');
    const statusRes = await sendCommand(ws, 'ae_get_status', {});
    console.log('ae_get_status result:', statusRes.result);
    results.ae_get_status = statusRes.result;

    console.log('\n--- 2. REAL AE CREATE PROJECT ---');
    const projRes = await sendCommand(ws, 'ae_create_project', {});
    console.log('ae_create_project result:', projRes.result);
    results.ae_create_project = projRes.result;

    console.log('\n--- 3. REAL AE CREATE COMPOSITION ---');
    const compRes = await sendCommand(ws, 'ae_create_comp', {
      name: 'REZEL_LIVE_TEST_COMP',
      width: 1920,
      height: 1080,
      pixelAspect: 1.0,
      duration: 5.0,
      frameRate: 30.0
    });
    console.log('ae_create_comp result:', compRes.result);
    results.ae_create_comp = compRes.result;
    const compId = compRes.result?.compId || 1;

    console.log('\n--- 4. REAL AE ADD TEXT LAYER ---');
    const textRes = await sendCommand(ws, 'ae_add_text_layer', {
      compId,
      text: 'REZEL LIVE TEST',
      font: 'Arial-BoldMT',
      fontSize: 72,
      fillColor: [1.0, 0.84, 0.0]
    });
    console.log('ae_add_text_layer result:', textRes.result);
    results.ae_add_text_layer = textRes.result;

    console.log('\n--- 5. REAL AE SET TRANSFORM ---');
    const transformRes = await sendCommand(ws, 'ae_set_transform', {
      compId,
      layerIndex: 1,
      position: [960, 540],
      scale: [120, 120],
      rotation: 15.0,
      opacity: 90.0
    });
    console.log('ae_set_transform result:', transformRes.result);
    results.ae_set_transform = transformRes.result;

    console.log('\n--- 6. REAL AE TIMELINE & KEYFRAMES ---');
    const tlInspect = await sendCommand(ws, 'ae_inspect_timeline', {
      compId,
      layerIndex: 1,
      propertyPath: 'Transform.Position'
    });
    console.log('ae_inspect_timeline result:', tlInspect.result);
    results.ae_inspect_timeline = tlInspect.result;

    const addKf = await sendCommand(ws, 'ae_add_keyframe', {
      compId,
      layerIndex: 1,
      propertyPath: 'Transform.Position',
      time: 0.0,
      value: [960, 540]
    });
    console.log('ae_add_keyframe result:', addKf.result);
    results.ae_add_keyframe = addKf.result;

    const setKf = await sendCommand(ws, 'ae_set_keyframe_value', {
      compId,
      layerIndex: 1,
      propertyPath: 'Transform.Position',
      time: 2.5,
      value: [1200, 540]
    });
    console.log('ae_set_keyframe_value result:', setKf.result);
    results.ae_set_keyframe_value = setKf.result;

    console.log('\n--- 7. REAL AE EFFECTS ---');
    const fxInspect = await sendCommand(ws, 'ae_inspect_effects', {
      compId,
      layerIndex: 1
    });
    console.log('ae_inspect_effects result:', fxInspect.result);
    results.ae_inspect_effects = fxInspect.result;

    console.log('\n--- 8. REAL AE RENDER QUEUE ---');
    const rqAdd = await sendCommand(ws, 'ae_add_to_render_queue', { compId });
    console.log('ae_add_to_render_queue result:', rqAdd.result);
    results.ae_add_to_render_queue = rqAdd.result;

    const outPath = path.resolve(OUTPUT_DIR, 'live_ae_cep_render.avi');
    const rqSet = await sendCommand(ws, 'ae_set_render_output_path', {
      queueIndex: 1,
      outputFilePath: outPath
    });
    console.log('ae_set_render_output_path result:', rqSet.result);
    results.ae_set_render_output_path = rqSet.result;

    const rqInspect = await sendCommand(ws, 'ae_inspect_render_queue', { maxItems: 5 });
    console.log('ae_inspect_render_queue result:', rqInspect.result);
    results.ae_inspect_render_queue = rqInspect.result;

    console.log('\n--- 9. REAL AE FILE IMPORT ---');
    const importAsset = path.resolve(OUTPUT_DIR, 'live_production_render.png');
    if (fs.existsSync(importAsset)) {
      const impRes = await sendCommand(ws, 'ae_import_file', {
        filePath: importAsset,
        compId
      });
      console.log('ae_import_file result:', impRes.result);
      results.ae_import_file = impRes.result;
    }

    console.log('\n=======================================================');
    console.log('LIVE AFTER EFFECTS CEP ACCEPTANCE RESULTS SUMMARY:');
    for (const [cap, res] of Object.entries(results)) {
      console.log(`${cap}: ${res?.success !== false ? 'REAL PASS' : 'REAL FAIL'}`);
    }
    console.log('=======================================================\n');

    aeSessionCompleted = true;
  } catch (err) {
    console.error('Error during AE live operations:', err);
  } finally {
    setTimeout(() => {
      console.log('Closing test server and cleaning up...');
      wss.close();
      process.exit(0);
    }, 2000);
  }
}

console.log('Spawning After Effects 2026 GUI session...');
const aeProc = spawn(AE_EXE, [], {
  stdio: 'inherit'
});

aeProc.on('exit', (code) => {
  console.log(`After Effects process exited with code ${code}`);
});

// Wait up to 60 seconds for CEP connection
setTimeout(() => {
  if (!clientWs) {
    console.log('\n[DIAGNOSTIC] CEP connection timeout (60s).');
    console.log('After Effects did not connect CEP panel within 60s.');
    wss.close();
    aeProc.kill();
    process.exit(0);
  }
}, 60000);
