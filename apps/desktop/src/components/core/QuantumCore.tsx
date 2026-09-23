import { useRef, useEffect, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import QuantumNucleus from "./QuantumNucleus";
import ComputationLattice from "./ComputationLattice";
import RefractiveHousing from "./RefractiveHousing";
import QuantumWaveguides from "./QuantumWaveguides";
import OrbitParticles from "./OrbitParticles";
import CoreLight from "./CoreLight";
import {
  type CoreVisualState,
  type SpectralLayerColors,
  getSpectralPalette,
  createInterpolatedSpectralState,
  lerpSpectralState,
  sampleAmbientIdleState,
} from "./coreSpectralTheme";
import { RezelDirector, type DirectorEvent } from "../../lib/director/RezelDirector";
import { NotificationIntelligenceCenter } from "../../lib/notifications/NotificationIntelligenceCenter";
import type { RezelNotificationEvent } from "../../lib/notifications/types";
import { useHardware } from "../../providers/HardwareProvider";

export { type CoreVisualState } from "./coreSpectralTheme";

/**
 * QuantumCore
 *
 * Master orchestrator of the REZEL Core's multi-layered spectral visual identity.
 *
 * Architecture (Outer → Inner):
 * 1. Multi-Spectral Orbital Particle Field (Stardust & Energy Sparks)
 * 2. Harmonic Energy Waveguides (3-Plane Anisotropic Rings: Cyan, Violet, Azure)
 * 3. Refractive Crystal Housing (PBR Confinement Vessel with Fresnel Rim)
 * 4. Neural Tensor Computation Lattice (Counter-rotating Geodesic Wireframes)
 * 5. Quantum Nucleus (Solid 24K Quantum Gold Jewel + Diamond White Singularity)
 *
 * Ambient Idle Dual-State Energy Cycle:
 *  - GOLDEN QUANTUM STATE (0s-4s) <-> COOL QUANTUM STATE (5s-9s)
 *  - Real operational states (EXECUTING, THINKING, ERROR, ATTENTION, etc.) take strict priority.
 */
export default function QuantumCore() {
  const groupRef = useRef<THREE.Group>(null!);
  const { quality } = useHardware();
  const { pointer } = useThree();

  const [coreState, setCoreState] = useState<CoreVisualState>('IDLE');
  const targetSpectralRef = useRef<SpectralLayerColors>(getSpectralPalette('IDLE'));
  const currentSpectralRef = useRef<SpectralLayerColors>(createInterpolatedSpectralState());
  const idleTimerRef = useRef<number>(0);

  // State Subscriptions & Priority Lifecycle
  useEffect(() => {
    const dirHandler = (event: DirectorEvent) => {
      if (event.type === 'status_change' && event.payload?.status) {
        const s = event.payload.status;
        if (s === 'idle') setCoreState('IDLE');
        else if (s === 'listening') setCoreState('LISTENING');
        else if (s === 'thinking' || s === 'streaming') setCoreState('THINKING');
        else if (s === 'tool_executing') setCoreState('EXECUTING');
        else if (s === 'error') setCoreState('ERROR');
      }
      if (event.type === 'workflow_started') setCoreState('EXECUTING');
      if (event.type === 'reasoning_workflow_completed') {
        setCoreState('SUCCESS');
        setTimeout(() => setCoreState('IDLE'), 3500);
      }
      if (event.type === 'reasoning_error') setCoreState('ERROR');
    };

    const notifHandler = (events: RezelNotificationEvent[]) => {
      const latest = events[events.length - 1];
      if (!latest) return;

      if (latest.severity === 'ATTENTION' || latest.severity === 'WARNING') {
        setCoreState('ATTENTION');
        setTimeout(() => setCoreState('IDLE'), 4000);
      } else if (latest.severity === 'RECOVERY') {
        setCoreState('RECOVERY');
        setTimeout(() => setCoreState('IDLE'), 3500);
      } else if (latest.severity === 'CRITICAL' || latest.severity === 'ERROR') {
        setCoreState('ERROR');
        setTimeout(() => setCoreState('IDLE'), 4000);
      }
    };

    RezelDirector.subscribe(dirHandler);
    const unsubNotif = NotificationIntelligenceCenter.subscribe(notifHandler);

    return () => {
      RezelDirector.unsubscribe(dirHandler);
      unsubNotif();
    };
  }, []);

  // Update target palette immediately when operational state changes
  useEffect(() => {
    if (coreState !== 'IDLE') {
      targetSpectralRef.current = getSpectralPalette(coreState);
    }
  }, [coreState]);

  useFrame((_, delta) => {
    // 1. Dual-State Ambient Energy Cycle (IDLE only) vs Real Operational Priority
    if (coreState === 'IDLE') {
      idleTimerRef.current += delta;
      sampleAmbientIdleState(targetSpectralRef.current, idleTimerRef.current);
    }

    // 2. Smooth cinematic multi-layer spectral interpolation
    lerpSpectralState(currentSpectralRef.current, targetSpectralRef.current, Math.min(1.0, delta * 3.8));

    // 3. Subtle pointer parallax tilt for organic depth
    if (groupRef.current) {
      const targetRotX = -pointer.y * 0.16;
      const targetRotY = pointer.x * 0.22;
      groupRef.current.rotation.x += (targetRotX - groupRef.current.rotation.x) * 0.06;
      groupRef.current.rotation.y += (targetRotY - groupRef.current.rotation.y) * 0.06;
    }
  });

  const colors = currentSpectralRef.current;

  return (
    <>
      {/* Dynamic Spectral Lighting */}
      <CoreLight colors={colors} />

      <group ref={groupRef}>
        {/* Layer 5: Multi-Spectral Orbital Particle Field */}
        {quality !== 'LOW' && (
          <OrbitParticles
            count={quality === 'MED' ? 240 : 500}
            radius={2.8}
            speed={coreState === 'EXECUTING' ? 0.16 : 0.07}
            colors={colors}
          />
        )}

        {/* Layer 4: Precision Harmonic Energy Waveguides (3 Distinct Spectral Rings) */}
        <QuantumWaveguides
          colors={colors}
        />

        {/* Layer 3: Refractive Crystal Confinement Vessel */}
        <RefractiveHousing
          colors={colors}
        />

        {/* Layer 2: Neural Tensor Computation Lattice (Inner Violet & Outer Matrix) */}
        <ComputationLattice
          colors={colors}
        />

        {/* Layer 1: Inner Quantum Nucleus & Diamond White Singularity */}
        <QuantumNucleus
          colors={colors}
        />
      </group>
    </>
  );
}
