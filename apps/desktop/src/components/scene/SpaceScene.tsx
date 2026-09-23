import { Suspense, memo } from "react";
import { Canvas } from "@react-three/fiber";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import QuantumCore from "../core/QuantumCore";
import StarsField from "./StarsField";
import CameraController from "./CameraController";
import SpatialNavigationOverlay from "./SpatialNavigationOverlay";
import { useHardware } from "../../providers/HardwareProvider";

function SceneEffects() {
  const { quality } = useHardware();

  // On low quality, we skip expensive post-processing bloom
  if (quality === 'LOW') {
    return null;
  }

  return (
    <EffectComposer>
      <Bloom
        intensity={quality === 'MED' ? 1.05 : 1.35}
        luminanceThreshold={0.25}
        luminanceSmoothing={0.80}
        mipmapBlur={quality === 'HIGH' || quality === 'ULTRA'}
      />
      <Vignette offset={0.35} darkness={0.75} />
    </EffectComposer>
  );
}

function SceneContents() {
  const { quality } = useHardware();
  const starCount = quality === 'LOW' ? 2000 : quality === 'MED' ? 4000 : 7000;
  const dustCount = quality === 'LOW' ? 100 : quality === 'MED' ? 200 : 400;

  return (
    <>
      <color attach="background" args={["#02030A"]} />
      <Suspense fallback={null}>
        <StarsField starCount={starCount} dustCount={dustCount} radius={200} />
        <QuantumCore />
        <CameraController />
      </Suspense>
      <SceneEffects />
    </>
  );
}

const SpaceScene = memo(function SpaceScene() {
  return (
    <div className="absolute inset-0 overflow-hidden select-none">
      <Canvas
        camera={{ position: [0, 0, 8], fov: 50, near: 0.1, far: 1000 }}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          alpha: false,
        }}
        frameloop="always"
        style={{ position: "absolute", inset: 0 }}
      >
        <SceneContents />
      </Canvas>
      <SpatialNavigationOverlay />
    </div>
  );
});

export default SpaceScene;
