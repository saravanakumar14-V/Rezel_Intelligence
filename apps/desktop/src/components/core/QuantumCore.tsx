import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

export default function QuantumCore() {
  const mesh = useRef<THREE.Mesh>(null!);

  useFrame((_, delta) => {
    mesh.current.rotation.y += delta * 0.4;
    mesh.current.rotation.x += delta * 0.15;
  });

  return (
    <mesh ref={mesh}>
      <icosahedronGeometry args={[1.1, 4]} />

      <meshStandardMaterial
        color="#00E5FF"
        emissive="#00E5FF"
        emissiveIntensity={4}
        metalness={1}
        roughness={0}
      />
    </mesh>
  );
}