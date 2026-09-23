import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SpectralLayerColors } from "./coreSpectralTheme";

interface OrbitParticlesProps {
  /** Number of particles — keep ≤ 600 for performance budget */
  count?: number;
  /** Radius of outer particle sphere */
  radius?: number;
  /** Base rotation speed */
  speed?: number;
  /** Active spectral layer colors */
  colors?: SpectralLayerColors;
}

/**
 * OrbitParticles
 *
 * Structured multi-spectral quantum orbital field surrounding the REZEL Core.
 * Combines an equatorial orbital disk (60%) and a celestial halo (40%) with
 * multi-spectral vertex colors (Cyan, Electric Violet, Ice Blue, Diamond White, and Golden Sparks).
 */
export default function OrbitParticles({
  count = 500,
  radius = 2.8,
  speed = 0.05,
  colors,
}: OrbitParticlesProps) {
  const ref = useRef<THREE.Points>(null!);
  const matRef = useRef<THREE.PointsMaterial>(null!);

  /** Build structured particle positions (Disk + Halo) and multi-spectral vertex colors */
  const { positions, colorArray, initialColors } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const initCol: { base: THREE.Color; category: 'primary' | 'secondary' | 'highlight' | 'accent' | 'gold' }[] = [];

    const goldenAngle = Math.PI * (3 - Math.sqrt(5));

    // Base spectral palette
    const cPrimary = new THREE.Color("#00E5FF");    // Cyan
    const cSecondary = new THREE.Color("#7A5CFF");  // Electric Violet
    const cHighlight = new THREE.Color("#FFFFFF");  // Diamond White
    const cAccent = new THREE.Color("#00BFFF");     // Deep Azure / Ice Blue
    const cGold = new THREE.Color("#FFD54F");       // Residual Golden Spark

    for (let i = 0; i < count; i++) {
      let x = 0, y = 0, z = 0;

      if (i < count * 0.6) {
        // 1. Equatorial Orbital Accretion Disk (flattened on Y)
        const theta = goldenAngle * i;
        const r = radius * (0.55 + Math.random() * 0.55);
        x = Math.cos(theta) * r;
        y = (Math.random() - 0.5) * 0.45; // Thin disk
        z = Math.sin(theta) * r;
      } else {
        // 2. Celestial Spherical Halo
        const theta = goldenAngle * i;
        const normY = 1 - ((i - count * 0.6) / (count * 0.4 - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - normY * normY));
        const scatter = radius * (0.8 + Math.random() * 0.5);
        x = Math.cos(theta) * r * scatter;
        y = normY * scatter;
        z = Math.sin(theta) * r * scatter;
      }

      pos[i * 3 + 0] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;

      // Assign multi-spectral category
      const rand = Math.random();
      let chosenColor = cPrimary;
      let category: 'primary' | 'secondary' | 'highlight' | 'accent' | 'gold' = 'primary';

      if (rand < 0.40) {
        chosenColor = cPrimary;
        category = 'primary';
      } else if (rand < 0.70) {
        chosenColor = cSecondary;
        category = 'secondary';
      } else if (rand < 0.85) {
        chosenColor = cAccent;
        category = 'accent';
      } else if (rand < 0.94) {
        chosenColor = cHighlight;
        category = 'highlight';
      } else {
        chosenColor = cGold;
        category = 'gold';
      }

      initCol.push({ base: chosenColor.clone(), category });
      col[i * 3 + 0] = chosenColor.r;
      col[i * 3 + 1] = chosenColor.g;
      col[i * 3 + 2] = chosenColor.b;
    }

    return { positions: pos, colorArray: col, initialColors: initCol };
  }, [count, radius]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    const speedMult = colors ? colors.speedMultiplier : 1.0;

    // Slow, stately cosmic drift
    ref.current.rotation.y += delta * speed * speedMult;
    ref.current.rotation.x += delta * (speed * 0.25) * speedMult;

    // Dynamic color tinting based on active spectral state
    if (colors && ref.current.geometry.attributes.color) {
      const colorAttr = ref.current.geometry.attributes.color as THREE.BufferAttribute;
      const array = colorAttr.array as Float32Array;

      for (let i = 0; i < count; i++) {
        const item = initialColors[i];
        let targetCol = item.base;

        if (item.category === 'primary') {
          targetCol = colors.waveguidePrimary;
        } else if (item.category === 'secondary') {
          targetCol = colors.waveguideSecondary;
        } else if (item.category === 'highlight') {
          targetCol = colors.nucleusCore;
        } else if (item.category === 'accent') {
          targetCol = colors.waveguideTertiary;
        } else if (item.category === 'gold') {
          targetCol = colors.nucleusGold;
        }

        // Subtly interpolate towards target spectral state
        array[i * 3 + 0] += (targetCol.r - array[i * 3 + 0]) * 0.04;
        array[i * 3 + 1] += (targetCol.g - array[i * 3 + 1]) * 0.04;
        array[i * 3 + 2] += (targetCol.b - array[i * 3 + 2]) * 0.04;
      }
      colorAttr.needsUpdate = true;
    }
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colorArray, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        ref={matRef}
        size={0.022}
        vertexColors
        transparent
        opacity={0.82}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}
