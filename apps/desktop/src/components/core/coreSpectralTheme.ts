import * as THREE from 'three';

export type CoreVisualState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'ATTENTION'
  | 'RECOVERY'
  | 'SUCCESS'
  | 'ERROR';

export type AmbientIdlePhase =
  | 'GOLDEN_DOMINANT'
  | 'MORPH_TO_COMPUTATIONAL'
  | 'COMPUTATIONAL_VARIATION'
  | 'MORPH_TO_HEROIC'
  | 'HEROIC_GOLDEN_RESONANCE'
  | 'MORPH_TO_GOLDEN';

export interface SpectralLayerColors {
  /** Innermost diamond singularity / hot energy core */
  nucleusCore: THREE.Color;
  /** Crystalline faceted polyhedral core emissive */
  nucleusFacet: THREE.Color;
  /** Pure rich 24k golden quantum resonance core */
  nucleusGold: THREE.Color;
  /** Inner neural tensor lattice wireframe (bold violet internal spectral contrast) */
  latticeInner: THREE.Color;
  /** Outer polyhedral tensor matrix wireframe */
  latticeOuter: THREE.Color;
  /** Curved non-circular quantum energy flux trajectories */
  energyPaths: THREE.Color;
  /** Refractive crystal containment hull base tint */
  housingTint: THREE.Color;
  /** Refractive crystal beveled edge frames */
  housingRim: THREE.Color;
  /** Equatorial precision tensor guidance arm (Ring 1 - Cyan) */
  waveguidePrimary: THREE.Color;
  /** Polar resonant precession arm (Ring 2 - persistent Violet secondary identity) */
  waveguideSecondary: THREE.Color;
  /** Asymmetric quantum transfer ellipse arc (Ring 3 - Ice White/Blue highlight) */
  waveguideTertiary: THREE.Color;
  /** Primary point light at origin (Warm Diamond White/Gold in IDLE) */
  lightPrimary: THREE.Color;
  /** Offset chromatic fill point light (Electric Violet in IDLE) */
  lightSecondary: THREE.Color;
  /** Global speed multiplier */
  speedMultiplier: number;
  /** Core pulse frequency */
  pulseFrequency: number;
  /** Core energy amplitude scale */
  energyScale: number;
}

// ─── Pre-allocated Static Palettes for Zero-GC Ambient Morph ─────────────────
// Rule: 80% GOLDEN IDENTITY + 20% SECONDARY SPECTRAL ENERGY
// The central Quantum Nucleus, Halo, and Core Light REMAIN 100% PURE GOLD at all times.

export const GOLDEN_IDLE_PALETTE: SpectralLayerColors = {
  nucleusCore: new THREE.Color('#FFFFFF'), // Pure diamond white singularity
  nucleusFacet: new THREE.Color('#FFB300'), // Luminous warm amber gold
  nucleusGold: new THREE.Color('#FFA000'),  // Pure 24K saturated quantum gold (Permanent Anchor)
  latticeInner: new THREE.Color('#8B5CF6'), // Bold electric violet inner tensor contrast
  latticeOuter: new THREE.Color('#00D2FF'), // Ice-blue outer matrix
  energyPaths: new THREE.Color('#00F0FF'),  // Cyan flux trajectories
  housingTint: new THREE.Color('#040816'),  // Deep obsidian-navy crystal
  housingRim: new THREE.Color('#00F0FF'),   // Cyan facet rim
  waveguidePrimary: new THREE.Color('#00F0FF'), // Cyan equatorial ring
  waveguideSecondary: new THREE.Color('#8B5CF6'), // Electric violet polar ring
  waveguideTertiary: new THREE.Color('#FFFFFF'),  // Diamond ice-white transfer ring
  lightPrimary: new THREE.Color('#FFE082'), // Warm diamond-gold core origin light
  lightSecondary: new THREE.Color('#8B5CF6'), // Electric violet fill light
  speedMultiplier: 0.85,
  pulseFrequency: 1.6,
  energyScale: 1.25,
};

export const COMPUTATIONAL_VARIATION_PALETTE: SpectralLayerColors = {
  nucleusCore: new THREE.Color('#FFFFFF'), // Pure diamond white singularity
  nucleusFacet: new THREE.Color('#FFC107'), // Warm golden facet (Preserves Gold Identity!)
  nucleusGold: new THREE.Color('#FF9800'),  // Pure 24K saturated quantum gold (100% Locked Gold Anchor!)
  latticeInner: new THREE.Color('#00F0FF'), // Electric cyan computational lattice variation
  latticeOuter: new THREE.Color('#8B5CF6'), // Electric violet outer tensor matrix
  energyPaths: new THREE.Color('#00F5D4'),  // Teal-cyan quantum energy flux
  housingTint: new THREE.Color('#030A1C'),  // Deep obsidian sapphire crystal hull
  housingRim: new THREE.Color('#7ECFFF'),   // Crisp ice-cyan facet rim
  waveguidePrimary: new THREE.Color('#00F5D4'), // Teal-cyan equatorial ring
  waveguideSecondary: new THREE.Color('#8B5CF6'), // Electric violet polar ring
  waveguideTertiary: new THREE.Color('#FFFFFF'),  // Diamond white transfer ring
  lightPrimary: new THREE.Color('#FFE082'), // Warm diamond-gold core origin light (Locked Gold!)
  lightSecondary: new THREE.Color('#00F0FF'), // Electric cyan offset fill light
  speedMultiplier: 0.95,
  pulseFrequency: 1.85,
  energyScale: 1.30,
};

export const HEROIC_GOLDEN_PALETTE: SpectralLayerColors = {
  nucleusCore: new THREE.Color('#FFFFFF'), // Pure diamond white singularity
  nucleusFacet: new THREE.Color('#FF9500'), // Thick, dense, ultra-rich 24K gold crystal facets
  nucleusGold: new THREE.Color('#FF8C00'),  // Thickest saturated high-density quantum gold resonance
  latticeInner: new THREE.Color('#8A2BE2'), // Royal violet inner tensor framing the massive gold core
  latticeOuter: new THREE.Color('#00E5FF'), // Precision cyan matrix
  energyPaths: new THREE.Color('#FFCA28'),  // Thick luminous golden flux trajectories outward
  housingTint: new THREE.Color('#080614'),  // Deep crystal housing warmed by gold core
  housingRim: new THREE.Color('#FFD54F'),   // Gleaming gold-cyan beveled rim highlight
  waveguidePrimary: new THREE.Color('#00E5FF'), // Electric cyan primary waveguide
  waveguideSecondary: new THREE.Color('#9D4EDD'), // Royal violet polar ring
  waveguideTertiary: new THREE.Color('#FFF8E1'), // Warm golden-white transfer arc
  lightPrimary: new THREE.Color('#FFCA28'), // Dense warm golden core illumination
  lightSecondary: new THREE.Color('#8A2BE2'), // Royal violet fill light
  speedMultiplier: 0.70,                  // Calm, authoritative, majestic power under control
  pulseFrequency: 1.35,                   // Deep breathing
  energyScale: 1.45,                      // Thick, dense volumetric mass
};

/**
 * Returns the current ambient idle phase and progress for an 18-second macro cycle:
 *  0.0s - 5.0s:   GOLDEN_DOMINANT (Hold)
 *  5.0s - 6.0s:   MORPH_TO_COMPUTATIONAL (Cosine Lerp 0 -> 1)
 *  6.0s - 11.0s:  COMPUTATIONAL_VARIATION (Hold)
 *  11.0s - 12.0s: MORPH_TO_HEROIC (Cosine Lerp 0 -> 1)
 *  12.0s - 17.0s: HEROIC_GOLDEN_RESONANCE (Hold)
 *  17.0s - 18.0s: MORPH_TO_GOLDEN (Cosine Lerp 0 -> 1)
 */
export function getAmbientIdlePhase(elapsedSeconds: number): { phase: AmbientIdlePhase; progress: number } {
  const t = ((elapsedSeconds % 18.0) + 18.0) % 18.0;
  if (t < 5.0) {
    return { phase: 'GOLDEN_DOMINANT', progress: t / 5.0 };
  } else if (t < 6.0) {
    const p = t - 5.0;
    return { phase: 'MORPH_TO_COMPUTATIONAL', progress: 0.5 - 0.5 * Math.cos(Math.PI * p) };
  } else if (t < 11.0) {
    return { phase: 'COMPUTATIONAL_VARIATION', progress: (t - 6.0) / 5.0 };
  } else if (t < 12.0) {
    const p = t - 11.0;
    return { phase: 'MORPH_TO_HEROIC', progress: 0.5 - 0.5 * Math.cos(Math.PI * p) };
  } else if (t < 17.0) {
    return { phase: 'HEROIC_GOLDEN_RESONANCE', progress: (t - 12.0) / 5.0 };
  } else {
    const p = t - 17.0;
    return { phase: 'MORPH_TO_GOLDEN', progress: 0.5 - 0.5 * Math.cos(Math.PI * p) };
  }
}

/**
 * Samples the 3-state ambient idle configuration directly into pre-allocated target structure.
 * Zero-allocation, continuous, seamless evolution.
 */
export function sampleAmbientIdleState(target: SpectralLayerColors, elapsedSeconds: number) {
  const { phase, progress } = getAmbientIdlePhase(elapsedSeconds);

  let sourceA: SpectralLayerColors;
  let sourceB: SpectralLayerColors;
  let factor: number;

  switch (phase) {
    case 'GOLDEN_DOMINANT':
      sourceA = GOLDEN_IDLE_PALETTE;
      sourceB = GOLDEN_IDLE_PALETTE;
      factor = 0;
      break;
    case 'MORPH_TO_COMPUTATIONAL':
      sourceA = GOLDEN_IDLE_PALETTE;
      sourceB = COMPUTATIONAL_VARIATION_PALETTE;
      factor = progress;
      break;
    case 'COMPUTATIONAL_VARIATION':
      sourceA = COMPUTATIONAL_VARIATION_PALETTE;
      sourceB = COMPUTATIONAL_VARIATION_PALETTE;
      factor = 0;
      break;
    case 'MORPH_TO_HEROIC':
      sourceA = COMPUTATIONAL_VARIATION_PALETTE;
      sourceB = HEROIC_GOLDEN_PALETTE;
      factor = progress;
      break;
    case 'HEROIC_GOLDEN_RESONANCE':
      sourceA = HEROIC_GOLDEN_PALETTE;
      sourceB = HEROIC_GOLDEN_PALETTE;
      factor = 0;
      break;
    case 'MORPH_TO_GOLDEN':
      sourceA = HEROIC_GOLDEN_PALETTE;
      sourceB = GOLDEN_IDLE_PALETTE;
      factor = progress;
      break;
  }

  // 1. Central Core Anchor (Persistent Pure Gold Foundation)
  target.nucleusCore.copy(sourceA.nucleusCore).lerp(sourceB.nucleusCore, factor);
  target.nucleusGold.copy(sourceA.nucleusGold).lerp(sourceB.nucleusGold, factor);
  target.nucleusFacet.copy(sourceA.nucleusFacet).lerp(sourceB.nucleusFacet, factor);

  // 2. Computational Lattice (Electric Violet <-> Cyan <-> Royal Violet)
  target.latticeInner.copy(sourceA.latticeInner).lerp(sourceB.latticeInner, factor);
  target.latticeOuter.copy(sourceA.latticeOuter).lerp(sourceB.latticeOuter, factor);
  target.energyPaths.copy(sourceA.energyPaths).lerp(sourceB.energyPaths, factor);

  // 3. Confinement Hull & Outer Waveguides
  target.housingTint.copy(sourceA.housingTint).lerp(sourceB.housingTint, factor);
  target.housingRim.copy(sourceA.housingRim).lerp(sourceB.housingRim, factor);
  target.waveguidePrimary.copy(sourceA.waveguidePrimary).lerp(sourceB.waveguidePrimary, factor);
  target.waveguideSecondary.copy(sourceA.waveguideSecondary).lerp(sourceB.waveguideSecondary, factor);
  target.waveguideTertiary.copy(sourceA.waveguideTertiary).lerp(sourceB.waveguideTertiary, factor);

  // 4. Origin Lighting & Kinematics
  target.lightPrimary.copy(sourceA.lightPrimary).lerp(sourceB.lightPrimary, factor);
  target.lightSecondary.copy(sourceA.lightSecondary).lerp(sourceB.lightSecondary, factor);
  target.speedMultiplier = sourceA.speedMultiplier + (sourceB.speedMultiplier - sourceA.speedMultiplier) * factor;
  target.pulseFrequency = sourceA.pulseFrequency + (sourceB.pulseFrequency - sourceA.pulseFrequency) * factor;
  target.energyScale = sourceA.energyScale + (sourceB.energyScale - sourceA.energyScale) * factor;
}

export function getSpectralPalette(state: CoreVisualState, idleElapsedSeconds = 0): SpectralLayerColors {
  switch (state) {
    case 'LISTENING':
      // Dominant: ice blue / cyan; Secondary: white internal energy, subtle violet edge response
      return {
        nucleusCore: new THREE.Color('#FFFFFF'),
        nucleusFacet: new THREE.Color('#7ECFFF'),
        nucleusGold: new THREE.Color('#FFB300'), // Pure luminous gold foundation
        latticeInner: new THREE.Color('#8A2BE2'),
        latticeOuter: new THREE.Color('#00E5FF'),
        energyPaths: new THREE.Color('#7ECFFF'),
        housingTint: new THREE.Color('#040D1E'),
        housingRim: new THREE.Color('#7ECFFF'),
        waveguidePrimary: new THREE.Color('#7ECFFF'),
        waveguideSecondary: new THREE.Color('#9D4EDD'),
        waveguideTertiary: new THREE.Color('#FFFFFF'),
        lightPrimary: new THREE.Color('#FFF4D6'),
        lightSecondary: new THREE.Color('#8A2BE2'),
        speedMultiplier: 1.2,
        pulseFrequency: 2.2,
        energyScale: 1.15,
      };

    case 'THINKING':
      // Dominant: deep azure, electric violet; Secondary: pure gold inner energy
      return {
        nucleusCore: new THREE.Color('#E0F7FA'),
        nucleusFacet: new THREE.Color('#0077FE'),
        nucleusGold: new THREE.Color('#FFA000'), // Rich gold inner core
        latticeInner: new THREE.Color('#7A5CFF'),
        latticeOuter: new THREE.Color('#00E5FF'),
        energyPaths: new THREE.Color('#00F5D4'),
        housingTint: new THREE.Color('#080820'),
        housingRim: new THREE.Color('#6C5CE7'),
        waveguidePrimary: new THREE.Color('#7A5CFF'),
        waveguideSecondary: new THREE.Color('#0077FE'),
        waveguideTertiary: new THREE.Color('#00F5D4'),
        lightPrimary: new THREE.Color('#FFF0C2'),
        lightSecondary: new THREE.Color('#7A5CFF'),
        speedMultiplier: 1.6,
        pulseFrequency: 3.4,
        energyScale: 1.3,
      };

    case 'EXECUTING':
      // Dominant: violet; Secondary: magenta, cyan (gold becomes brighter/hotter at nucleus)
      return {
        nucleusCore: new THREE.Color('#FFFFFF'),
        nucleusFacet: new THREE.Color('#9D4EDD'),
        nucleusGold: new THREE.Color('#FF9100'), // Hot radiant gold nucleus
        latticeInner: new THREE.Color('#FF007F'),
        latticeOuter: new THREE.Color('#00E5FF'),
        energyPaths: new THREE.Color('#FF007F'),
        housingTint: new THREE.Color('#100520'),
        housingRim: new THREE.Color('#FF007F'),
        waveguidePrimary: new THREE.Color('#9D4EDD'),
        waveguideSecondary: new THREE.Color('#FF007F'),
        waveguideTertiary: new THREE.Color('#00E5FF'),
        lightPrimary: new THREE.Color('#FFA726'),
        lightSecondary: new THREE.Color('#FF007F'),
        speedMultiplier: 2.2,
        pulseFrequency: 4.8,
        energyScale: 1.5,
      };

    case 'VERIFYING':
      // Dominant: mint / emerald; Secondary: cyan, white/gold precision nucleus
      return {
        nucleusCore: new THREE.Color('#FFFFFF'),
        nucleusFacet: new THREE.Color('#00FFAE'),
        nucleusGold: new THREE.Color('#FFCA28'), // Gold contracts toward white/mint precision
        latticeInner: new THREE.Color('#00E676'),
        latticeOuter: new THREE.Color('#00E5FF'),
        energyPaths: new THREE.Color('#00FFAE'),
        housingTint: new THREE.Color('#021410'),
        housingRim: new THREE.Color('#00FFAE'),
        waveguidePrimary: new THREE.Color('#00FFAE'),
        waveguideSecondary: new THREE.Color('#00E5FF'),
        waveguideTertiary: new THREE.Color('#FFFFFF'),
        lightPrimary: new THREE.Color('#FFF8E1'),
        lightSecondary: new THREE.Color('#00E5FF'),
        speedMultiplier: 1.0,
        pulseFrequency: 2.0,
        energyScale: 1.1,
      };

    case 'SUCCESS':
      // Emerald, cyan, golden white convergence
      return {
        nucleusCore: new THREE.Color('#FFFFFF'),
        nucleusFacet: new THREE.Color('#00E676'),
        nucleusGold: new THREE.Color('#FFD54F'), // Gold/white harmonic convergence
        latticeInner: new THREE.Color('#00FFAE'),
        latticeOuter: new THREE.Color('#00F5D4'),
        energyPaths: new THREE.Color('#00E676'),
        housingTint: new THREE.Color('#021812'),
        housingRim: new THREE.Color('#00FFAE'),
        waveguidePrimary: new THREE.Color('#00E676'),
        waveguideSecondary: new THREE.Color('#00F5D4'),
        waveguideTertiary: new THREE.Color('#FFFFFF'),
        lightPrimary: new THREE.Color('#FFF9C4'),
        lightSecondary: new THREE.Color('#00E5FF'),
        speedMultiplier: 0.9,
        pulseFrequency: 1.4,
        energyScale: 1.2,
      };

    case 'RECOVERY':
      // Magenta, violet, stabilizing inner gold energy
      return {
        nucleusCore: new THREE.Color('#FFFFFF'),
        nucleusFacet: new THREE.Color('#FF2E93'),
        nucleusGold: new THREE.Color('#FFB300'), // Stabilizing inner gold energy
        latticeInner: new THREE.Color('#7A5CFF'),
        latticeOuter: new THREE.Color('#00E5FF'),
        energyPaths: new THREE.Color('#FF2E93'),
        housingTint: new THREE.Color('#180418'),
        housingRim: new THREE.Color('#FF2E93'),
        waveguidePrimary: new THREE.Color('#FF2E93'),
        waveguideSecondary: new THREE.Color('#7A5CFF'),
        waveguideTertiary: new THREE.Color('#00E5FF'),
        lightPrimary: new THREE.Color('#FFE082'),
        lightSecondary: new THREE.Color('#7A5CFF'),
        speedMultiplier: 1.3,
        pulseFrequency: 2.4,
        energyScale: 1.2,
      };

    case 'ATTENTION':
      // Amber alert while preserving underlying cyan & violet containment
      return {
        nucleusCore: new THREE.Color('#FFFFFF'),
        nucleusFacet: new THREE.Color('#FFA000'),
        nucleusGold: new THREE.Color('#FF8F00'),
        latticeInner: new THREE.Color('#FF9800'),
        latticeOuter: new THREE.Color('#00E5FF'),
        energyPaths: new THREE.Color('#FFA000'),
        housingTint: new THREE.Color('#181200'),
        housingRim: new THREE.Color('#FFA000'),
        waveguidePrimary: new THREE.Color('#FFA000'),
        waveguideSecondary: new THREE.Color('#7A5CFF'),
        waveguideTertiary: new THREE.Color('#00E5FF'),
        lightPrimary: new THREE.Color('#FFB74D'),
        lightSecondary: new THREE.Color('#00E5FF'),
        speedMultiplier: 0.75,
        pulseFrequency: 1.5,
        energyScale: 1.1,
      };

    case 'ERROR':
      // Crimson disruption with preserved underlying spectral structure & persistent gold nucleus
      return {
        nucleusCore: new THREE.Color('#FFFFFF'),
        nucleusFacet: new THREE.Color('#FF2A55'),
        nucleusGold: new THREE.Color('#FFB300'), // Gold nucleus remains visible inside disrupted outer structure
        latticeInner: new THREE.Color('#7A5CFF'), // Preserves underlying electric violet
        latticeOuter: new THREE.Color('#00E5FF'), // Preserves underlying cyan
        energyPaths: new THREE.Color('#FF2A55'),
        housingTint: new THREE.Color('#1A0408'),
        housingRim: new THREE.Color('#FF2A55'),
        waveguidePrimary: new THREE.Color('#FF2A55'),
        waveguideSecondary: new THREE.Color('#7A5CFF'), // Preserves secondary identity
        waveguideTertiary: new THREE.Color('#00BFFF'),   // Preserves tertiary identity
        lightPrimary: new THREE.Color('#FF5252'),
        lightSecondary: new THREE.Color('#7A5CFF'),
        speedMultiplier: 0.55,
        pulseFrequency: 1.1,
        energyScale: 1.35,
      };

    case 'IDLE':
    default: {
      const statePalette = createInterpolatedSpectralState();
      sampleAmbientIdleState(statePalette, idleElapsedSeconds);
      return statePalette;
    }
  }
}

export function createInterpolatedSpectralState(): SpectralLayerColors {
  return {
    nucleusCore: GOLDEN_IDLE_PALETTE.nucleusCore.clone(),
    nucleusFacet: GOLDEN_IDLE_PALETTE.nucleusFacet.clone(),
    nucleusGold: GOLDEN_IDLE_PALETTE.nucleusGold.clone(),
    latticeInner: GOLDEN_IDLE_PALETTE.latticeInner.clone(),
    latticeOuter: GOLDEN_IDLE_PALETTE.latticeOuter.clone(),
    energyPaths: GOLDEN_IDLE_PALETTE.energyPaths.clone(),
    housingTint: GOLDEN_IDLE_PALETTE.housingTint.clone(),
    housingRim: GOLDEN_IDLE_PALETTE.housingRim.clone(),
    waveguidePrimary: GOLDEN_IDLE_PALETTE.waveguidePrimary.clone(),
    waveguideSecondary: GOLDEN_IDLE_PALETTE.waveguideSecondary.clone(),
    waveguideTertiary: GOLDEN_IDLE_PALETTE.waveguideTertiary.clone(),
    lightPrimary: GOLDEN_IDLE_PALETTE.lightPrimary.clone(),
    lightSecondary: GOLDEN_IDLE_PALETTE.lightSecondary.clone(),
    speedMultiplier: GOLDEN_IDLE_PALETTE.speedMultiplier,
    pulseFrequency: GOLDEN_IDLE_PALETTE.pulseFrequency,
    energyScale: GOLDEN_IDLE_PALETTE.energyScale,
  };
}

export function lerpSpectralState(
  current: SpectralLayerColors,
  target: SpectralLayerColors,
  alpha: number
) {
  current.nucleusCore.lerp(target.nucleusCore, alpha);
  current.nucleusFacet.lerp(target.nucleusFacet, alpha);
  current.nucleusGold.lerp(target.nucleusGold, alpha);
  current.latticeInner.lerp(target.latticeInner, alpha);
  current.latticeOuter.lerp(target.latticeOuter, alpha);
  current.energyPaths.lerp(target.energyPaths, alpha);
  current.housingTint.lerp(target.housingTint, alpha);
  current.housingRim.lerp(target.housingRim, alpha);
  current.waveguidePrimary.lerp(target.waveguidePrimary, alpha);
  current.waveguideSecondary.lerp(target.waveguideSecondary, alpha);
  current.waveguideTertiary.lerp(target.waveguideTertiary, alpha);
  current.lightPrimary.lerp(target.lightPrimary, alpha);
  current.lightSecondary.lerp(target.lightSecondary, alpha);
  current.speedMultiplier += (target.speedMultiplier - current.speedMultiplier) * alpha;
  current.pulseFrequency += (target.pulseFrequency - current.pulseFrequency) * alpha;
  current.energyScale += (target.energyScale - current.energyScale) * alpha;
}
