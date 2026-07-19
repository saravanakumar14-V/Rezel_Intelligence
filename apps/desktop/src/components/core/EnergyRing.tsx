import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

interface EnergyRingProps {
  /** Ring major radius (torus R) */
  radius: number;
  /** Ring tube thickness */
  tube: number;
  /** Rotation speed multiplier — negative value reverses direction */
  speed: number;
  /** Axis of primary rotation: "x" | "y" | "z" */
  axis: "x" | "y" | "z";
  /** Hex colour string */
  color: string;
  /** Static tilt in radians applied at mount */
  tiltX?: number;
  tiltZ?: number;
}

/**
 * EnergyRing
 *
 * A single wireframe torus ring that rotates continuously around one axis.
 * Uses MeshBasicMaterial (no lighting required) with additive blending to
 * stack cleanly over the dark space background without darkening.
 *
 * Performance: geometry is created once and reused — no per-frame allocations.
 */
export default function EnergyRing({
  radius,
  tube,
  speed,
  axis,
  color,
  tiltX = 0,
  tiltZ = 0,
}: EnergyRingProps) {
  const ref = useRef<THREE.Mesh>(null!);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation[axis] += delta * speed;
  });

  return (
    <mesh ref={ref} rotation={[tiltX, 0, tiltZ]}>
      <torusGeometry args={[radius, tube, 6, 80]} />
      <meshBasicMaterial
        color={color}
        wireframe
        transparent
        opacity={0.55}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}
