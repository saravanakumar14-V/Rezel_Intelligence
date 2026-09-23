import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SpectralLayerColors } from './coreSpectralTheme';
import { spatialCameraBus } from '../scene/spatialCameraState';

interface ComputationLatticeProps {
  colors: SpectralLayerColors;
}

/**
 * ComputationLattice
 *
 * The neural tensor computational architecture of the REZEL Core.
 * Combines:
 *  1. An engineered polyhedral tensor wireframe with Electric Violet inner contrast.
 *  2. Quantum nodal junctions at geometric vertices.
 *  3. Non-circular 3D quantum field line trajectories channeling computational flux.
 */
export default function ComputationLattice({ colors }: ComputationLatticeProps) {
  const tensorGroupRef = useRef<THREE.Group>(null!);
  const innerLatticeRef = useRef<THREE.Mesh>(null!);
  const outerMatrixRef = useRef<THREE.Mesh>(null!);
  const nodalPointsRef = useRef<THREE.Points>(null!);
  const fieldArcsRef = useRef<THREE.LineSegments>(null!);

  const innerMatRef = useRef<THREE.MeshStandardMaterial>(null!);
  const outerMatRef = useRef<THREE.MeshBasicMaterial>(null!);
  const nodeMatRef = useRef<THREE.PointsMaterial>(null!);
  const arcMatRef = useRef<THREE.LineBasicMaterial>(null!);

  // Geometries
  const innerGeo = useMemo(() => new THREE.IcosahedronGeometry(0.74, 1), []);
  const outerGeo = useMemo(() => new THREE.DodecahedronGeometry(1.02, 0), []);

  // Nodal points
  const nodeGeo = useMemo(() => {
    const pts: number[] = [];
    const baseGeo = new THREE.IcosahedronGeometry(0.74, 1);
    const pos = baseGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return geom;
  }, []);

  // Non-circular 3D Dipole Field Lines
  const arcGeo = useMemo(() => {
    const lines: number[] = [];
    const numLines = 6;
    const steps = 36;
    for (let l = 0; l < numLines; l++) {
      const phiOffset = (l * Math.PI * 2) / numLines;
      for (let s = 0; s < steps; s++) {
        const u1 = (s / steps) * Math.PI;
        const u2 = ((s + 1) / steps) * Math.PI;

        const r1 = 0.88 * Math.sin(u1) + 0.18 * Math.sin(3 * u1);
        const z1 = 0.95 * Math.cos(u1);
        const x1 = r1 * Math.cos(phiOffset + u1 * 0.5);
        const y1 = r1 * Math.sin(phiOffset + u1 * 0.5);

        const r2 = 0.88 * Math.sin(u2) + 0.18 * Math.sin(3 * u2);
        const z2 = 0.95 * Math.cos(u2);
        const x2 = r2 * Math.cos(phiOffset + u2 * 0.5);
        const y2 = r2 * Math.sin(phiOffset + u2 * 0.5);

        lines.push(x1, y1, z1, x2, y2, z2);
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    return geom;
  }, []);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const speed = colors.speedMultiplier;
    const freq = colors.pulseFrequency;
    const energy = colors.energyScale;

    // Check if this layer is inspected
    const isInspected = spatialCameraBus.getHoveredLayer() === 'TENSOR COMPUTATION LATTICE';
    const inspectBoost = isInspected ? 1.3 : 1.0;

    // Structural precession of the tensor matrix
    if (tensorGroupRef.current) {
      tensorGroupRef.current.rotation.y += delta * 0.18 * speed;
      tensorGroupRef.current.rotation.x = Math.sin(t * 0.5) * 0.08;
    }

    if (innerLatticeRef.current) {
      innerLatticeRef.current.rotation.z -= delta * 0.12 * speed;
      innerLatticeRef.current.rotation.y += delta * 0.08 * speed;
    }

    if (fieldArcsRef.current) {
      fieldArcsRef.current.rotation.z += delta * 0.22 * speed;
    }

    // 1. Primary Neural Tensor Lattice (Vivid Electric Violet)
    if (innerMatRef.current) {
      innerMatRef.current.emissive.copy(colors.latticeInner);
      innerMatRef.current.emissiveIntensity = (1.8 + 0.45 * Math.sin(t * freq)) * energy * inspectBoost;
      innerMatRef.current.opacity = Math.min(1.0, 0.92 * inspectBoost);
    }

    // 2. Quantum Nodal Points
    if (nodeMatRef.current) {
      nodeMatRef.current.color.copy(colors.nucleusCore);
      nodeMatRef.current.size = 0.038 * (1.0 + 0.25 * Math.sin(t * (freq * 1.4)));
    }

    // 3. Outer Polyhedral Coherence Matrix (Ice-Blue)
    if (outerMatRef.current) {
      outerMatRef.current.color.copy(colors.latticeOuter);
      outerMatRef.current.opacity = (0.28 + 0.1 * Math.cos(t * (freq * 0.8))) * inspectBoost;
    }

    // 4. Dipole Field Lines (Cyan Flux Trajectories)
    if (arcMatRef.current) {
      arcMatRef.current.color.copy(colors.energyPaths);
      arcMatRef.current.opacity = (0.38 + 0.2 * Math.sin(t * (freq * 1.1) + Math.PI / 4)) * energy * inspectBoost;
    }
  });

  return (
    <group
      ref={tensorGroupRef}
      onPointerOver={(e) => {
        e.stopPropagation();
        spatialCameraBus.setHoveredLayer('TENSOR COMPUTATION LATTICE');
      }}
      onPointerOut={() => spatialCameraBus.setHoveredLayer(null)}
      onClick={(e) => {
        e.stopPropagation();
        spatialCameraBus.setHoveredLayer('TENSOR COMPUTATION LATTICE');
      }}
    >
      {/* 1. Primary Neural Tensor Lattice (Inner Violet Contrast Layer) */}
      <mesh ref={innerLatticeRef} geometry={innerGeo}>
        <meshStandardMaterial
          ref={innerMatRef}
          color="#050818"
          emissive="#7A5CFF"
          emissiveIntensity={1.8}
          wireframe
          metalness={0.92}
          roughness={0.08}
          transparent
          opacity={0.92}
          depthWrite={false}
        />
      </mesh>

      {/* 2. Quantum Nodal Junction Points */}
      <points ref={nodalPointsRef} geometry={nodeGeo}>
        <pointsMaterial
          ref={nodeMatRef}
          color="#FFFFFF"
          size={0.038}
          transparent
          opacity={0.9}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>

      {/* 3. Non-Circular Dipole Energy Field Lines (Polar to Equatorial Arcs) */}
      <lineSegments ref={fieldArcsRef} geometry={arcGeo}>
        <lineBasicMaterial
          ref={arcMatRef}
          color="#00E5FF"
          transparent
          opacity={0.45}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </lineSegments>

      {/* 4. Outer Polyhedral Coherence Matrix */}
      <mesh ref={outerMatrixRef} geometry={outerGeo}>
        <meshBasicMaterial
          ref={outerMatRef}
          color="#00BFFF"
          wireframe
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
