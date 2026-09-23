import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';

const PORT = 49211;
const TOKEN = 'rezel_live_cep_token_' + Date.now();
const tokenPaths = [
  path.join(os.homedir(), 'AppData', 'Roaming', 'com.rezel.desktop', 'ipc_token.txt'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'com.tauri.dev', 'ipc_token.txt'),
  path.join(os.tmpdir(), 'rezel_ipc_token.txt')
];
for (const tp of tokenPaths) {
  fs.writeFileSync(tp, TOKEN, 'utf-8');
}

let corrCounter = 1;
function sendCommand(ws, command, args = {}) {
  const correlation_id = 'corr_live_' + (corrCounter++);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout on ${command}`)), 15000);
    const handler = (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.correlation_id === correlation_id) {
          ws.off('message', handler);
          clearTimeout(timeout);
          resolve(msg);
        }
      } catch (e) {}
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ type: 'command', correlation_id, command, args }));
  });
}

const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });

wss.on('connection', async (ws) => {
  ws.once('message', async (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'auth') {
      ws.send(JSON.stringify({ type: 'auth_response', success: true }));

      console.log('Testing updated ae_create_project...');
      const cpRes = await sendCommand(ws, 'ae_create_project', {});
      console.log('ae_create_project result:', cpRes.result);

      console.log('Testing ae_get_status on clean project...');
      const stRes = await sendCommand(ws, 'ae_get_status', {});
      console.log('ae_get_status result:', stRes.result);

      console.log('Testing ae_create_comp on clean project...');
      const compRes = await sendCommand(ws, 'ae_create_comp', {
        name: 'FINAL_CLEAN_COMP_2026',
        width: 1920,
        height: 1080,
        pixelAspect: 1.0,
        duration: 10.0,
        frameRate: 30.0
      });
      console.log('ae_create_comp result:', compRes.result);

      ws.close();
      wss.close();
      process.exit(0);
    }
  });
});

// Reload host.jsx and trigger connection in CEP panel via CDP
async function trigger() {
  try {
    const listRes = await fetch('http://127.0.0.1:8088/json/list');
    const pages = await listRes.json();
    if (pages && pages.length > 0) {
      const cdpWs = new WebSocket(pages[0].webSocketDebuggerUrl);
      cdpWs.on('open', () => {
        const hostJsxPath = fileURLToPath(new URL('../ae-extension/jsx/host.jsx', import.meta.url));
        const mainJsPath = fileURLToPath(new URL('../ae-extension/js/main.js', import.meta.url));
        const hostJsx = fs.readFileSync(hostJsxPath, 'utf8');
        const mainJs = fs.readFileSync(mainJsPath, 'utf8');
        cdpWs.send(JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression: `
              window.__adobe_cep__.evalScript(${JSON.stringify(hostJsx)}, function() {
                eval(${JSON.stringify(mainJs)});
              });
            `
          }
        }));
      });
    }
  } catch (e) {}
}

setTimeout(trigger, 800);
