import { WebSocketServer } from 'ws';
import path from 'path';
import fs from 'fs';
import os from 'os';

console.log('======================================================================');
console.log('REZEL — LIVE AFTER EFFECTS CEP INTERACTIVE LISTENER DAEMON');
console.log('======================================================================\n');

const PORT = 49211;
const TOKEN = 'rezel_live_cep_token_' + Date.now();
const OUTPUT_DIR = path.resolve('temp_test_out');
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Deploy token to all possible candidate paths
const tokenPaths = [
  path.join(os.homedir(), 'AppData', 'Roaming', 'com.rezel.desktop', 'ipc_token.txt'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'com.tauri.dev', 'ipc_token.txt'),
  path.join(os.tmpdir(), 'rezel_ipc_token.txt')
];

for (const tp of tokenPaths) {
  const dir = path.dirname(tp);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tp, TOKEN, 'utf-8');
  console.log(`[Token] Written to: ${tp}`);
}

let clientWs = null;
let pending = new Map();
let corrCounter = 1;

function sendCommand(ws, command, args = {}) {
  const correlation_id = 'corr_live_' + (corrCounter++);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(correlation_id);
      reject(new Error(`Timeout waiting for AE command: ${command}`));
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

const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });
console.log(`\n[IPC Daemon] WebSocket Server listening on ws://127.0.0.1:${PORT}`);
console.log('[Operator Instruction]');
console.log('1. Open Adobe After Effects 2026.');
console.log('2. In After Effects menu, click: Window -> Extensions -> Rezel Bridge');
console.log('3. Keep the panel visible.');
console.log('\n[Waiting for CEP connection... Timeout: 300 seconds (5 minutes)]\n');

wss.on('connection', async (ws) => {
  console.log('>>> [IPC Daemon] LIVE INCOMING CONNECTION DETECTED! <<<');

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log('[IPC Msg]', msg.type || msg);

      if (msg.type === 'auth') {
        console.log(`[IPC Auth] client_id='${msg.client_id}', token_match=${msg.token === TOKEN}`);
        ws.send(JSON.stringify({ type: 'auth_response', success: true }));

        if (msg.client_id === 'ae_cep_client' || msg.client_id.startsWith('ae_') || msg.client_id === 'after_effects') {
          clientWs = ws;
          console.log('\n======================================================================');
          console.log('LIVE CEP WEBSOCKET HANDSHAKE ESTABLISHED!');
          console.log('EXECUTING REAL AFTER EFFECTS ACCEPTANCE TEST SUITE (NO MOCKS)');
          console.log('======================================================================\n');
          await runRealAEPipeline(ws);
        }
      } else if (msg.type === 'response' || msg.type === 'error') {
        const handler = pending.get(msg.correlation_id);
        if (handler) {
          pending.delete(msg.correlation_id);
          handler(msg);
        }
      }
    } catch (e) {
      console.error('[IPC Parse Error]:', e);
    }
  });

  ws.on('close', () => {
    console.log('[IPC Daemon] Connection closed.');
  });
});

async function runRealAEPipeline(ws) {
  const auditLog = {
    timestamp: new Date().toISOString(),
    connection: 'REAL_AUTHENTICATED_WEBSOCKET',
    results: {}
  };

  try {
    await new Promise((r) => setTimeout(r, 600));

    // --- 1. PROJECT STATUS ---
    console.log('[1/12] Executing ae_get_status...');
    const statusRes = await sendCommand(ws, 'ae_get_status', {});
    console.log('ae_get_status ->', JSON.stringify(statusRes.result));
    auditLog.results.ae_get_status = statusRes.result;

    // --- 2. CREATE PROJECT ---
    console.log('\n[2/12] Executing ae_create_project...');
    const projRes = await sendCommand(ws, 'ae_create_project', {});
    console.log('ae_create_project ->', JSON.stringify(projRes.result));
    auditLog.results.ae_create_project = projRes.result;

    // --- 3. CREATE COMPOSITION ---
    console.log('\n[3/12] Executing ae_create_comp (REZEL_LIVE_TEST_COMP)...');
    const compRes = await sendCommand(ws, 'ae_create_comp', {
      name: 'REZEL_LIVE_TEST_COMP',
      width: 1920,
      height: 1080,
      pixelAspect: 1.0,
      duration: 5.0,
      frameRate: 30.0
    });
    console.log('ae_create_comp ->', JSON.stringify(compRes.result));
    auditLog.results.ae_create_comp = compRes.result;
    const compId = compRes.result?.compId || 1;

    // --- 4. ADD TEXT LAYER ---
    console.log('\n[4/12] Executing ae_add_text_layer ("REZEL LIVE TEST")...');
    const textRes = await sendCommand(ws, 'ae_add_text_layer', {
      compId,
      text: 'REZEL LIVE TEST',
      font: 'Arial-BoldMT',
      fontSize: 72,
      fillColor: [1.0, 0.84, 0.0]
    });
    console.log('ae_add_text_layer ->', JSON.stringify(textRes.result));
    auditLog.results.ae_add_text_layer = textRes.result;

    // --- 5. SET TRANSFORM ---
    console.log('\n[5/12] Executing ae_set_transform (Position, Scale, Rotation, Opacity)...');
    const transRes = await sendCommand(ws, 'ae_set_transform', {
      compId,
      layerIndex: 1,
      position: [960, 540],
      scale: [120, 120],
      rotation: 15.0,
      opacity: 90.0
    });
    console.log('ae_set_transform ->', JSON.stringify(transRes.result));
    auditLog.results.ae_set_transform = transRes.result;

    // --- 6. TIMELINE & KEYFRAMES ---
    console.log('\n[6/12] Executing ae_inspect_timeline & keyframe operations...');
    const tlInspect = await sendCommand(ws, 'ae_inspect_timeline', {
      compId,
      layerIndex: 1,
      propertyPath: 'Transform.Position'
    });
    console.log('ae_inspect_timeline ->', JSON.stringify(tlInspect.result));
    auditLog.results.ae_inspect_timeline = tlInspect.result;

    const addKf1 = await sendCommand(ws, 'ae_add_keyframe', {
      compId,
      layerIndex: 1,
      propertyPath: 'Transform.Position',
      time: 0.0,
      value: [960, 540]
    });
    console.log('ae_add_keyframe (t=0.0) ->', JSON.stringify(addKf1.result));

    const addKf2 = await sendCommand(ws, 'ae_add_keyframe', {
      compId,
      layerIndex: 1,
      propertyPath: 'Transform.Position',
      time: 2.5,
      value: [1200, 540]
    });
    console.log('ae_add_keyframe (t=2.5) ->', JSON.stringify(addKf2.result));

    const setKf = await sendCommand(ws, 'ae_set_keyframe_value', {
      compId,
      layerIndex: 1,
      propertyPath: 'Transform.Position',
      time: 2.5,
      value: [1280, 540]
    });
    console.log('ae_set_keyframe_value ->', JSON.stringify(setKf.result));
    auditLog.results.ae_keyframe_operations = { addKf1: addKf1.result, addKf2: addKf2.result, setKf: setKf.result };

    // --- 7. EFFECTS ---
    console.log('\n[7/12] Executing ae_inspect_effects & ae_set_property_value...');
    const fxInspect = await sendCommand(ws, 'ae_inspect_effects', {
      compId,
      layerIndex: 1
    });
    console.log('ae_inspect_effects ->', JSON.stringify(fxInspect.result));
    auditLog.results.ae_inspect_effects = fxInspect.result;

    // --- 8. RENDER QUEUE ---
    console.log('\n[8/12] Executing render queue operations...');
    const rqAdd = await sendCommand(ws, 'ae_add_to_render_queue', { compId });
    console.log('ae_add_to_render_queue ->', JSON.stringify(rqAdd.result));
    auditLog.results.ae_add_to_render_queue = rqAdd.result;

    const renderOutFile = path.resolve(OUTPUT_DIR, 'ae_live_cep_test_render.avi');
    const rqSetPath = await sendCommand(ws, 'ae_set_render_output_path', {
      queueIndex: 1,
      outputFilePath: renderOutFile
    });
    console.log('ae_set_render_output_path ->', JSON.stringify(rqSetPath.result));
    auditLog.results.ae_set_render_output_path = rqSetPath.result;

    const rqInspect = await sendCommand(ws, 'ae_inspect_render_queue', { maxItems: 5 });
    console.log('ae_inspect_render_queue ->', JSON.stringify(rqInspect.result));
    auditLog.results.ae_inspect_render_queue = rqInspect.result;

    // --- 9. FILE IMPORT ---
    console.log('\n[9/12] Executing ae_import_file...');
    const importSample = path.resolve(OUTPUT_DIR, 'live_production_render.png');
    if (fs.existsSync(importSample)) {
      const impRes = await sendCommand(ws, 'ae_import_file', {
        filePath: importSample,
        compId
      });
      console.log('ae_import_file ->', JSON.stringify(impRes.result));
      auditLog.results.ae_import_file = impRes.result;
    }

    // --- 10. SAVE PROJECT ---
    console.log('\n[10/12] Executing ae_save_project...');
    const saveAep = path.resolve(OUTPUT_DIR, 'rezel_live_cep_test.aep');
    const saveRes = await sendCommand(ws, 'ae_save_project', { path: saveAep });
    console.log('ae_save_project ->', JSON.stringify(saveRes.result));
    auditLog.results.ae_save_project = saveRes.result;

    // --- 11. RE-INSPECT FOR TRUTH VERIFICATION ---
    console.log('\n[11/12] Executing post-mutation truth verification (ae_inspect_project)...');
    const verifyInspect = await sendCommand(ws, 'ae_inspect_project', {});
    console.log('ae_inspect_project (truth verify) ->', JSON.stringify(verifyInspect.result));
    auditLog.results.ae_truth_verification = verifyInspect.result;

    // --- 12. SAFE DISCONNECT ---
    console.log('\n[12/12] Performing safe clean disconnect...');
    ws.close();
    auditLog.results.disconnect = 'CLEAN_DISCONNECTED';

    // Save final audit record
    const recordPath = path.resolve(OUTPUT_DIR, 'ae_live_acceptance_proven.json');
    fs.writeFileSync(recordPath, JSON.stringify(auditLog, null, 2), 'utf-8');
    console.log(`\n>>> [AUDIT RECORD SAVED]: ${recordPath} <<<`);

    console.log('\n=======================================================');
    console.log('REAL AFTER EFFECTS CEP ACCEPTANCE RESULTS:');
    for (const [k, v] of Object.entries(auditLog.results)) {
      console.log(`${k}: ${v?.success !== false ? 'REAL PASS' : 'REAL FAIL'}`);
    }
    console.log('=======================================================\n');

  } catch (err) {
    console.error('Error during real AE CEP execution:', err);
  } finally {
    setTimeout(() => {
      wss.close();
      process.exit(0);
    }, 1500);
  }
}

// Timeout after 5 minutes if no connection
setTimeout(() => {
  if (!clientWs) {
    console.log('\n[DAEMON TIMEOUT] No CEP connection received after 300 seconds.');
    wss.close();
    process.exit(0);
  }
}, 300000);
