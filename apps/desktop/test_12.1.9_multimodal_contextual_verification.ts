import * as THREE from 'three';
import {
  getSpectralPalette,
  type CoreVisualState,
} from './src/components/core/coreSpectralTheme';
import { ContextualIntentResolver } from './src/lib/ai/context/ContextualIntentResolver';

async function runMultimodalContextualVerification() {
  console.log("=================================================================");
  console.log("  REZEL R4 MULTIMODAL INTERACTION & CONTEXTUAL INTELLIGENCE VERIFY");
  console.log("=================================================================");

  // 1. Verify Pure 24K Quantum Gold Chromatic Architecture
  console.log("\n[1] Verifying Pure 24K Quantum Gold Chromatic Saturation in IDLE...");
  const idlePalette = getSpectralPalette('IDLE');
  console.log(`  • Singularity Core (White):      #${idlePalette.nucleusCore.getHexString()}`);
  console.log(`  • Pure 24K Quantum Gold:         #${idlePalette.nucleusGold.getHexString()}`);
  console.log(`  • Faceted Golden Specularity:    #${idlePalette.nucleusFacet.getHexString()}`);
  console.log(`  • Tensor Lattice (Violet):       #${idlePalette.latticeInner.getHexString()}`);
  console.log(`  • Waveguide Primary (Cyan):      #${idlePalette.waveguidePrimary.getHexString()}`);
  console.log(`  • Origin Light (Warm Gold):      #${idlePalette.lightPrimary.getHexString()}`);

  // Pure Gold should have high red, balanced amber green (linear > 0.40), near-zero blue (< 0.05)
  const isPureGold = idlePalette.nucleusGold.r > 0.95 && idlePalette.nucleusGold.g > 0.40 && idlePalette.nucleusGold.b < 0.05;
  if (!isPureGold) {
    throw new Error(`Pure Gold color check failed for #${idlePalette.nucleusGold.getHexString()}`);
  }
  console.log("  ✓ Pure 24K Quantum Gold verified: rich, luminous, zero-blue desaturation!");

  // 2. Verify Gold Continuity Across All 9 States
  console.log("\n[2] Verifying Gold Continuity Across All Operational States...");
  const states: CoreVisualState[] = [
    'IDLE', 'LISTENING', 'THINKING', 'EXECUTING', 'VERIFYING',
    'ATTENTION', 'RECOVERY', 'SUCCESS', 'ERROR'
  ];

  for (const st of states) {
    const pal = getSpectralPalette(st);
    if (pal.nucleusGold.r < 0.8 || pal.nucleusGold.g < 0.25) {
      throw new Error(`State ${st} failed gold warm chromaticity check!`);
    }
    console.log(`  ✓ State [${st.padEnd(9)}]: Gold = #${pal.nucleusGold.getHexString()}`);
  }

  // 3. Verify Contextual Intent Resolution Engine
  console.log("\n[3] Verifying Contextual Relative & Multimodal Intent Resolution...");

  // Test 3a: Relative Question -> "why did you switch models?"
  const resProvider = await ContextualIntentResolver.resolveIntent("why did you switch models?");
  if (!resProvider.handled || resProvider.targetInspector !== 'providers') {
    throw new Error("Failed to resolve 'why did you switch models?' to Provider Inspector");
  }
  console.log(`  ✓ Contextual Query 'why did you switch models?' -> Inspector [${resProvider.targetInspector}]`);

  // Test 3b: Relative Question -> "why did this workflow fail?"
  const resWorkflow = await ContextualIntentResolver.resolveIntent("why did this workflow fail?");
  if (!resWorkflow.handled || resWorkflow.targetInspector !== 'workflow') {
    throw new Error("Failed to resolve 'why did this workflow fail?' to Workflow Inspector");
  }
  console.log(`  ✓ Contextual Query 'why did this workflow fail?' -> Inspector [${resWorkflow.targetInspector}]`);

  // Test 3c: Relative Question -> "why do you remember that?"
  const resMemory = await ContextualIntentResolver.resolveIntent("why do you remember that?");
  if (!resMemory.handled || resMemory.targetInspector !== 'memory') {
    throw new Error("Failed to resolve 'why do you remember that?' to Memory Inspector");
  }
  console.log(`  ✓ Contextual Query 'why do you remember that?' -> Inspector [${resMemory.targetInspector}]`);

  // Test 3d: Direct Inspector Routing -> "show my models"
  const resModels = await ContextualIntentResolver.resolveIntent("show my models");
  if (!resModels.handled || resModels.targetInspector !== 'models') {
    throw new Error("Failed to resolve 'show my models'");
  }
  console.log(`  ✓ Direct Intent 'show my models' -> Inspector [${resModels.targetInspector}]`);

  // Test 3e: Multi-Context Workspace Query -> "what is running?"
  const resRunning = await ContextualIntentResolver.resolveIntent("what is running?");
  if (!resRunning.handled || !resRunning.responseText) {
    throw new Error("Failed to resolve 'what is running?'");
  }
  console.log(`  ✓ Workspace Query 'what is running?' -> Response: "${resRunning.responseText}"`);

  // Test 3f: Multi-Context Attention Query -> "what needs my attention?"
  const resAttention = await ContextualIntentResolver.resolveIntent("what needs my attention?");
  if (!resAttention.handled || !resAttention.responseText) {
    throw new Error("Failed to resolve 'what needs my attention?'");
  }
  console.log(`  ✓ Attention Query 'what needs my attention?' -> Response: "${resAttention.responseText}"`);

  // Test 3g: Memory Ingestion -> "remember this project uses Vite"
  const resSaveMem = await ContextualIntentResolver.resolveIntent("remember this project uses Vite");
  if (!resSaveMem.handled || resSaveMem.type !== 'MEMORY') {
    throw new Error("Failed to resolve memory ingestion intent");
  }
  console.log(`  ✓ Memory Intent -> Response: "${resSaveMem.responseText}"`);

  // Test 3h: Cancellation Intent -> "cancel that"
  const resCancel = await ContextualIntentResolver.resolveIntent("cancel that");
  if (!resCancel.handled || resCancel.actionSummary !== 'CANCELLED') {
    throw new Error("Failed to resolve cancellation intent");
  }
  console.log(`  ✓ Cancellation Intent -> Action: [${resCancel.actionSummary}]`);

  console.log("\n=================================================================");
  console.log("  REZEL R4 VERIFICATION PASSED: ALL ACCEPTANCE GATES MET");
  console.log("=================================================================");
  process.exit(0);
}

runMultimodalContextualVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
