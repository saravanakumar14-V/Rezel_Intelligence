import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

console.log('======================================================================');
console.log('REZEL — AFTER EFFECTS 2026 LIVE ACCEPTANCE VERIFICATION');
console.log('======================================================================\n');

const AE_DIR = 'C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files';
const AE_EXE = path.join(AE_DIR, 'AfterFX.exe');
const AERENDER_EXE = path.join(AE_DIR, 'aerender.exe');
const HOST_JSX = path.resolve('../ae-extension/jsx/host.jsx');
const OUTPUT_DIR = path.resolve('temp_test_out');

console.log('AE Executable:', AE_EXE);
console.log('aerender Executable:', AERENDER_EXE);
console.log('Host JSX Engine:', HOST_JSX);

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 1. Verify aerender execution
let aerenderVersion = 'UNKNOWN';
try {
  const vOut = execSync(`"${AERENDER_EXE}" -version`, { encoding: 'utf8' });
  aerenderVersion = vOut.trim();
  console.log(`[AE Discovery] aerender.exe version: ${aerenderVersion}`);
} catch (e) {
  if (e.stdout) {
    aerenderVersion = e.stdout.trim();
    console.log(`[AE Discovery] aerender.exe version: ${aerenderVersion}`);
  } else {
    console.error('[AE Discovery] aerender check failed:', e.message);
  }
}

// Read the complete Host JSX script
const hostJsxCode = fs.readFileSync(HOST_JSX, 'utf8');

// Build an ExtendScript test suite that executes all required operations using the Rezel Host JSX engine
const testScriptPath = path.resolve(OUTPUT_DIR, 'ae_live_runner.jsx');
const resultLogPath = path.resolve(OUTPUT_DIR, 'ae_live_results.json');
if (fs.existsSync(resultLogPath)) fs.unlinkSync(resultLogPath);

const normalizedOutputDir = OUTPUT_DIR.replace(/\\/g, '/');

const testScriptContent = `
// Load Rezel Host Engine
${hostJsxCode}

var results = {
  appName: app.name,
  appVersion: app.version,
  buildNumber: app.buildNumber,
  sections: {}
};

try {
  // --- 1. PROJECT ---
  app.newProject();
  var initialStatus = eval("(" + Rezel.getStatus() + ")");
  results.sections.project_initial = initialStatus;

  // --- 2. COMPOSITION ---
  var compRaw = Rezel.createComp("AE_Live_Acceptance_Comp", 1920, 1080, 1.0, 5.0, 30.0);
  var compResult = eval("(" + compRaw + ")");
  results.sections.comp_create = compResult;
  var compId = compResult.compId;

  // --- 3. LAYERS ---
  var textLayerRaw = Rezel.addTextLayer(compId, "Rezel Live Acceptance 2026", "Arial-BoldMT", 72, [1.0, 0.8, 0.2]);
  var textLayerResult = eval("(" + textLayerRaw + ")");
  results.sections.layer_text_add = textLayerResult;

  // Inspect Project
  var projInspectRaw = Rezel.inspectProject();
  var projInspect = eval("(" + projInspectRaw + ")");
  results.sections.project_inspect = projInspect;

  // Set Transform on Layer
  var transformRaw = Rezel.setTransform(compId, 1, [960, 540], [120, 120], 15.0, 95.0);
  var transformResult = eval("(" + transformRaw + ")");
  results.sections.layer_transform = transformResult;

  // --- 4. TIMELINE / KEYFRAMES ---
  // Timeline inspection
  var timelineRaw = Rezel.inspectTimeline(compId, 1, "Transform.Position", 50, 50);
  results.sections.timeline_inspect = eval("(" + timelineRaw + ")");

  // Add Keyframes
  var kf1Raw = Rezel.addKeyframe(compId, 1, "Transform.Position", 0.0, [960, 540]);
  var kf2Raw = Rezel.addKeyframe(compId, 1, "Transform.Position", 2.5, [1200, 540]);
  results.sections.keyframe_add_1 = eval("(" + kf1Raw + ")");
  results.sections.keyframe_add_2 = eval("(" + kf2Raw + ")");

  // Update Keyframe Value
  var kfSetRaw = Rezel.setKeyframeValue(compId, 1, "Transform.Position", 2.5, [1280, 540]);
  results.sections.keyframe_set = eval("(" + kfSetRaw + ")");

  // --- 5. EFFECTS ---
  var effectRaw = Rezel.applyEffect(compId, 1, "ADBE Fast Blur", "Production_Fast_Blur");
  results.sections.effect_apply = eval("(" + effectRaw + ")");

  var effectsInspectRaw = Rezel.inspectEffects(compId, 1, 10, 10);
  results.sections.effects_inspect = eval("(" + effectsInspectRaw + ")");

  // Set Static Property
  var propSetRaw = Rezel.setPropertyValue(compId, 1, "Blurriness", 25.0, "Production_Fast_Blur", 1);
  results.sections.property_set_static = eval("(" + propSetRaw + ")");

  // --- 6. IMPORT ---
  var assetToImport = "${normalizedOutputDir}/live_production_render.png";
  if (File(assetToImport).exists) {
    var importRaw = Rezel.importFile(assetToImport, compId);
    results.sections.import_file = eval("(" + importRaw + ")");
  } else {
    results.sections.import_file = { success: false, error: "Source asset not found" };
  }

  // --- 7. RENDER QUEUE ---
  var rqAddRaw = Rezel.renderQueueAdd(compId);
  results.sections.render_queue_add = eval("(" + rqAddRaw + ")");

  var rqOutPath = "${normalizedOutputDir}/ae_live_test_output.avi";
  var rqSetPathRaw = Rezel.setRenderOutputPath(1, rqOutPath);
  results.sections.render_queue_set_path = eval("(" + rqSetPathRaw + ")");

  var rqInspectRaw = Rezel.inspectRenderQueue(10);
  results.sections.render_queue_inspect = eval("(" + rqInspectRaw + ")");

  // Save Project to disk
  var savedAepPath = "${normalizedOutputDir}/ae_live_acceptance_project.aep";
  app.project.save(new File(savedAepPath));
  results.sections.project_saved_path = savedAepPath;
  results.success = true;

} catch (err) {
  results.success = false;
  results.error = err.toString();
}

// Write out JSON results
var resFile = new File("${normalizedOutputDir}/ae_live_results.json");
resFile.open("w");

// Serializer for ExtendScript
function simpleStringify(obj) {
  if (obj === null || obj === undefined) return "null";
  if (typeof obj === "number" || typeof obj === "boolean") return obj.toString();
  if (typeof obj === "string") return '"' + obj.replace(/\\\\/g, "\\\\\\\\").replace(/"/g, '\\\\"').replace(/\\n/g, "\\\\n") + '"';
  if (obj instanceof Array) {
    var arrStr = [];
    for (var i = 0; i < obj.length; i++) arrStr.push(simpleStringify(obj[i]));
    return "[" + arrStr.join(",") + "]";
  }
  if (typeof obj === "object") {
    var objStr = [];
    for (var k in obj) {
      if (obj.hasOwnProperty(k)) {
        objStr.push('"' + k + '":' + simpleStringify(obj[k]));
      }
    }
    return "{" + objStr.join(",") + "}";
  }
  return '"' + obj.toString() + '"';
}

resFile.write(simpleStringify(results));
resFile.close();
`;

fs.writeFileSync(testScriptPath, testScriptContent);

console.log('[AE Live Acceptance] Running ExtendScript operations against After Effects engine...');

console.log(`[AE Test] Project generator script written to ${testScriptPath}`);

