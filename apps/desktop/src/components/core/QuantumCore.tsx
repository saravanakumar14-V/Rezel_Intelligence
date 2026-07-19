import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import EnergyRing from "./EnergyRing";
import OrbitParticles from "./OrbitParticles";

/**
 * QuantumCore
 *
 * The central visual identity of Rezel — a multi-layered animated energy core.
 *
 * Layers (outer → inner):
 *  1. OrbitParticles  — swirling energy cloud
 *  2. Three EnergyRings — concentric tori on different axes
 *  3. Outer shell     — large low-poly icosahedron (wireframe, slow spin)
 *  4. Mid shell       — medium icosahedron (solid emissive, faster spin)
 *  5. Inner nucleus   — small sphere (peak emissive intensity, pulse)
 *
 * Performance:
 *  - All geometry uses standard BufferGeometry (no dynamic updates)
 *  - Pulse driven by Math.sin — no extra allocations per frame
 *  - Additive blending on shell materials avoids depth-write overhead
 */
export default function QuantumCore() {
  const outerRef = useRef<THREE.Mesh>(null!);
  const midRef   = useRef<THREE.Mesh>(null!);
  const innerRef = useRef<THREE.Mesh>(null!);
  const midMatRef = useRef<THREE.MeshStandardMaterial>(null!);
  const innerMatRef = useRef<THREE.MeshStandardMaterial>(null!);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;

    // Outer shell — slow, stately rotation
    outerRef.current.rotation.y += delta * 0.18;
    outerRef.current.rotation.x += delta * 0.06;

    // Mid shell — faster counter-rotation
    midRef.current.rotation.y -= delta * 0.45;
    midRef.current.rotation.z += delta * 0.22;

    // Inner nucleus — fastest spin
    innerRef.current.rotation.x += delta * 0.9;
    innerRef.current.rotation.y += delta * 0.6;

    // Emissive pulse — smooth sinusoidal breathing
    const pulse = 2.5 + Math.sin(t * 1.8) * 1.2;
    midMatRef.current.emissiveIntensity   = pulse * 0.6;
    innerMatRef.current.emissiveIntensity = pulse * 1.5;
  });

  return (
    <group>
      {/* Orbit particle cloud */}
      <OrbitParticles count={600} radius={2.8} speed={0.1} />

      {/* Energy rings on three axes */}
      <EnergyRing radius={1.9} tube={0.006} speed={0.7}  axis="y" color="#00E5FF" tiltX={Math.PI / 6} />
      <EnergyRing radius={2.1} tube={0.005} speed={-0.5} axis="x" color="#7A5CFF" tiltZ={Math.PI / 5} />
      <EnergyRing radius={2.4} tube={0.004} speed={0.35} axis="z" color="#00BFFF" tiltX={Math.PI / 3} />

      {/* Outer wireframe shell */}
      <mesh ref={outerRef}>
        <icosahedronGeometry args={[1.45, 1]} />
        <meshBasicMaterial
          color="#00E5FF"
          wireframe
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Mid emissive shell */}
      <mesh ref={midRef}>
        <icosahedronGeometry args={[1.05, 4]} />
        <meshStandardMaterial
          ref={midMatRef}
          color="#00C8F0"
          emissive="#00E5FF"
          emissiveIntensity={1.5}
          metalness={0.9}
          roughness={0.05}
          transparent
          opacity={0.55}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Inner nucleus */}
      <mesh ref={innerRef}>
        <sphereGeometry args={[0.52, 32, 32]} />
        <meshStandardMaterial
          ref={innerMatRef}
          color="#FFFFFF"
          emissive="#00E5FF"
          emissiveIntensity={4}
          metalness={1}
          roughness={0}
        />
      </mesh>
    </group>
  );
}