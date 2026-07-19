import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import QuantumCore from "../core/QuantumCore";

export default function SpaceScene() {
  return (
    <Canvas
      camera={{
        position: [0, 0, 8],
        fov: 50,
      }}
    >
      {/* Background */}
      <color attach="background" args={["#02030A"]} />

      {/* Ambient Light */}
      <ambientLight intensity={0.4} />

      {/* Main Glow */}
      <pointLight
        position={[0, 0, 0]}
        intensity={60}
        color="#00E5FF"
      />

      {/* Stars */}
      <Stars
        radius={250}
        depth={60}
        count={7000}
        factor={6}
        saturation={0}
        fade
        speed={0.4}
      />

      {/* Core */}
      <QuantumCore />

      {/* Camera */}
      <OrbitControls
        enableZoom={false}
        autoRotate
        autoRotateSpeed={0.35}
      />

      {/* Effects */}
      <EffectComposer>
        <Bloom
          intensity={1.4}
          luminanceThreshold={0.1}
          luminanceSmoothing={0.9}
        />
      </EffectComposer>
    </Canvas>
  );
}