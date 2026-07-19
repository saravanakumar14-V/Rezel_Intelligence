import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface StarsFieldProps {
  /** Total background star count. Keep ≤ 8000 for mid-range GPUs. */
  starCount?: number;
  /** Dust mote count — smaller, dimmer, closer particles */
  dustCount?: number;
  /** Radius of the star sphere */
  radius?: number;
}

/**
 * StarsField
 *
 * Renders two separate particle systems in a single component:
 *
 *  1. Background stars  — large uniform sphere, static, high opacity
 *  2. Space dust motes  — smaller random scatter, very slow drift
 *
 * Both systems use a single Points draw call each (2 draw calls total).
 * All positions are computed with useMemo — zero runtime allocations.
 * Geometry is automatically disposed by R3F on unmount.
 *
 * Performance budget: ≤ 2 draw calls, ≤ 8 K vertices, ~0.1 ms GPU time.
 */
export default function StarsField({
  starCount = 7000,
  dustCount = 400,
  radius    = 200,
}: StarsFieldProps) {
  const dustRef = useRef<THREE.Points>(null!);

  // --- Background stars (static) ---
  const starPositions = useMemo<Float32Array>(() => {
    const arr = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      // Uniform distribution on a sphere surface
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = radius * (0.8 + Math.random() * 0.2);
      arr[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [starCount, radius]);

  // --- Space dust (very slow drift rotation applied in useFrame) ---
  const dustPositions = useMemo<Float32Array>(() => {
    const arr = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      arr[i * 3 + 0] = (Math.random() - 0.5) * 40;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 40;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    return arr;
  }, [dustCount]);

  // Drift the dust cloud very slowly
  useFrame((_, delta) => {
    if (!dustRef.current) return;
    dustRef.current.rotation.y += delta * 0.008;
    dustRef.current.rotation.x += delta * 0.003;
  });

  return (
    <>
      {/* Static background stars */}
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[starPositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.35}
          color="#CCEEFF"
          transparent
          opacity={0.85}
          sizeAttenuation
          depthWrite={false}
        />
      </points>

      {/* Space dust motes */}
      <points ref={dustRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[dustPositions, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.06}
          color="#7AB8FF"
          transparent
          opacity={0.35}
          sizeAttenuation
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </>
  );
}
