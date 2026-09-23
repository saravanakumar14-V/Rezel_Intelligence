import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SpectralLayerColors } from './coreSpectralTheme';
import { spatialCameraBus } from '../scene/spatialCameraState';

interface QuantumNucleusProps {
  colors: SpectralLayerColors;
}

/**
 * QuantumNucleus
 *
 * The computational singularity and unmistakable center of gravity of the REZEL Core.
 * Hierarchy:
 *  - WHITE = Pure Diamond Singularity Core
 *  - GOLD = Solid 24K Quantum Resonance Jewel Core + Radiant Amber Halo (Persistent Steady-State)
 *  - CRYSTAL = Precision-faceted Stellated Icosahedral Sub-Crystal
 *  - CAGE = Outer Beveled Octahedral Framing Matrix
 */
export default function QuantumNucleus({ colors }: QuantumNucleusProps) {
  const groupRef = useRef<THREE.Group>(null!);
  const diamondCoreRef = useRef<THREE.Mesh>(null!);
  const goldSolidRef = useRef<THREE.Mesh>(null!);
  const goldWireRef = useRef<THREE.Mesh>(null!);
  const goldHaloRef = useRef<THREE.Mesh>(null!);
  const stellatedRef = useRef<THREE.Mesh>(null!);
  const outerCageRef = useRef<THREE.Mesh>(null!);

  const diamondMatRef = useRef<THREE.MeshBasicMaterial>(null!);
  const goldSolidMatRef = useRef<THREE.MeshPhysicalMaterial>(null!);
  const goldWireMatRef = useRef<THREE.MeshBasicMaterial>(null!);
  const goldHaloMatRef = useRef<THREE.MeshBasicMaterial>(null!);
  const stellaMatRef = useRef<THREE.MeshPhysicalMaterial>(null!);
  const cageMatRef = useRef<THREE.MeshBasicMaterial>(null!);

  // Geometries
  const diamondGeo = useMemo(() => new THREE.SphereGeometry(0.10, 24, 24), []);
  const goldGeo = useMemo(() => new THREE.OctahedronGeometry(0.24, 0), []);
  const goldHaloGeo = useMemo(() => new THREE.SphereGeometry(0.30, 24, 24), []);
  const stellaGeo = useMemo(() => new THREE.IcosahedronGeometry(0.38, 0), []);
  const cageGeo = useMemo(() => new THREE.OctahedronGeometry(0.48, 0), []);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const speed = colors.speedMultiplier;
    const freq = colors.pulseFrequency;
    const energy = colors.energyScale;

    // Check if this layer is currently inspected
    const isInspected = spatialCameraBus.getHoveredLayer() === 'QUANTUM NUCLEUS';
    const inspectBoost = isInspected ? 1.25 : 1.0;

    // Slow, stately crystalline counter-rotations
    if (goldSolidRef.current) {
      goldSolidRef.current.rotation.x += delta * 0.55 * speed;
      goldSolidRef.current.rotation.y += delta * 0.85 * speed;
      if (goldWireRef.current) {
        goldWireRef.current.rotation.copy(goldSolidRef.current.rotation);
      }
    }

    if (stellatedRef.current) {
      stellatedRef.current.rotation.x -= delta * 0.38 * speed;
      stellatedRef.current.rotation.y -= delta * 0.58 * speed;
      stellatedRef.current.rotation.z += delta * 0.22 * speed;
    }

    if (outerCageRef.current) {
      outerCageRef.current.rotation.y += delta * 0.25 * speed;
      outerCageRef.current.rotation.z -= delta * 0.15 * speed;
    }

    // Controlled mathematical breathing pulse (subtle, never wild)
    const breath = 1.0 + Math.sin(t * freq) * (0.04 * energy);
    if (groupRef.current) {
      groupRef.current.scale.set(breath, breath, breath);
    }

    // 1. Diamond White Core (Singularity point)
    if (diamondMatRef.current) {
      diamondMatRef.current.color.copy(colors.nucleusCore);
      diamondMatRef.current.opacity = 0.98;
    }

    // 2. Solid 24K Quantum Gold Resonance Jewel (Permanent saturated gold)
    if (goldSolidMatRef.current) {
      goldSolidMatRef.current.color.copy(colors.nucleusGold);
      goldSolidMatRef.current.emissive.copy(colors.nucleusGold);
      goldSolidMatRef.current.emissiveIntensity = (2.2 + 0.4 * Math.sin(t * (freq * 0.9))) * inspectBoost;
      goldSolidMatRef.current.opacity = Math.min(0.96, 0.92 * inspectBoost);
    }

    if (goldWireMatRef.current) {
      goldWireMatRef.current.color.copy(colors.nucleusGold);
      goldWireMatRef.current.opacity = 0.6 * inspectBoost;
    }

    // 3. Golden Energy Halo (Luminous Amber-Gold Additive Corona)
    if (goldHaloMatRef.current) {
      goldHaloMatRef.current.color.copy(colors.nucleusGold);
      goldHaloMatRef.current.opacity = (0.45 + 0.12 * Math.sin(t * freq + 0.5)) * inspectBoost;
    }

    // 4. Crystalline Facets with warm golden transmission & clearcoat specularity
    if (stellaMatRef.current) {
      stellaMatRef.current.color.copy(colors.nucleusFacet);
      stellaMatRef.current.emissive.copy(colors.nucleusFacet);
      stellaMatRef.current.emissiveIntensity = (2.4 + 0.5 * Math.sin(t * (freq * 1.2))) * energy * inspectBoost;
    }

    // 5. Outer Beveled Framing Cage
    if (cageMatRef.current) {
      cageMatRef.current.color.copy(colors.nucleusFacet);
      cageMatRef.current.opacity = (0.42 + 0.12 * Math.cos(t * freq)) * inspectBoost;
    }
  });

  return (
    <group
      ref={groupRef}
      onPointerOver={(e) => {
        e.stopPropagation();
        spatialCameraBus.setHoveredLayer('QUANTUM NUCLEUS');
      }}
      onPointerOut={() => spatialCameraBus.setHoveredLayer(null)}
      onClick={(e) => {
        e.stopPropagation();
        spatialCameraBus.setHoveredLayer('QUANTUM NUCLEUS');
      }}
    >
      {/* 1. Innermost Diamond White Singularity */}
      <mesh ref={diamondCoreRef} geometry={diamondGeo}>
        <meshBasicMaterial
          ref={diamondMatRef}
          color="#FFFFFF"
          transparent
          opacity={0.98}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 2a. Solid 24K Quantum Gold Resonance Jewel Core (Physical PBR Shading) */}
      <mesh ref={goldSolidRef} geometry={goldGeo}>
        <meshPhysicalMaterial
          ref={goldSolidMatRef}
          color="#FFB300"
          emissive="#FF8F00"
          emissiveIntensity={2.2}
          metalness={0.96}
          roughness={0.06}
          transmission={0.2}
          ior={1.7}
          transparent
          opacity={0.94}
          depthWrite={false}
        />
      </mesh>

      {/* 2b. 24K Gold Crystal Edge Bevel Ribs */}
      <mesh ref={goldWireRef} geometry={goldGeo}>
        <meshBasicMaterial
          ref={goldWireMatRef}
          color="#FFB300"
          wireframe
          transparent
          opacity={0.6}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 3. Golden Quantum Energy Corona Halo */}
      <mesh ref={goldHaloRef} geometry={goldHaloGeo}>
        <meshBasicMaterial
          ref={goldHaloMatRef}
          color="#FF9E00"
          transparent
          opacity={0.45}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 4. Nested Stellated Crystalline Sub-Jewel */}
      <mesh ref={stellatedRef} geometry={stellaGeo}>
        <meshPhysicalMaterial
          ref={stellaMatRef}
          color="#FFD54F"
          emissive="#FFB300"
          emissiveIntensity={2.4}
          metalness={0.95}
          roughness={0.04}
          transmission={0.35}
          ior={1.6}
          transparent
          opacity={0.88}
          depthWrite={false}
        />
      </mesh>

      {/* 5. Outer Beveled Crystalline Octahedron Cage */}
      <mesh ref={outerCageRef} geometry={cageGeo}>
        <meshBasicMaterial
          ref={cageMatRef}
          color="#FFC107"
          wireframe
          transparent
          opacity={0.45}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
