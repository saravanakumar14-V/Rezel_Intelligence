import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { SpectralLayerColors } from './coreSpectralTheme';

interface CoreLightProps {
  colors?: SpectralLayerColors;
}

/**
 * CoreLight
 *
 * Provides balanced multi-source chromatic lighting for the Rezel space scene.
 * - Soft ambient fill (deep cosmic void)
 * - Primary warm diamond-gold point light at core origin
 * - Secondary electric violet fill point light for chromatic facet separation
 * - Subtle directional rim light for silhouette definition
 */
export default function CoreLight({ colors }: CoreLightProps) {
  const primaryLightRef = useRef<THREE.PointLight>(null!);
  const secondaryLightRef = useRef<THREE.PointLight>(null!);

  useFrame(() => {
    if (!colors) return;

    if (primaryLightRef.current) {
      primaryLightRef.current.color.copy(colors.lightPrimary);
      primaryLightRef.current.intensity = 78 * colors.energyScale;
    }

    if (secondaryLightRef.current) {
      secondaryLightRef.current.color.copy(colors.lightSecondary);
      secondaryLightRef.current.intensity = 42 * colors.energyScale;
    }
  });

  return (
    <>
      {/* Space ambient — very dark to keep the deep cosmic void feel */}
      <ambientLight intensity={0.08} color="#0A0A1A" />

      {/* Primary quantum core glow — centered at origin (Warm Diamond White/Gold in IDLE) */}
      <pointLight
        ref={primaryLightRef}
        position={[0, 0, 0]}
        intensity={65}
        distance={18}
        decay={2}
        color="#FFF8E7"
      />

      {/* Quantum chromatic secondary fill — creates rich violet facet contrast */}
      <pointLight
        ref={secondaryLightRef}
        position={[2, 3, -3]}
        intensity={35}
        distance={14}
        decay={2}
        color="#7A5CFF"
      />

      {/* Subtle directional rim light for crisp edge definitions */}
      <directionalLight
        position={[-6, 4, -8]}
        intensity={0.5}
        color="#00BFFF"
      />

      {/* Hemispherical subtle fill */}
      <hemisphereLight
        args={["#0D1B2A", "#000000", 0.15]}
      />
    </>
  );
}
