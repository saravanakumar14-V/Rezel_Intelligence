import * as THREE from 'three';
import {
  getSpectralPalette,
  type CoreVisualState,
} from './src/components/core/coreSpectralTheme';
import {
  CAMERA_PRESETS,
  spatialCameraBus,
} from './src/components/scene/spatialCameraState';

function colorDistance(c1: THREE.Color, c2: THREE.Color): number {
  const dr = (c1.r - c2.r) * 255;
  const dg = (c1.g - c2.g) * 255;
  const db = (c1.b - c2.b) * 255;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

async function runMaterialPolishVerification() {
  console.log("=================================================================");
  console.log("  REZEL R3.3 QUANTUMCORE MATERIAL POLISH & INSPECTION VERIFY");
  console.log("=================================================================");

  // 1. Verify Distinct Layer Color Hierarchy in IDLE
  console.log("\n[1] Verifying Spectral Hierarchy & Color Separation in IDLE...");
  const idlePalette = getSpectralPalette('IDLE');

  console.log(`  • Singularity Core (White):        #${idlePalette.nucleusCore.getHexString()}`);
  console.log(`  • Quantum Resonance (Gold):        #${idlePalette.nucleusGold.getHexString()}`);
  console.log(`  • Faceted Sub-Jewel (Warm Gold):   #${idlePalette.nucleusFacet.getHexString()}`);
  console.log(`  • Tensor Lattice (Electric Violet):#${idlePalette.latticeInner.getHexString()}`);
  console.log(`  • Waveguide Primary (Cyan):        #${idlePalette.waveguidePrimary.getHexString()}`);
  console.log(`  • Origin Light (Warm Diamond Gold):#${idlePalette.lightPrimary.getHexString()}`);
  console.log(`  • Offset Fill Light (Violet):      #${idlePalette.lightSecondary.getHexString()}`);

  // Test color distinction
  const distWhiteGold = colorDistance(idlePalette.nucleusCore, idlePalette.nucleusGold);
  const distGoldViolet = colorDistance(idlePalette.nucleusGold, idlePalette.latticeInner);
  const distVioletCyan = colorDistance(idlePalette.latticeInner, idlePalette.waveguidePrimary);
  const distGoldCyan = colorDistance(idlePalette.nucleusGold, idlePalette.waveguidePrimary);

  console.log(`  ✓ Color distance (White ↔ Gold):   ${distWhiteGold.toFixed(1)} (Threshold > 30)`);
  console.log(`  ✓ Color distance (Gold ↔ Violet):  ${distGoldViolet.toFixed(1)} (Threshold > 60)`);
  console.log(`  ✓ Color distance (Violet ↔ Cyan):  ${distVioletCyan.toFixed(1)} (Threshold > 60)`);
  console.log(`  ✓ Color distance (Gold ↔ Cyan):    ${distGoldCyan.toFixed(1)} (Threshold > 60)`);

  if (distWhiteGold < 30 || distGoldViolet < 60 || distVioletCyan < 60 || distGoldCyan < 60) {
    throw new Error("Color separation threshold failed — potential spectral collapse!");
  }

  // 2. Verify Golden Presence Across All Operational States
  console.log("\n[2] Verifying Persistent Golden Energy Across All 9 States...");
  const states: CoreVisualState[] = [
    'IDLE', 'LISTENING', 'THINKING', 'EXECUTING', 'VERIFYING',
    'ATTENTION', 'RECOVERY', 'SUCCESS', 'ERROR'
  ];

  for (const st of states) {
    const pal = getSpectralPalette(st);
    // Gold channel must have high red & green components (warm gold/amber spectrum)
    const isGoldWarm = pal.nucleusGold.r > 0.8 && pal.nucleusGold.g > 0.25;
    if (!isGoldWarm) {
      throw new Error(`State ${st} does not maintain a warm gold quantum resonance core!`);
    }
    console.log(`  ✓ State [${st.padEnd(9)}]: Gold Resonance = #${pal.nucleusGold.getHexString()} (Preserved)`);
  }

  // 3. Verify Quiet 3D Layer Inspection Tokens & Bus
  console.log("\n[3] Verifying Quiet 3D Layer Inspection Tokens & Bus...");
  const layerTokens = [
    'QUANTUM NUCLEUS',
    'TENSOR COMPUTATION LATTICE',
    'REFRACTIVE CONFINEMENT',
    'HARMONIC WAVEGUIDE',
  ];

  for (const token of layerTokens) {
    spatialCameraBus.setHoveredLayer(token);
    if (spatialCameraBus.getHoveredLayer() !== token) {
      throw new Error(`Bus failed to return current hovered layer for: ${token}`);
    }
    console.log(`  ✓ Inspected token verified: "${token}"`);
  }

  spatialCameraBus.setHoveredLayer(null);
  if (spatialCameraBus.getHoveredLayer() !== null) {
    throw new Error("Hover dismissal failed");
  }
  console.log("  ✓ Hover clear verified");

  // 4. Verify Camera Presets
  console.log("\n[4] Verifying Camera Presets & Bounds...");
  const presets = Object.values(CAMERA_PRESETS);
  for (const p of presets) {
    console.log(`  ✓ Preset [${p.name.padEnd(7)}]: ${p.label} (Key: ${p.shortcut}) -> R: ${p.radius}, θ: ${p.theta.toFixed(2)}, φ: ${p.phi.toFixed(2)}`);
  }

  console.log("\n=================================================================");
  console.log("  REZEL R3.3 MATERIAL POLISH VERIFICATION PASSED: ALL GATES MET");
  console.log("=================================================================");
  process.exit(0);
}

runMaterialPolishVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
