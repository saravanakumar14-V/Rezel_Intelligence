import React from 'react';

export interface InsigniaProps {
  size?: number;
  isFocused?: boolean;
  isActive?: boolean;
  className?: string;
}

/**
 * REZEL CAPABILITY INSIGNIA SYSTEM
 * Ultra-high-fidelity 2100-era computational energy objects and crystalline structures.
 * Photorealistic layered materials, spectral refraction, depth rings, and precision geometry.
 */

/** CREATE: Crystalline Generative Aperture (Amber Gold / Warm White) */
export const CreateInsignia: React.FC<InsigniaProps> = ({
  size = 54,
  isFocused = false,
  isActive = false,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <defs>
      <radialGradient id="createCoreGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFF8E1" stopOpacity="0.95" />
        <stop offset="45%" stopColor="#FFB300" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#FF6F00" stopOpacity="0.1" />
      </radialGradient>
      <linearGradient id="createCrystalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFE082" />
        <stop offset="50%" stopColor="#FFB300" />
        <stop offset="100%" stopColor="#FF8F00" />
      </linearGradient>
    </defs>

    {/* Outer Generative Radiation Ring */}
    <circle
      cx="32"
      cy="32"
      r={isFocused || isActive ? 28 : 25}
      stroke="url(#createCrystalGrad)"
      strokeWidth="1"
      strokeDasharray="4 6"
      opacity={isFocused || isActive ? 0.9 : 0.45}
    />

    {/* Expanding Crystalline Aperture Geometry */}
    <path
      d="M32 6L40 24L58 32L40 40L32 58L24 40L6 32L24 24L32 6Z"
      stroke="url(#createCrystalGrad)"
      strokeWidth={isFocused || isActive ? 1.6 : 1.2}
      strokeLinejoin="round"
      fill={isFocused || isActive ? 'rgba(255, 179, 0, 0.12)' : 'none'}
    />

    {/* Internal Layered Crystal Facets */}
    <path
      d="M32 18L38 26L46 32L38 38L32 46L26 38L18 32L26 26L32 18Z"
      stroke="#FFE082"
      strokeWidth="1"
      opacity={isFocused || isActive ? 0.95 : 0.6}
    />

    {/* Glowing Energy Nucleus */}
    <circle cx="32" cy="32" r={isFocused || isActive ? 6 : 4.5} fill="url(#createCoreGlow)" />
    <circle cx="32" cy="32" r="1.8" fill="#FFFFFF" />

    {/* Radial Aperture Nodes */}
    <circle cx="32" cy="10" r="1.2" fill="#FFE082" />
    <circle cx="54" cy="32" r="1.2" fill="#FFE082" />
    <circle cx="32" cy="54" r="1.2" fill="#FFE082" />
    <circle cx="10" cy="32" r="1.2" fill="#FFE082" />
  </svg>
);

/** CONVERSE: Dual-Intelligence Resonance Object (Ice Blue / Cyan) */
export const ConverseInsignia: React.FC<InsigniaProps> = ({
  size = 54,
  isFocused = false,
  isActive = false,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="converseWaveGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#E0F7FA" />
        <stop offset="50%" stopColor="#7ECFFF" />
        <stop offset="100%" stopColor="#00B0FF" />
      </linearGradient>
      <radialGradient id="converseCoreGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
        <stop offset="60%" stopColor="#7ECFFF" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#0091EA" stopOpacity="0.1" />
      </radialGradient>
    </defs>

    {/* Outer Acoustic Resonance Boundary */}
    <circle
      cx="32"
      cy="32"
      r={isFocused || isActive ? 28 : 25}
      stroke="url(#converseWaveGrad)"
      strokeWidth="1"
      strokeDasharray="2 4"
      opacity={isFocused || isActive ? 0.85 : 0.4}
    />

    {/* Primary Harmonic Fluid Waveform */}
    <path
      d="M10 32C16 18 24 18 32 32C40 46 48 46 54 32"
      stroke="url(#converseWaveGrad)"
      strokeWidth={isFocused || isActive ? 2 : 1.4}
      strokeLinecap="round"
    />

    {/* Synchronized Inverse Waveform */}
    <path
      d="M10 32C16 46 24 46 32 32C40 18 48 18 54 32"
      stroke="#7ECFFF"
      strokeWidth={isFocused || isActive ? 1.4 : 1}
      strokeDasharray="3 3"
      strokeLinecap="round"
      opacity={isFocused || isActive ? 0.9 : 0.6}
    />

    {/* Central Intelligence Synchronization Nodes */}
    <circle cx="20" cy="32" r="2.2" fill="#FFFFFF" />
    <circle cx="32" cy="32" r={isFocused || isActive ? 5 : 3.5} fill="url(#converseCoreGlow)" />
    <circle cx="44" cy="32" r="2.2" fill="#FFFFFF" />
  </svg>
);

/** AUTOMATE: Precision Execution Engine Lattice (Emerald / Mint) */
export const AutomateInsignia: React.FC<InsigniaProps> = ({
  size = 54,
  isFocused = false,
  isActive = false,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="automateEngineGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#B9F6CA" />
        <stop offset="50%" stopColor="#00E676" />
        <stop offset="100%" stopColor="#00C853" />
      </linearGradient>
      <radialGradient id="automateCoreGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
        <stop offset="50%" stopColor="#00E676" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#00B248" stopOpacity="0.1" />
      </radialGradient>
    </defs>

    {/* Directional Velocity Perimeter */}
    <circle
      cx="32"
      cy="32"
      r={isFocused || isActive ? 28 : 25}
      stroke="url(#automateEngineGrad)"
      strokeWidth="1"
      strokeDasharray="6 6"
      opacity={isFocused || isActive ? 0.9 : 0.45}
    />

    {/* Forward Execution Track Lattice */}
    <line x1="12" y1="24" x2="44" y2="24" stroke="#69F0AE" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.6" />
    <line x1="12" y1="40" x2="44" y2="40" stroke="#69F0AE" strokeWidth="1.2" strokeDasharray="3 3" opacity="0.6" />
    <line x1="8" y1="32" x2="46" y2="32" stroke="url(#automateEngineGrad)" strokeWidth={isFocused || isActive ? 2.2 : 1.6} strokeLinecap="round" />

    {/* Forward Execution Chevrons */}
    <path
      d="M38 20L50 32L38 44"
      stroke="url(#automateEngineGrad)"
      strokeWidth={isFocused || isActive ? 2.2 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M26 24L34 32L26 40"
      stroke="#B9F6CA"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={isFocused || isActive ? 0.85 : 0.5}
    />

    {/* Engine Process Nucleus */}
    <circle cx="16" cy="32" r={isFocused || isActive ? 4.5 : 3.5} fill="url(#automateCoreGlow)" />
    <circle cx="16" cy="32" r="1.5" fill="#FFFFFF" />
  </svg>
);

/** ANALYZE: Spectral Intelligence Analyzer (Analytical Cyan / White-Cyan) */
export const AnalyzeInsignia: React.FC<InsigniaProps> = ({
  size = 54,
  isFocused = false,
  isActive = false,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="analyzeScanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#E0F7FA" />
        <stop offset="50%" stopColor="#00E5FF" />
        <stop offset="100%" stopColor="#00B0FF" />
      </linearGradient>
    </defs>

    {/* Concentric Scan Horizon */}
    <circle
      cx="32"
      cy="32"
      r={isFocused || isActive ? 28 : 25}
      stroke="url(#analyzeScanGrad)"
      strokeWidth="1"
      strokeDasharray="4 8"
      opacity={isFocused || isActive ? 0.9 : 0.45}
    />

    {/* Stratified Spectral Strata Bands */}
    <line x1="12" y1="18" x2="52" y2="18" stroke="#80DEEA" strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />
    <line x1="12" y1="46" x2="52" y2="46" stroke="#80DEEA" strokeWidth="1" strokeDasharray="2 4" opacity="0.5" />

    {/* Analytical Signal Decomposition Curve */}
    <path
      d="M12 38C18 38 22 22 28 22C34 22 38 42 44 42C48 42 50 34 52 34"
      stroke="url(#analyzeScanGrad)"
      strokeWidth={isFocused || isActive ? 2.2 : 1.6}
      strokeLinecap="round"
    />

    {/* Precision Sampling Reticle Points */}
    <circle cx="28" cy="22" r="2.5" fill="#FFFFFF" stroke="#00E5FF" strokeWidth="1" />
    <circle cx="44" cy="42" r="2" fill="#00E5FF" />
    <circle cx="32" cy="32" r="1.5" fill="#E0F7FA" />
  </svg>
);

/** INSPECT: Deep-Observation Aperture (Violet / Magenta-Violet) */
export const InspectInsignia: React.FC<InsigniaProps> = ({
  size = 54,
  isFocused = false,
  isActive = false,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="inspectApertureGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F3E5F5" />
        <stop offset="50%" stopColor="#9D4EDD" />
        <stop offset="100%" stopColor="#7B1FA2" />
      </linearGradient>
      <radialGradient id="inspectCoreGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
        <stop offset="55%" stopColor="#9D4EDD" stopOpacity="0.8" />
        <stop offset="100%" stopColor="#4A148C" stopOpacity="0.1" />
      </radialGradient>
    </defs>

    {/* Outer Observation Ring */}
    <circle
      cx="32"
      cy="32"
      r={isFocused || isActive ? 28 : 25}
      stroke="url(#inspectApertureGrad)"
      strokeWidth="1"
      strokeDasharray="3 5"
      opacity={isFocused || isActive ? 0.9 : 0.45}
    />

    {/* Concentric Observation Diamond */}
    <rect
      x="32"
      y="11"
      width="30"
      height="30"
      transform="rotate(45 32 11)"
      stroke="url(#inspectApertureGrad)"
      strokeWidth={isFocused || isActive ? 1.6 : 1.2}
      fill={isFocused || isActive ? 'rgba(157, 78, 221, 0.12)' : 'none'}
    />

    {/* Nested Optical Ring & Focal Core */}
    <circle cx="32" cy="32" r={isFocused || isActive ? 10 : 8} stroke="#CE93D8" strokeWidth="1.2" />
    <circle cx="32" cy="32" r={isFocused || isActive ? 4 : 3} fill="url(#inspectCoreGlow)" />
    <circle cx="32" cy="32" r="1.5" fill="#FFFFFF" />

    {/* Corner Observation Reticles */}
    <line x1="32" y1="4" x2="32" y2="8" stroke="#E1BEE7" strokeWidth="1.4" strokeLinecap="round" />
    <line x1="32" y1="56" x2="32" y2="60" stroke="#E1BEE7" strokeWidth="1.4" strokeLinecap="round" />
    <line x1="4" y1="32" x2="8" y2="32" stroke="#E1BEE7" strokeWidth="1.4" strokeLinecap="round" />
    <line x1="56" y1="32" x2="60" y2="32" stroke="#E1BEE7" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

/** CONTROL: Governance Reactor (Deep Indigo / Electric Purple) */
export const ControlInsignia: React.FC<InsigniaProps> = ({
  size = 54,
  isFocused = false,
  isActive = false,
  className,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="controlReactorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#EDE7F6" />
        <stop offset="50%" stopColor="#7A5CFF" />
        <stop offset="100%" stopColor="#512DA8" />
      </linearGradient>
      <radialGradient id="controlCoreGlow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
        <stop offset="55%" stopColor="#7A5CFF" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#311B92" stopOpacity="0.1" />
      </radialGradient>
    </defs>

    {/* Stabilized Governance Perimeter */}
    <circle
      cx="32"
      cy="32"
      r={isFocused || isActive ? 28 : 25}
      stroke="url(#controlReactorGrad)"
      strokeWidth="1"
      strokeDasharray="5 5"
      opacity={isFocused || isActive ? 0.9 : 0.45}
    />

    {/* Hexagonal Boundary Lattice */}
    <path
      d="M32 10L50 20V44L32 54L14 44V20L32 10Z"
      stroke="url(#controlReactorGrad)"
      strokeWidth={isFocused || isActive ? 1.8 : 1.3}
      strokeLinejoin="round"
      fill={isFocused || isActive ? 'rgba(122, 92, 255, 0.12)' : 'none'}
    />

    {/* Tri-Axis Stabilizing Braces */}
    <line x1="32" y1="32" x2="32" y2="11" stroke="#B388FF" strokeWidth="1.2" strokeLinecap="round" />
    <line x1="32" y1="32" x2="49" y2="43" stroke="#B388FF" strokeWidth="1.2" strokeLinecap="round" />
    <line x1="32" y1="32" x2="15" y2="43" stroke="#B388FF" strokeWidth="1.2" strokeLinecap="round" />

    {/* Governance Nucleus */}
    <circle cx="32" cy="32" r={isFocused || isActive ? 5 : 3.8} fill="url(#controlCoreGlow)" />
    <circle cx="32" cy="32" r="1.6" fill="#FFFFFF" />
  </svg>
);

export const CAPABILITY_INSIGNIA_MAP = {
  create: CreateInsignia,
  converse: ConverseInsignia,
  automate: AutomateInsignia,
  analyze: AnalyzeInsignia,
  inspect: InspectInsignia,
  control: ControlInsignia,
};
