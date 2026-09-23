import React from 'react';

export interface FieldBehaviorProps {
  type: 'create' | 'converse' | 'automate' | 'analyze' | 'inspect' | 'control';
  size?: number;
  color?: string;
  isFocused?: boolean;
}

/**
 * REZEL FIELD BEHAVIORS (Zero Icons / Zero Illustrated Symbols)
 * Represents capabilities through fluid computational physics and field disturbances.
 */
export const FieldBehavior: React.FC<FieldBehaviorProps> = ({
  type,
  size = 40,
  color = '#00E5FF',
  isFocused = false,
}) => {
  switch (type) {
    case 'create':
      // Generative expansion: outward radiating generative particles & aperture rays
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <circle cx="20" cy="20" r={isFocused ? 14 : 9} stroke={color} strokeWidth="1" strokeDasharray="3 4" opacity={isFocused ? 0.9 : 0.4} />
          <circle cx="20" cy="20" r="2.5" fill={color} />
          <line x1="20" y1="4" x2="20" y2="10" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity={isFocused ? 1 : 0.5} />
          <line x1="20" y1="30" x2="20" y2="36" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity={isFocused ? 1 : 0.5} />
          <line x1="4" y1="20" x2="10" y2="20" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity={isFocused ? 1 : 0.5} />
          <line x1="30" y1="20" x2="36" y2="20" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity={isFocused ? 1 : 0.5} />
        </svg>
      );

    case 'converse':
      // Harmonic interaction: two interacting fluid oscillations
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path
            d="M6 20C10 12 15 12 20 20C25 28 30 28 34 20"
            stroke={color}
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity={isFocused ? 1 : 0.6}
          />
          <path
            d="M6 20C10 28 15 28 20 20C25 12 30 12 34 20"
            stroke={color}
            strokeWidth="1"
            strokeDasharray="2 3"
            strokeLinecap="round"
            opacity={isFocused ? 0.8 : 0.35}
          />
        </svg>
      );

    case 'automate':
      // Directional current: parallel execution streams with forward energy flow
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <line x1="6" y1="15" x2="34" y2="15" stroke={color} strokeWidth="1" strokeDasharray="4 4" opacity={isFocused ? 0.7 : 0.35} />
          <line x1="6" y1="25" x2="34" y2="25" stroke={color} strokeWidth="1" strokeDasharray="4 4" opacity={isFocused ? 0.7 : 0.35} />
          <line x1="6" y1="20" x2="28" y2="20" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity={isFocused ? 1 : 0.6} />
          <polyline points="24,14 30,20 24,26" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );

    case 'analyze':
      // Spectral decomposition: stratified frequency scan lines
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <line x1="8" y1="12" x2="32" y2="12" stroke={color} strokeWidth="1" strokeDasharray="2 4" opacity="0.4" />
          <line x1="8" y1="28" x2="32" y2="28" stroke={color} strokeWidth="1" strokeDasharray="2 4" opacity="0.4" />
          <path
            d="M8 24C12 24 14 16 20 16C26 16 28 24 32 24"
            stroke={color}
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity={isFocused ? 1 : 0.6}
          />
          <circle cx="20" cy="16" r="2" fill={color} />
        </svg>
      );

    case 'inspect':
      // Depth convergence: concentric converging luminous rings
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <circle cx="20" cy="20" r="16" stroke={color} strokeWidth="0.8" strokeDasharray="4 6" opacity="0.3" />
          <circle cx="20" cy="20" r="10" stroke={color} strokeWidth="1.2" opacity={isFocused ? 0.9 : 0.5} />
          <circle cx="20" cy="20" r="3" fill={color} />
        </svg>
      );

    case 'control':
    default:
      // Geometric stabilization: orthogonal stabilizing tension axes
      return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <circle cx="20" cy="20" r="14" stroke={color} strokeWidth="1" opacity={isFocused ? 0.8 : 0.35} />
          <line x1="20" y1="8" x2="20" y2="32" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity={isFocused ? 1 : 0.5} />
          <line x1="8" y1="20" x2="32" y2="20" stroke={color} strokeWidth="1.2" strokeLinecap="round" opacity={isFocused ? 1 : 0.5} />
          <circle cx="20" cy="20" r="2.5" fill={color} />
        </svg>
      );
  }
};
