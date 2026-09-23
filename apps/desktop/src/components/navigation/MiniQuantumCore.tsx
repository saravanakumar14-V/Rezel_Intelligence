import React, { useState, useEffect, useRef } from 'react';
import styles from './MiniQuantumCore.module.css';
import { cn } from '../../lib/cn';

export interface MiniQuantumCoreProps {
  focusedCapId: string | null;
  activeCapabilityId: string | null;
  surfaceCount?: number;
  onClick?: () => void;
  className?: string;
}

/**
 * REZEL NAVIGATION QUANTUMCORE 2.0 (Precision Instrument Refinement)
 * Compact multi-layer computational nucleus extracted from the master QuantumCore.
 *
 * Structure:
 *  - Restrained localized spectral halo
 *  - 3-plane anisotropic harmonic waveguides (with degree tick notches)
 *  - Dual refractive crystal shells (Fresnel refraction & specular light arc)
 *  - Counter-rotating polyhedral tensor lattice
 *  - 24K Gold Quantum Nucleus with Diamond-White Singularity (Primary luminous anchor)
 *  - 4 subtle orbital particle motes
 *  - Interactive mouse parallax & quiet background state when surfaces spawn
 */
export const MiniQuantumCore: React.FC<MiniQuantumCoreProps> = ({
  focusedCapId,
  activeCapabilityId,
  surfaceCount = 0,
  onClick,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [parallax, setParallax] = useState({ x: 0, y: 0 });

  const activeId = activeCapabilityId || focusedCapId;

  // Subtle pointer parallax across the nucleus layers (restrained to +/- 5px)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = (e.clientX - cx) / cx;
      const dy = (e.clientY - cy) / cy;
      setParallax({ x: dx * 5, y: dy * 5 });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  const getAccentClass = () => {
    switch (activeId) {
      case 'create':
        return styles.accentCreate;
      case 'converse':
        return styles.accentConverse;
      case 'automate':
        return styles.accentAutomate;
      case 'analyze':
        return styles.accentAnalyze;
      case 'inspect':
        return styles.accentInspect;
      case 'control':
        return styles.accentControl;
      default:
        return styles.accentIdle;
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        styles.miniCoreContainer,
        getAccentClass(),
        surfaceCount > 0 && styles.miniCoreQuieted,
        className
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      title="QuantumCore Origin (Click to return to Cognitive Field root)"
      aria-label="QuantumCore Navigation Origin"
    >
      {/* Restrained Volumetric Atmospheric Spectral Halo */}
      <div className={styles.coreAura} aria-hidden="true" />

      {/* Outer Precision Waveguide Ring with Degree Ticks */}
      <div
        className={cn(styles.waveguideRing, styles.ringOuter)}
        style={{
          transform: `translate(${parallax.x * 0.3}px, ${parallax.y * 0.3}px)`,
        }}
        aria-hidden="true"
      >
        <div className={styles.ringTicks}>
          <span className={styles.tick0} />
          <span className={styles.tick45} />
          <span className={styles.tick90} />
          <span className={styles.tick135} />
          <span className={styles.tick180} />
          <span className={styles.tick225} />
          <span className={styles.tick270} />
          <span className={styles.tick315} />
        </div>
      </div>

      {/* Polar Precession Waveguide Ring (Ring 2 - Anisotropic Tilted) */}
      <div
        className={cn(styles.waveguideRing, styles.ringPolar)}
        style={{
          transform: `translate(${parallax.x * 0.5}px, ${parallax.y * 0.5}px) rotateX(65deg) rotateY(25deg)`,
        }}
        aria-hidden="true"
      />

      {/* Asymmetric Transfer Waveguide Ring (Ring 3 - Counter Ellipse) */}
      <div
        className={cn(styles.waveguideRing, styles.ringAsym)}
        style={{
          transform: `translate(${parallax.x * 0.4}px, ${parallax.y * 0.4}px) rotateX(-50deg) rotateZ(45deg)`,
        }}
        aria-hidden="true"
      />

      {/* Counter-Rotating Polyhedral Tensor Lattice */}
      <div
        className={styles.tensorLattice}
        style={{
          transform: `translate(${parallax.x * 0.7}px, ${parallax.y * 0.7}px)`,
        }}
        aria-hidden="true"
      >
        <div className={styles.latticeInner}>
          <span className={styles.latticeNode1} />
          <span className={styles.latticeNode2} />
          <span className={styles.latticeNode3} />
          <span className={styles.latticeNode4} />
        </div>
        <div className={styles.latticeOuter}>
          <span className={styles.latticeNodeA} />
          <span className={styles.latticeNodeB} />
          <span className={styles.latticeNodeC} />
          <span className={styles.latticeNodeD} />
        </div>
      </div>

      {/* Dual Refractive Crystal Shell (Confinement Vessel & Specular Rim) */}
      <div
        className={styles.refractiveHousing}
        style={{
          transform: `translate(${parallax.x * 0.8}px, ${parallax.y * 0.8}px)`,
        }}
        aria-hidden="true"
      >
        <div className={styles.fresnelRim} />
        <div className={styles.specularLightArc} />

        {/* Central Quantum Nucleus (24K Gold Jewel + Diamond White Singularity) */}
        <div className={styles.quantumNucleus}>
          <div className={styles.nucleusInnerGlow} />
          <div className={styles.singularity} />
        </div>
      </div>

      {/* Restrained Orbital Particle Drift (4 subtle motes) */}
      <div className={styles.orbitalParticleField} aria-hidden="true">
        <span className={cn(styles.orbitSpark, styles.spark1)} />
        <span className={cn(styles.orbitSpark, styles.spark2)} />
        <span className={cn(styles.orbitSpark, styles.spark3)} />
        <span className={cn(styles.orbitSpark, styles.spark4)} />
      </div>

      {/* Origin Status Micro Tag */}
      <div className={styles.originMicroBadge}>
        <span>ORIGIN</span>
      </div>
    </div>
  );
};
