const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

// CEP globals (mock if not in browser)
const cep = typeof window !== 'undefined' ? window.__adobe_cep__ : null;
let ws = null;

function log(msg) {
  console.log(msg);
  if (typeof document !== 'undefined') {
    const el = document.getElementById('log');
    if (el) {
      el.innerHTML += `<div>${msg}</div>`;
      el.scrollTop = el.scrollHeight;
    }
  }
}

function setStatus(status) {
  if (typeof document !== 'undefined') {
    const el = document.getElementById('status');
    if (el) el.innerText = 'Status: ' + status;
  }
}

function getToken() {
  const candidatePaths = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'com.rezel.desktop', 'ipc_token.txt'),
    path.join(os.homedir(), 'AppData', 'Roaming', 'com.tauri.dev', 'ipc_token.txt'),
    path.join(os.tmpdir(), 'rezel_ipc_token.txt')
  ];
  for (const tokenPath of candidatePaths) {
    try {
      if (fs.existsSync(tokenPath)) {
        const token = fs.readFileSync(tokenPath, 'utf8').trim();
        if (token.length > 0) return token;
      }
    } catch (err) {
      log('Failed reading candidate token from ' + tokenPath + ': ' + err.message);
    }
  }
  return null;
}

function evalExtendScript(script, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let timeoutId = setTimeout(() => {
      resolve(JSON.stringify({ success: false, error: 'Timeout: ExtendScript evaluation exceeded ' + timeoutMs + 'ms' }));
    }, timeoutMs);

    if (cep) {
      cep.evalScript(script, (result) => {
        clearTimeout(timeoutId);
        resolve(result);
      });
    } else {
      // Mock for local browser testing outside AE
      clearTimeout(timeoutId);
      resolve(JSON.stringify({ success: false, error: 'Not running in AE' }));
    }
  });
}

const capabilities = [
  {
    name: 'ae_get_status',
    description: 'Get the current status of the After Effects project',
    parameters: { type: 'object', properties: {} },
    category: 'system',
    risk: 'LOW'
  },
  {
    name: 'ae_create_comp',
    description: 'Create a new composition in After Effects',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name of the composition' },
        width: { type: 'number', description: 'Width in pixels (e.g. 1920)' },
        height: { type: 'number', description: 'Height in pixels (e.g. 1080)' },
        pixelAspect: { type: 'number', description: 'Pixel aspect ratio (default 1.0)' },
        duration: { type: 'number', description: 'Duration in seconds (e.g. 10)' },
        frameRate: { type: 'number', description: 'Frames per second (default 30)' }
      },
      required: ['name', 'width', 'height', 'duration']
    },
    category: 'system',
    risk: 'HIGH'
  },
  {
    name: 'ae_add_text_layer',
    description: 'Add a text layer to the specified composition',
    parameters: {
      type: 'object',
      properties: {
        compId: { type: 'number', description: 'ID of the composition' },
        text: { type: 'string', description: 'The text content to add' },
        font: { type: 'string', description: 'Font name (e.g. "Arial-BoldMT")' },
        fontSize: { type: 'number', description: 'Font size in pixels' },
        fillColor: { type: 'array', description: 'RGB array [r,g,b] from 0-1', items: { type: 'number' } }
      },
      required: ['compId', 'text']
    },
    category: 'system',
    risk: 'LOW' // Only modifying project safely, but maybe medium? Keeping LOW to avoid excessive prompts.
  },
  {
    name: 'ae_create_project',
    description: 'Create a new After Effects project (closes current without saving)',
    parameters: { type: 'object', properties: {} },
    category: 'system',
    risk: 'HIGH'
  },
  {
    name: 'ae_set_transform',
    description: 'Set transform properties (position, scale, rotation, opacity) of a layer',
    parameters: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        layerIndex: { type: 'number' },
        position: { type: 'array', items: { type: 'number' }, description: '[x, y] or [x, y, z]' },
        scale: { type: 'array', items: { type: 'number' }, description: '[x, y] or [x, y, z] in percentage (e.g. [100, 100])' },
        rotation: { type: 'number', description: 'Rotation in degrees' },
        opacity: { type: 'number', description: 'Opacity from 0-100' }
      },
      required: ['compId', 'layerIndex']
    },
    category: 'system',
    risk: 'LOW'
  },
  {
    name: 'ae_save_project',
    description: 'Save the current After Effects project to disk',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to save to (e.g. C:\\path\\to\\project.aep)' }
      },
      required: ['path']
    },
    category: 'system',
    risk: 'MEDIUM'
  },
  {
    name: 'ae_inspect_project',
    description: 'Inspect the project hierarchy to get compositions, layers, and structure',
    parameters: { type: 'object', properties: {} },
    category: 'system',
    risk: 'LOW'
  },
  {
    name: 'ae_inspect_timeline',
    description: 'Inspect timeline, current time, properties and keyframes of active composition or layer',
    parameters: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        layerIndex: { type: 'number' },
        propertyPath: { type: 'string' },
        maxProperties: { type: 'number' },
        maxKeyframes: { type: 'number' }
      }
    },
    category: 'system',
    risk: 'LOW'
  },
  {
    name: 'ae_add_keyframe',
    description: 'Add a keyframe at specified time for a property',
    parameters: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        layerIndex: { type: 'number' },
        propertyPath: { type: 'string' },
        time: { type: 'number' },
        value: { description: 'Number or array of numbers' }
      },
      required: ['compId', 'layerIndex', 'propertyPath', 'time', 'value']
    },
    category: 'system',
    risk: 'LOW'
  },
  {
    name: 'ae_set_keyframe_value',
    description: 'Set value of an existing keyframe at specified time',
    parameters: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        layerIndex: { type: 'number' },
        propertyPath: { type: 'string' },
        time: { type: 'number' },
        value: { description: 'Number or array of numbers' }
      },
      required: ['compId', 'layerIndex', 'propertyPath', 'time', 'value']
    },
    category: 'system',
    risk: 'LOW'
  },
  {
    name: 'ae_inspect_effects',
    description: 'Inspect effects applied to a layer and their parameters',
    parameters: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        layerIndex: { type: 'number' },
        maxEffects: { type: 'number' },
        maxPropertiesPerEffect: { type: 'number' }
      }
    },
    category: 'system',
    risk: 'LOW'
  },
  {
    name: 'ae_set_property_value',
    description: 'Set static value of an effect property on a layer',
    parameters: {
      type: 'object',
      properties: {
        compId: { type: 'number' },
        layerIndex: { type: 'number' },
        propertyPath: { type: 'string' },
        value: { description: 'Static property value (number, array, boolean, string)' },
        effectMatchName: { type: 'string' },
        occurrenceIndex: { type: 'number' }
      },
      required: ['layerIndex', 'propertyPath', 'value']
    },
    category: 'system',
    risk: 'MEDIUM'
  },
  {
    name: 'ae_inspect_render_queue',
    description: 'Inspect the After Effects render queue and queued items',
    parameters: {
      type: 'object',
      properties: {
        maxItems: { type: 'number' }
      }
    },
    category: 'system',
    risk: 'LOW'
  },
  {
    name: 'ae_add_to_render_queue',
    description: 'Add a composition to the After Effects render queue',
    parameters: {
      type: 'object',
      properties: {
        compId: { type: 'number' }
      }
    },
    category: 'system',
    risk: 'MEDIUM'
  },
  {
    name: 'ae_set_render_output_path',
    description: 'Set destination output file path for a render queue item',
    parameters: {
      type: 'object',
      properties: {
        queueIndex: { type: 'number' },
        outputFilePath: { type: 'string' },
        expectedCompId: { type: 'string' }
      },
      required: ['queueIndex', 'outputFilePath']
    },
    category: 'system',
    risk: 'MEDIUM'
  },
  {
    name: 'ae_start_render',
    description: 'Start synchronous render queue execution in After Effects',
    parameters: {
      type: 'object',
      properties: {}
    },
    category: 'system',
    risk: 'HIGH'
  },
  {
    name: 'ae_import_file',
    description: 'Import an external file/footage asset into After Effects project or composition',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Absolute path to file to import' },
        compId: { type: 'number', description: 'Optional composition ID to add the imported footage to as a layer' }
      },
      required: ['filePath']
    },
    category: 'system',
    risk: 'MEDIUM'
  }
];

function connect() {
  const token = getToken();
  if (!token) {
    setStatus('Missing Token');
    return;
  }

  setStatus('Connecting...');
  ws = new WebSocket('ws://127.0.0.1:49211');

  ws.on('open', () => {
    setStatus('Connected');
    log('Connected to Rezel Desktop IPC');

    // Authenticate with Rezel Desktop IPC
    ws.send(JSON.stringify({
      type: 'auth',
      token: token,
      client_id: 'ae_cep_client',
      capabilities: capabilities
    }));
  });

  ws.on('message', async (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch (e) {
      log('Invalid JSON received: ' + data);
      return;
    }

    log('Received command: ' + JSON.stringify(msg));

    if (msg.type === 'command') {
      const { command, args, correlation_id } = msg;
      let jsxCall = '';

      if (command === 'ae_get_status') {
        jsxCall = 'Rezel.getStatus()';
      } else if (command === 'ae_create_comp') {
        const name = args.name ? `"${args.name}"` : '"Comp 1"';
        const width = args.width || 1920;
        const height = args.height || 1080;
        const pixelAspect = args.pixelAspect || 1.0;
        const duration = args.duration || 10.0;
        const frameRate = args.frameRate || 30.0;
        jsxCall = `Rezel.createComp(${name}, ${width}, ${height}, ${pixelAspect}, ${duration}, ${frameRate})`;
      } else if (command === 'ae_add_text_layer') {
        const compId = args.compId;
        const text = args.text ? `"${args.text.replace(/"/g, '\\"')}"` : '"Hello World"';
        const font = args.font ? `"${args.font}"` : 'null';
        const fontSize = args.fontSize || 50;
        const fillColor = args.fillColor ? JSON.stringify(args.fillColor) : 'null';
        jsxCall = `Rezel.addTextLayer(${compId}, ${text}, ${font}, ${fontSize}, ${fillColor})`;
      } else if (command === 'ae_create_project') {
        jsxCall = 'Rezel.createProject()';
      } else if (command === 'ae_set_transform') {
        const compId = args.compId;
        const layerIndex = args.layerIndex;
        const position = args.position ? JSON.stringify(args.position) : 'null';
        const scale = args.scale ? JSON.stringify(args.scale) : 'null';
        const rotation = args.rotation !== undefined ? args.rotation : 'null';
        const opacity = args.opacity !== undefined ? args.opacity : 'null';
        jsxCall = `Rezel.setTransform(${compId}, ${layerIndex}, ${position}, ${scale}, ${rotation}, ${opacity})`;
      } else if (command === 'ae_save_project') {
        const pathStr = args.path ? `"${args.path.replace(/\\/g, '\\\\')}"` : 'null';
        jsxCall = `Rezel.saveProject(${pathStr})`;
      } else if (command === 'ae_inspect_project') {
        const maxItems = args.maxItems ? Number(args.maxItems) : 100;
        const maxLayers = args.maxLayers ? Number(args.maxLayers) : 50;
        jsxCall = `Rezel.inspectProject(${maxItems}, ${maxLayers})`;
      } else if (command === 'ae_inspect_timeline') {
        const compId = args.compId ? Number(args.compId) : "null";
        const layerIndex = args.layerIndex ? Number(args.layerIndex) : "null";
        const propertyPath = args.propertyPath ? `"${String(args.propertyPath).replace(/"/g, '\\"')}"` : "null";
        const maxProperties = args.maxProperties ? Number(args.maxProperties) : 50;
        const maxKeyframes = args.maxKeyframes ? Number(args.maxKeyframes) : 200;
        jsxCall = `Rezel.inspectTimeline(${compId}, ${layerIndex}, ${propertyPath}, ${maxProperties}, ${maxKeyframes})`;
      } else if (command === 'ae_add_keyframe') {
        const compId = args.compId ? Number(args.compId) : "null";
        const layerIndex = Number(args.layerIndex);
        const propertyPath = String(args.propertyPath || '').replace(/"/g, '\\"');
        const time = Number(args.time);
        const value = typeof args.value === 'string' ? `"${args.value.replace(/"/g, '\\"')}"` : JSON.stringify(args.value);
        jsxCall = `Rezel.addKeyframe(${compId}, ${layerIndex}, "${propertyPath}", ${time}, ${value})`;
      } else if (command === 'ae_set_keyframe_value') {
        const compId = args.compId ? Number(args.compId) : "null";
        const layerIndex = Number(args.layerIndex);
        const propertyPath = String(args.propertyPath || '').replace(/"/g, '\\"');
        const time = Number(args.time);
        const value = typeof args.value === 'string' ? `"${args.value.replace(/"/g, '\\"')}"` : JSON.stringify(args.value);
        jsxCall = `Rezel.setKeyframeValue(${compId}, ${layerIndex}, "${propertyPath}", ${time}, ${value})`;
      } else if (command === 'ae_inspect_effects') {
        const compId = args.compId ? Number(args.compId) : "null";
        const layerIndex = args.layerIndex ? Number(args.layerIndex) : "null";
        const maxEffects = args.maxEffects ? Number(args.maxEffects) : 50;
        const maxPropertiesPerEffect = args.maxPropertiesPerEffect ? Number(args.maxPropertiesPerEffect) : 100;
        jsxCall = `Rezel.inspectEffects(${compId}, ${layerIndex}, ${maxEffects}, ${maxPropertiesPerEffect})`;
      } else if (command === 'ae_set_property_value') {
        const compId = args.compId ? Number(args.compId) : "null";
        const layerIndex = Number(args.layerIndex);
        const propertyPath = String(args.propertyPath || '').replace(/"/g, '\\"');
        const expectedMatchName = args.effectMatchName ? `"${String(args.effectMatchName).replace(/"/g, '\\"')}"` : "null";
        const occurrenceIndex = args.occurrenceIndex ? Number(args.occurrenceIndex) : "null";

        function formatStaticValue(v) {
          if (typeof v === 'number' && !isNaN(v) && isFinite(v)) return v;
          if (typeof v === 'boolean') return v ? 'true' : 'false';
          if (typeof v === 'string') return `"${v.replace(/"/g, '\\"')}"`;
          if (Array.isArray(v)) {
            const valid = v.every(n => typeof n === 'number' && !isNaN(n) && isFinite(n));
            if (valid) return `[${v.join(',')}]`;
          }
          return 'null';
        }

        const value = formatStaticValue(args.value);
        if (value === 'null' && args.value !== null) {
          ws.send(JSON.stringify({ type: 'error', correlation_id, message: 'Invalid or unsupported property value type' }));
          return;
        }

        jsxCall = `Rezel.setPropertyValue(${compId}, ${layerIndex}, "${propertyPath}", ${value}, ${expectedMatchName}, ${occurrenceIndex})`;
      } else if (command === 'ae_inspect_render_queue') {
        const maxItems = args.maxItems ? Number(args.maxItems) : 100;
        jsxCall = `Rezel.inspectRenderQueue(${maxItems})`;
      } else if (command === 'ae_add_to_render_queue') {
        const compId = args.compId ? Number(args.compId) : "null";
        jsxCall = `Rezel.addToRenderQueue(${compId})`;
      } else if (command === 'ae_set_render_output_path') {
        const queueIndex = Number(args.queueIndex);
        const outputFilePath = String(args.outputFilePath || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const expectedCompId = args.expectedCompId ? `"${String(args.expectedCompId).replace(/"/g, '\\"')}"` : "null";
        jsxCall = `Rezel.setRenderOutputPath(${queueIndex}, "${outputFilePath}", ${expectedCompId})`;
      } else if (command === 'ae_start_render') {
        jsxCall = 'Rezel.startRender()';
      } else if (command === 'ae_import_file') {
        const filePath = String(args.filePath || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const compId = args.compId !== undefined && args.compId !== null ? Number(args.compId) : "null";
        jsxCall = `Rezel.importFile("${filePath}", ${compId})`;
      } else {
        ws.send(JSON.stringify({
          type: 'error',
          correlation_id,
          message: 'Unsupported command: ' + command
        }));
        return;
      }

      // Execute safely structured call
      try {
        const resultRaw = await evalExtendScript(jsxCall);
        let resultObj;
        try {
          resultObj = JSON.parse(resultRaw);
        } catch(e) {
          resultObj = { success: false, error: 'Invalid JSON returned from ExtendScript: ' + resultRaw };
        }

        ws.send(JSON.stringify({
          type: 'response',
          correlation_id,
          success: resultObj.success !== false, // Default to true if not explicitly false
          result: resultObj,
          error: resultObj.error
        }));
      } catch (err) {
        ws.send(JSON.stringify({
          type: 'response',
          correlation_id,
          success: false,
          error: err.message
        }));
      }
    }
  });

  ws.on('close', () => {
    setStatus('Disconnected');
    setTimeout(connect, 5000); // Reconnect
  });

  ws.on('error', (err) => {
    log('WS Error: ' + err.message);
  });
}

// Start
connect();
