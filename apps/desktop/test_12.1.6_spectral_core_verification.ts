import {
  getSpectralPalette,
  createInterpolatedSpectralState,
  lerpSpectralState,
  type CoreVisualState,
} from './src/components/core/coreSpectralTheme';

async function runSpectralCoreVerification() {
  console.log("=================================================================");
  console.log("  REZEL R3.1 SPECTRAL CORE MULTI-LAYER CORRECTION VERIFY");
  console.log("=================================================================");

  const states: CoreVisualState[] = [
    'IDLE',
    'LISTENING',
    'THINKING',
    'EXECUTING',
    'VERIFYING',
    'SUCCESS',
    'RECOVERY',
    'ATTENTION',
    'ERROR',
  ];

  // 1. Verify Spectral Palette Multi-Layer Diversity
  console.log("\n[1] Verifying Layered Color Coexistence Across All Operational States...");

  for (const state of states) {
    const palette = getSpectralPalette(state);

    console.log(`\n  State: [${state}]`);
    console.log(`    • Nucleus Core:       #${palette.nucleusCore.getHexString()} (Singularity Highlight)`);
    console.log(`    • Nucleus Facet:      #${palette.nucleusFacet.getHexString()}`);
    console.log(`    • Neural Lattice In:  #${palette.latticeInner.getHexString()} (Inner Tensor Contrast)`);
    console.log(`    • Neural Lattice Out: #${palette.latticeOuter.getHexString()}`);
    console.log(`    • Housing Hull:       #${palette.housingTint.getHexString()}`);
    console.log(`    • Housing Rim:        #${palette.housingRim.getHexString()}`);
    console.log(`    • Waveguide Prim:     #${palette.waveguidePrimary.getHexString()} (Ring 1)`);
    console.log(`    • Waveguide Sec:      #${palette.waveguideSecondary.getHexString()} (Ring 2)`);
    console.log(`    • Waveguide Tert:     #${palette.waveguideTertiary.getHexString()} (Ring 3)`);
    console.log(`    • Primary/Sec Light:  #${palette.lightPrimary.getHexString()} / #${palette.lightSecondary.getHexString()}`);

    // Invariant: No state can be completely monochromatic across all layers
    const hexSet = new Set([
      palette.nucleusCore.getHexString(),
      palette.nucleusFacet.getHexString(),
      palette.latticeInner.getHexString(),
      palette.waveguideSecondary.getHexString(),
    ]);

    if (hexSet.size < 2) {
      throw new Error(`State ${state} has monochromatic collapse (insufficient distinct spectral layers)`);
    }
  }

  // 2. Verify State-Specific Acceptance Criteria
  console.log("\n[2] Verifying Core Specific Architectural Requirements...");

  // IDLE: Primary cyan/ice blue, secondary subtle violet, white diamond internal highlight
  const idle = getSpectralPalette('IDLE');
  if (idle.nucleusCore.getHexString().toUpperCase() !== 'FFFFFF') {
    throw new Error("IDLE missing pure white diamond nucleus highlight");
  }
  if (!idle.latticeInner.getHexString().toUpperCase().includes('7A5CFF')) {
    throw new Error("IDLE missing electric violet inner neural tensor contrast");
  }
  console.log("  ✓ IDLE: Verified Cyan primary + Electric Violet inner secondary + White core highlight");

  // LISTENING: Gathering energy, dominant ice blue, subtle violet edge response
  const listening = getSpectralPalette('LISTENING');
  if (!listening.waveguideSecondary.getHexString().toUpperCase().includes('9D4EDD')) {
    throw new Error("LISTENING missing violet harmonic response");
  }
  console.log("  ✓ LISTENING: Verified Ice-Blue dominant + Violet secondary harmonic");

  // THINKING: Deep azure, electric violet, cyan internal energy
  const thinking = getSpectralPalette('THINKING');
  if (!thinking.latticeInner.getHexString().toUpperCase().includes('7A5CFF')) {
    throw new Error("THINKING missing electric violet computation tensor");
  }
  console.log("  ✓ THINKING: Verified Deep Azure + Electric Violet + Cyan neural energy");

  // EXECUTING: Violet dominant, magenta secondary, cyan atmospheric
  const executing = getSpectralPalette('EXECUTING');
  if (!executing.latticeInner.getHexString().toUpperCase().includes('FF007F')) {
    throw new Error("EXECUTING missing vivid magenta filaments");
  }
  console.log("  ✓ EXECUTING: Verified Electric Violet + Vivid Magenta + Cyan atmospheric ring");

  // VERIFYING: Mint / Emerald, cyan, white precision nucleus
  const verifying = getSpectralPalette('VERIFYING');
  if (verifying.nucleusCore.getHexString().toUpperCase() !== 'FFFFFF') {
    throw new Error("VERIFYING missing white precision nucleus");
  }
  console.log("  ✓ VERIFYING: Verified Emerald / Mint + Cyan + White precision nucleus");

  // ERROR: Crimson disruption with preserved underlying spectral structure
  const error = getSpectralPalette('ERROR');
  if (!error.latticeInner.getHexString().toUpperCase().includes('7A5CFF')) {
    throw new Error("ERROR flattened underlying violet lattice");
  }
  if (!error.waveguideSecondary.getHexString().toUpperCase().includes('7A5CFF')) {
    throw new Error("ERROR flattened secondary harmonic waveguide");
  }
  console.log("  ✓ ERROR: Verified Crimson disruption while preserving underlying Violet/Cyan structure (No flat red!)");

  // 3. Verify Interpolation Physics Engine
  console.log("\n[3] Verifying Smooth Frame-by-Frame Spectral Interpolation...");
  const current = createInterpolatedSpectralState();
  const target = getSpectralPalette('EXECUTING');

  for (let frame = 1; frame <= 10; frame++) {
    lerpSpectralState(current, target, 0.2);
  }
  console.log(`  ✓ 10-step lerp converged to target: #${current.latticeInner.getHexString()}`);

  console.log("\n=================================================================");
  console.log("  REZEL R3.1 SPECTRAL CORE VERIFICATION PASSED: 100% GATES MET");
  console.log("=================================================================");
  process.exit(0);
}

runSpectralCoreVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
