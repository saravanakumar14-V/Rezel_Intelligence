import WebSocket from 'ws';
import path from 'path';
import fs from 'fs';

console.log('======================================================================');
console.log('REZEL — INTERACTIVE CEP PANEL DIRECT CDP & WS HARNESS');
console.log('======================================================================\n');

async function main() {
  const listRes = await fetch('http://127.0.0.1:8088/json/list');
  const pages = await listRes.json();
  console.log('[CDP] Active CEP Pages:', pages);

  if (!pages || pages.length === 0) {
    console.error('No CEP page found on port 8088');
    process.exit(1);
  }

  const page = pages[0];
  const wsUrl = page.webSocketDebuggerUrl;
  console.log(`[CDP] Connecting to CEP DevTools WebSocket: ${wsUrl}`);

  const cdpWs = new WebSocket(wsUrl);
  let cdpId = 1;
  const pendingCdp = new Map();

  function sendCdp(method, params = {}) {
    const id = cdpId++;
    return new Promise((resolve, reject) => {
      pendingCdp.set(id, resolve);
      cdpWs.send(JSON.stringify({ id, method, params }));
    });
  }

  cdpWs.on('open', async () => {
    console.log('[CDP] Connected to Chromium Webview!');

    // Enable Console and Runtime
    await sendCdp('Console.enable');
    await sendCdp('Runtime.enable');

    console.log('[CDP] Evaluating window.location & document.title...');
    const locRes = await sendCdp('Runtime.evaluate', { expression: 'window.location.href' });
    console.log('[CDP] Inspecting window properties and document scripts...');
    const domRes = await sendCdp('Runtime.evaluate', {
      expression: `
        (function() {
          var scripts = Array.from(document.querySelectorAll('script')).map(s => s.src);
          var keys = Object.keys(window).filter(k => !k.startsWith('webkit') && !k.startsWith('on'));
          return {
            title: document.title,
            body: document.body.innerHTML,
            scripts: scripts,
            hasCSInterface: typeof CSInterface !== 'undefined',
            windowKeys: keys.slice(0, 30)
          };
        })()
      `,
      returnByValue: true
    });
    console.log('[CDP] Loading and executing main.js code in CEP webview...');
    const mainJsContent = fs.readFileSync('d:/Projects/Rezel/apps/ae-extension/js/main.js', 'utf8');
    const execRes = await sendCdp('Runtime.evaluate', {
      expression: `
        (function() {
          try {
            eval(${JSON.stringify(mainJsContent)});
            return {
              success: true,
              statusText: document.getElementById('status') ? document.getElementById('status').innerText : '',
              logText: document.getElementById('log') ? document.getElementById('log').innerText : ''
            };
          } catch(e) {
            return {
              success: false,
              error: e.toString(),
              stack: e.stack
            };
          }
        })()
      `,
      returnByValue: true
    });
    console.log('[CDP] main.js execution result:', JSON.stringify(execRes.result?.value, null, 2));
  });

  cdpWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.id && pendingCdp.has(msg.id)) {
        const res = pendingCdp.get(msg.id);
        pendingCdp.delete(msg.id);
        res(msg.result);
      } else if (msg.method === 'Runtime.consoleAPICalled') {
        const args = msg.params.args.map(a => a.value || JSON.stringify(a)).join(' ');
        console.log(`[CEP Console (${msg.params.type})]:`, args);
      }
    } catch (e) {
      console.error('[CDP Message Parse Error]:', e);
    }
  });
}

main().catch(console.error);
