import React from 'react';

export interface StructuralIdentityProps {
  type: 'core' | 'creation' | 'waveform' | 'lattice' | 'spectral' | 'aperture' | 'mesh3d' | 'memory' | 'security' | 'router';
  size?: number;
  color?: string;
  isActive?: boolean;
  className?: string;
}

/**
 * REZEL STRUCTURAL IDENTITY MODELS
 * Miniature visual computational models representing capabilities through structural geometry.
 */
export const StructuralIdentity: React.FC<StructuralIdentityProps> = ({
  type,
  size = 28,
  color = '#00E5FF',
  isActive = false,
  className,
}) => {
  switch (type) {
    case 'core':
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
          <circle cx="16" cy="16" r="13" stroke={color} strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
          <circle cx="16" cy="16" r="8" stroke={color} strokeWidth="1.2" />
          <circle cx="16" cy="16" r="3.5" fill={color} />
        </svg>
      );

    case 'mesh3d':
      // 3D Isometric Coordinate Lattice & Faceted Cube Structure
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
          <path d="M16 4L26 10V22L16 28L6 22V10L16 4Z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
          <path d="M16 4V16L26 22" stroke={color} strokeWidth="1" opacity="0.75" />
          <path d="M16 16L6 22" stroke={color} strokeWidth="1" opacity="0.75" />
          <circle cx="16" cy="16" r="1.5" fill={color} />
        </svg>
      );

    case 'memory':
      // Layered Recursive Topological Strata
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
          <rect x="6" y="6" width="20" height="20" rx="2" stroke={color} strokeWidth="1" strokeDasharray="2 3" opacity="0.5" />
          <rect x="10" y="10" width="12" height="12" rx="1.5" stroke={color} strokeWidth="1.2" />
          <rect x="14" y="14" width="4" height="4" fill={color} />
        </svg>
      );

    case 'router':
      // Parallel Signal Channels Converging
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
          <line x1="5" y1="8" x2="16" y2="16" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
          <line x1="5" y1="16" x2="16" y2="16" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
          <line x1="5" y1="24" x2="16" y2="16" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
          <line x1="16" y1="16" x2="27" y2="16" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="16" cy="16" r="2" fill={color} />
        </svg>
      );

    case 'waveform':
      // Continuous Harmonic Wave Stream
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
          <path
            d="M4 16C7 9 11 9 14 16C17 23 21 23 24 16L28 16"
            stroke={color}
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          <circle cx="9" cy="16" r="1.2" fill={color} />
          <circle cx="19" cy="16" r="1.2" fill={color} />
        </svg>
      );

    case 'lattice':
      // Sequential Connected Execution States
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
          <line x1="6" y1="16" x2="26" y2="16" stroke={color} strokeWidth="1.2" strokeDasharray="3 3" />
          <circle cx="8" cy="16" r="2.5" stroke={color} strokeWidth="1.2" fill={isActive ? color : 'none'} />
          <circle cx="16" cy="16" r="3" stroke={color} strokeWidth="1.4" fill={color} />
          <circle cx="24" cy="16" r="2.5" stroke={color} strokeWidth="1.2" fill={isActive ? color : 'none'} />
        </svg>
      );

    case 'security':
      // Constrained Geometric Boundary / Security Lattice
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
          <path d="M16 4L26 8.5V17.5L16 28L6 17.5V8.5L16 4Z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
          <circle cx="16" cy="16" r="2" fill={color} />
          <line x1="16" y1="10" x2="16" y2="14" stroke={color} strokeWidth="1" strokeLinecap="round" />
        </svg>
      );

    case 'creation':
      // Expanding Generative Aperture
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
          <path d="M16 4L20 12L28 16L20 20L16 28L12 20L4 16L12 12L16 4Z" stroke={color} strokeWidth="1.2" strokeLinejoin="round" />
          <circle cx="16" cy="16" r="2" fill={color} />
        </svg>
      );

    case 'spectral':
    case 'aperture':
    default:
      // Concentric Ocular Observation Diamond
      return (
        <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className}>
          <rect x="16" y="5" width="15" height="15" transform="rotate(45 16 5)" stroke={color} strokeWidth="1.1" />
          <circle cx="16" cy="16" r="4.5" stroke={color} strokeWidth="1.2" />
          <circle cx="16" cy="16" r="1.5" fill={color} />
        </svg>
      );
  }
};
