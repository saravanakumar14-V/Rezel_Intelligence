import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SpectralLayerColors } from './coreSpectralTheme';
import { spatialCameraBus } from '../scene/spatialCameraState';

interface QuantumWaveguidesProps {
  colors: SpectralLayerColors;
}

/**
 * QuantumWaveguides
 *
 * Coordinated quantum guidance and orbital field apparatus.
 * Built as an integrated 3-tier orbital mechanism:
 *  1. Equatorial Tensor Guidance Arm (Cyan) with Vernier golden sub-ring & phase ticks.
 *  2. Polar Resonant Precession Arm (Electric Violet inclined at 54.7° magic angle).
 *  3. Quantum Transfer Ellipse Arc (Ice-Blue / White atmospheric flux ring).
 *
 * Motion is mathematically coupled in harmonic ratios (3:2:1) for unified physical coherence.
 */
export default function QuantumWaveguides({ colors }: QuantumWaveguidesProps) {
  const equatorialGroupRef = useRef<THREE.Group>(null!);
  const polarArmRef = useRef<THREE.Mesh>(null!);
  const transferArcRef = useRef<THREE.Mesh>(null!);
  const phaseTicksRef = useRef<THREE.Points>(null!);

  const matEquatorialRef = useRef<THREE.MeshBasicMaterial>(null!);
  const matVernierRef = useRef<THREE.MeshBasicMaterial>(null!);
  const matPolarRef = useRef<THREE.MeshBasicMaterial>(null!);
  const matTransferRef = useRef<THREE.MeshBasicMaterial>(null!);
  const matTicksRef = useRef<THREE.PointsMaterial>(null!);

  // Geometries
  const geoEquatorial = useMemo(() => new THREE.TorusGeometry(1.88, 0.0065, 8, 96), []);
  const geoVernier = useMemo(() => new THREE.TorusGeometry(1.82, 0.0035, 6, 80), []);
  const geoPolar = useMemo(() => new THREE.TorusGeometry(2.18, 0.005, 8, 96), []);
  const geoTransfer = useMemo(() => new THREE.TorusGeometry(2.48, 0.0035, 6, 96), []);

  // 8 Phase tick markers around equatorial ring
  const ticksGeo = useMemo(() => {
    const pts: number[] = [];
    const numTicks = 8;
    const r = 1.88;
    for (let i = 0; i < numTicks; i++) {
      const angle = (i * Math.PI * 2) / numTicks;
      pts.push(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return geom;
  }, []);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const speed = colors.speedMultiplier;
    const freq = colors.pulseFrequency;
    const energy = colors.energyScale;

    // Check if inspected
    const isInspected = spatialCameraBus.getHoveredLayer() === 'HARMONIC WAVEGUIDE';
    const inspectBoost = isInspected ? 1.25 : 1.0;

    // Harmonic coupled motion (Equatorial 1.0x, Polar 0.67x, Transfer 0.33x)
    if (equatorialGroupRef.current) {
      equatorialGroupRef.current.rotation.y += delta * 0.35 * speed;
      equatorialGroupRef.current.rotation.z = Math.sin(t * 0.4) * 0.06;
    }

    if (polarArmRef.current) {
      polarArmRef.current.rotation.y -= delta * 0.23 * speed;
      polarArmRef.current.rotation.x = Math.cos(t * 0.3) * 0.08 + 0.955; // 54.74° Magic Angle base
    }

    if (transferArcRef.current) {
      transferArcRef.current.rotation.z += delta * 0.12 * speed;
      transferArcRef.current.rotation.x += delta * 0.08 * speed;
    }

    // Dynamic pulse amplitudes
    const p1 = (0.65 + 0.15 * Math.sin(t * freq)) * energy;
    const p2 = (0.55 + 0.15 * Math.sin(t * (freq * 0.9) + 1.2)) * energy;
    const p3 = (0.45 + 0.12 * Math.sin(t * (freq * 0.75) + 2.4)) * energy;

    // 1. Equatorial Primary Guidance Channel (Cyan)
    if (matEquatorialRef.current) {
      matEquatorialRef.current.color.copy(colors.waveguidePrimary);
      matEquatorialRef.current.opacity = Math.min(0.92, p1 * inspectBoost);
    }
    // Subtle Golden Vernier Sub-Ring (bridges nucleus golden energy to outer field)
    if (matVernierRef.current) {
      matVernierRef.current.color.copy(colors.nucleusGold);
      matVernierRef.current.opacity = Math.min(0.70, (p1 * 0.8) * inspectBoost);
    }
    if (matTicksRef.current) {
      matTicksRef.current.color.copy(colors.nucleusGold);
      matTicksRef.current.size = 0.038 * (1.0 + 0.2 * Math.sin(t * (freq * 1.5))) * inspectBoost;
    }

    // 2. Polar Resonant Precession Arm (Electric Violet)
    if (matPolarRef.current) {
      matPolarRef.current.color.copy(colors.waveguideSecondary);
      matPolarRef.current.opacity = Math.min(0.88, p2 * inspectBoost);
    }

    // 3. Quantum Transfer Ellipse Arc (Ice-Blue / White)
    if (matTransferRef.current) {
      matTransferRef.current.color.copy(colors.waveguideTertiary);
      matTransferRef.current.opacity = Math.min(0.78, p3 * inspectBoost);
    }
  });

  return (
    <group
      onPointerOver={(e) => {
        e.stopPropagation();
        spatialCameraBus.setHoveredLayer('HARMONIC WAVEGUIDE');
      }}
      onPointerOut={() => spatialCameraBus.setHoveredLayer(null)}
      onClick={(e) => {
        e.stopPropagation();
        spatialCameraBus.setHoveredLayer('HARMONIC WAVEGUIDE');
      }}
    >
      {/* 1. Equatorial Tensor Guidance Arm with Vernier Sub-Ring & Ticks */}
      <group ref={equatorialGroupRef} rotation={[0.22, 0, 0]}>
        <mesh geometry={geoEquatorial}>
          <meshBasicMaterial
            ref={matEquatorialRef}
            color="#00E5FF"
            wireframe
            transparent
            opacity={0.65}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <mesh geometry={geoVernier}>
          <meshBasicMaterial
            ref={matVernierRef}
            color="#FFD54F"
            wireframe
            transparent
            opacity={0.5}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        <points ref={phaseTicksRef} geometry={ticksGeo}>
          <pointsMaterial
            ref={matTicksRef}
            color="#FFD54F"
            size={0.035}
            transparent
            opacity={0.9}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </points>
      </group>

      {/* 2. Polar Resonant Precession Arm (54.7° Magic Angle Violet Carrier) */}
      <mesh ref={polarArmRef} rotation={[0.955, 0, 0.4]} geometry={geoPolar}>
        <meshBasicMaterial
          ref={matPolarRef}
          color="#7A5CFF"
          wireframe
          transparent
          opacity={0.65}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* 3. Quantum Transfer Ellipse Arc (Atmospheric Flux Trajectory) */}
      <mesh ref={transferArcRef} rotation={[0.4, 0.6, 0.8]} geometry={geoTransfer}>
        <meshBasicMaterial
          ref={matTransferRef}
          color="#E0F7FA"
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
