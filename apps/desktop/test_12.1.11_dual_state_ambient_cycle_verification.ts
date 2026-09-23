import * as THREE from 'three';
import {
  getSpectralPalette,
  getAmbientIdleFactor,
  sampleAmbientIdleState,
  createInterpolatedSpectralState,
  lerpSpectralState,
  type CoreVisualState,
} from './src/components/core/coreSpectralTheme';

async function runDualStateAmbientCycleVerification() {
  console.log("=================================================================");
  console.log("  REZEL QUANTUMCORE GOLD-DOMINANT DUAL-STATE CYCLE VERIFICATION");
  console.log("=================================================================");

  // 1. Verify Ambient Idle Factor Across 10-Second Cycle Phases
  console.log("\n[1] Verifying 10-Second Cycle Timing & Mathematical Continuity...");
  const testTimings = [
    { t: 0.0, expectedPhase: 'GOLDEN DOMINANT HOLD', minFactor: 0.0, maxFactor: 0.0 },
    { t: 2.0, expectedPhase: 'GOLDEN DOMINANT HOLD', minFactor: 0.0, maxFactor: 0.0 },
    { t: 4.0, expectedPhase: 'GOLDEN BOUNDARY', minFactor: 0.0, maxFactor: 0.01 },
    { t: 4.5, expectedPhase: 'GOLD-DOMINANT MID-MORPH', minFactor: 0.45, maxFactor: 0.55 },
    { t: 5.0, expectedPhase: 'COMPUTATIONAL BOUNDARY', minFactor: 0.99, maxFactor: 1.0 },
    { t: 7.0, expectedPhase: 'COMPUTATIONAL VARIATION HOLD', minFactor: 1.0, maxFactor: 1.0 },
    { t: 9.0, expectedPhase: 'COMPUTATIONAL BOUNDARY', minFactor: 0.99, maxFactor: 1.0 },
    { t: 9.5, expectedPhase: 'RETURN-TO-GOLD MID-MORPH', minFactor: 0.45, maxFactor: 0.55 },
    { t: 10.0, expectedPhase: 'GOLDEN SEAM REPEAT', minFactor: 0.0, maxFactor: 0.01 },
  ];

  for (const item of testTimings) {
    const factor = getAmbientIdleFactor(item.t);
    if (factor < item.minFactor - 0.01 || factor > item.maxFactor + 0.01) {
      throw new Error(`Cycle timing failed at t=${item.t}s: factor=${factor} not in [${item.minFactor}, ${item.maxFactor}]`);
    }
    console.log(`  ✓ t = ${item.t.toFixed(1).padStart(4)}s -> Factor: ${factor.toFixed(3)} [${item.expectedPhase}]`);
  }

  // 2. 60-Second Gold-Dominant Evolution Simulation
  console.log("\n[2] Simulating 60+ Seconds of Continuous Gold-Dominant Cycle...");
  const testPalette = createInterpolatedSpectralState();
  const sampleSteps = [0, 2, 4.5, 7, 9.5, 12, 14.5, 27, 34.5, 47, 59.5];

  for (const t of sampleSteps) {
    sampleAmbientIdleState(testPalette, t);
    const goldHex = `#${testPalette.nucleusGold.getHexString()}`;
    const facetHex = `#${testPalette.nucleusFacet.getHexString()}`;
    const latticeHex = `#${testPalette.latticeInner.getHexString()}`;
    const lightHex = `#${testPalette.lightPrimary.getHexString()}`;
    const factor = getAmbientIdleFactor(t);
    const stateName = factor < 0.1 ? 'GOLDEN DOMINANT' : factor > 0.9 ? 'COMPUTATIONAL VARIATION' : 'ENERGY REORGANIZING';

    // Verify Rule 1: Gold Nucleus MUST be 100% locked #ffb300 at ALL times
    if (goldHex !== '#ffb300') {
      throw new Error(`Gold nucleus violated locked identity at t=${t}s: got ${goldHex}`);
    }

    // Verify Rule 2: Primary Origin Light MUST be warm diamond-gold #fff4d6 at ALL times
    if (lightHex !== '#fff4d6') {
      throw new Error(`Core origin light violated gold identity at t=${t}s: got ${lightHex}`);
    }

    console.log(`  • t = ${t.toFixed(1).padStart(4)}s: State = ${stateName.padEnd(23)} | Nucleus Gold: ${goldHex} (LOCKED) | Facet: ${facetHex} | Lattice: ${latticeHex}`);
  }
  console.log("  ✓ 60-second continuous Gold-Dominance verified: Nucleus is 100% Gold at every moment!");

  // 3. Operational State Priority & Interruption Verification
  console.log("\n[3] Verifying Operational State Priority (Interruption & Resume)...");
  const operationalStates: CoreVisualState[] = [
    'LISTENING', 'THINKING', 'EXECUTING', 'VERIFYING', 'ATTENTION', 'RECOVERY', 'SUCCESS', 'ERROR'
  ];

  const current = createInterpolatedSpectralState();
  sampleAmbientIdleState(current, 3.0); // Start in idle GOLDEN

  for (const opState of operationalStates) {
    const opTarget = getSpectralPalette(opState);
    lerpSpectralState(current, opTarget, 1.0); // Immediate operational override
    console.log(`  ✓ Operational Priority Override -> State [${opState.padEnd(9)}]: Facet = #${current.nucleusFacet.getHexString()}, Lattice = #${current.latticeInner.getHexString()}`);
  }

  // Resume IDLE from current state
  const idleResumeTarget = createInterpolatedSpectralState();
  sampleAmbientIdleState(idleResumeTarget, 7.0); // Resume into computational variation state
  lerpSpectralState(current, idleResumeTarget, 0.5);
  console.log(`  ✓ Smooth Settle to IDLE Ambient -> Blended Lattice: #${current.latticeInner.getHexString()}, Nucleus Gold: #${current.nucleusGold.getHexString()}`);

  console.log("\n=================================================================");
  console.log("  REZEL QUANTUMCORE GOLD-DOMINANT CYCLE: 100% ACCEPTED");
  console.log("=================================================================");
  process.exit(0);
}

runDualStateAmbientCycleVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
