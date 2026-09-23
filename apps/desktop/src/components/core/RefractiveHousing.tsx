import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SpectralLayerColors } from './coreSpectralTheme';
import { spatialCameraBus } from '../scene/spatialCameraState';
import { useHardware } from '../../providers/HardwareProvider';

interface RefractiveHousingProps {
  colors: SpectralLayerColors;
}

/**
 * RefractiveHousing
 *
 * The structural crystal containment vessel surrounding the computational tensor.
 * Engineered with:
 *  1. Clean faceted optical crystal body with PBR transmission & clearcoat.
 *  2. Engineered structural bevel ribs providing a recognizable, crisp silhouette.
 *  3. Deep obsidian-twilight base tint that frames the inner luminous layers.
 */
export default function RefractiveHousing({ colors }: RefractiveHousingProps) {
  const meshRef = useRef<THREE.Mesh>(null!);
  const rimRef = useRef<THREE.Mesh>(null!);
  const matRef = useRef<THREE.MeshPhysicalMaterial>(null!);
  const rimMatRef = useRef<THREE.MeshBasicMaterial>(null!);

  const { quality } = useHardware();

  // Clean faceted icosahedron/dodecahedron containment geometries
  const geo = useMemo(() => new THREE.IcosahedronGeometry(1.38, 1), []);
  const rimGeo = useMemo(() => new THREE.IcosahedronGeometry(1.40, 1), []);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const speed = colors.speedMultiplier;

    // Check if inspected
    const isInspected = spatialCameraBus.getHoveredLayer() === 'REFRACTIVE CONFINEMENT';
    const inspectBoost = isInspected ? 1.35 : 1.0;

    // Dignified, slow structural housing rotation
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.10 * speed;
      meshRef.current.rotation.x += delta * 0.035 * speed;

      if (rimRef.current) {
        rimRef.current.rotation.copy(meshRef.current.rotation);
      }
    }

    // Update physical crystal body color
    if (matRef.current) {
      matRef.current.color.copy(colors.housingTint);
      matRef.current.emissive.copy(colors.housingTint).multiplyScalar(0.4 * inspectBoost);
    }

    // Update structural frame bevels
    if (rimMatRef.current) {
      rimMatRef.current.color.copy(colors.housingRim);
      rimMatRef.current.opacity = (0.26 + 0.08 * Math.sin(t * (colors.pulseFrequency * 0.7))) * colors.energyScale * inspectBoost;
    }
  });

  return (
    <group
      onPointerOver={(e) => {
        e.stopPropagation();
        spatialCameraBus.setHoveredLayer('REFRACTIVE CONFINEMENT');
      }}
      onPointerOut={() => spatialCameraBus.setHoveredLayer(null)}
      onClick={(e) => {
        e.stopPropagation();
        spatialCameraBus.setHoveredLayer('REFRACTIVE CONFINEMENT');
      }}
    >
      {/* 1. Semi-translucent refractive faceted containment hull */}
      <mesh ref={meshRef} geometry={geo}>
        {quality === 'LOW' ? (
          <meshBasicMaterial
            color="#030814"
            wireframe={false}
            transparent
            opacity={0.35}
            depthWrite={false}
          />
        ) : (
          <meshPhysicalMaterial
            ref={matRef}
            color="#030814"
            emissive="#020812"
            roughness={0.06}
            metalness={0.15}
            transmission={0.65}
            ior={1.5}
            clearcoat={1.0}
            clearcoatRoughness={0.03}
            transparent
            opacity={0.42}
            depthWrite={false}
          />
        )}
      </mesh>

      {/* 2. Precision Structural Bevel Frames */}
      <mesh ref={rimRef} geometry={rimGeo}>
        <meshBasicMaterial
          ref={rimMatRef}
          color="#00E5FF"
          wireframe
          transparent
          opacity={0.28}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
