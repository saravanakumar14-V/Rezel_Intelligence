import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface OrbitParticlesProps {
  /** Number of particles — keep ≤ 800 for performance budget */
  count?: number;
  /** Sphere radius within which particles are scattered */
  radius?: number;
  /** Overall rotation speed */
  speed?: number;
}

/**
 * OrbitParticles
 *
 * Renders a swirling cloud of point particles surrounding the Quantum Core.
 * Uses a single BufferGeometry with a Float32Array of positions computed once
 * at mount (useMemo). The entire cloud is rotated each frame — no per-particle
 * updates, keeping the render cost O(1) relative to count.
 *
 * Performance notes:
 *  - Single draw call via Points primitive
 *  - Geometry disposed on unmount via useEffect cleanup (handled by R3F)
 *  - Additive blending for the neon-glow layering effect
 *  - depthWrite: false avoids z-fighting artefacts
 */
export default function OrbitParticles({
  count = 600,
  radius = 2.8,
  speed = 0.12,
}: OrbitParticlesProps) {
  const ref = useRef<THREE.Points>(null!);

  /** Build particle positions once — Fibonacci sphere distribution */
  const positions = useMemo<Float32Array>(() => {
    const arr = new Float32Array(count * 3);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2; // -1 to +1
      const r = Math.sqrt(1 - y * y);
      const theta = goldenAngle * i;

      const scatter = radius * (0.7 + Math.random() * 0.6);
      arr[i * 3 + 0] = Math.cos(theta) * r * scatter;
      arr[i * 3 + 1] = y * scatter;
      arr[i * 3 + 2] = Math.sin(theta) * r * scatter;
    }
    return arr;
  }, [count, radius]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.y += delta * speed;
    ref.current.rotation.x += delta * speed * 0.3;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.022}
        color="#00E5FF"
        transparent
        opacity={0.7}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
