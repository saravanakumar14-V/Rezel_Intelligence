import { Suspense, memo } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import CoreLight from "../core/CoreLight";
import QuantumCore from "../core/QuantumCore";
import StarsField from "./StarsField";
import CameraController from "./CameraController";

/**
 * SpaceScene
 *
 * Root React Three Fiber canvas for the Rezel home screen.
 *
 * Composition order (back → front):
 *  1. StarsField     — background star sphere + space dust
 *  2. CoreLight      — scene lighting configuration
 *  3. QuantumCore    — central animated energy core
 *  4. CameraController — mouse-reactive parallax (renders nothing)
 *  5. EffectComposer — post-processing: bloom + vignette
 *
 * Canvas settings:
 *  - gl.antialias: true for clean geometry edges
 *  - gl.powerPreference: "high-performance" — request discrete GPU
 *  - dpr clamped to [1, 2] to avoid excessive pixel ratio on HiDPI
 *  - frameloop: "always" — continuous for smooth animation
 *
 * Performance requirements (per spec):
 *  - Target 60 FPS on mid-range hardware
 *  - No per-frame object allocations in sub-components
 *  - Geometry instancing used where particle count > 1
 *
 * Wrapped in React.memo() — this component receives no props and should
 * never re-render due to parent state changes (orbState, chat streaming, etc.).
 */
const SpaceScene = memo(function SpaceScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 50, near: 0.1, far: 1000 }}
      gl={{
        antialias: true,
        powerPreference: "high-performance",
        alpha: false,
      }}
      dpr={[1, 2]}
      frameloop="always"
      style={{ position: "absolute", inset: 0 }}
    >
      {/* Deep space background colour */}
      <color attach="background" args={["#02030A"]} />

      <Suspense fallback={null}>
        {/* Background star field + space dust */}
        <StarsField starCount={7000} dustCount={400} radius={200} />

        {/* Scene lighting */}
        <CoreLight />

        {/* Central Quantum Core */}
        <QuantumCore />

        {/* Mouse-reactive parallax camera */}
        <CameraController />
      </Suspense>

      {/* Post-processing effects */}
      <EffectComposer>
        {/* Bloom — Cyan core glow halos */}
        <Bloom
          intensity={1.6}
          luminanceThreshold={0.15}
          luminanceSmoothing={0.85}
          mipmapBlur
        />
        <Vignette offset={0.35} darkness={0.75} />
      </EffectComposer>
    </Canvas>
  );
});

export default SpaceScene;