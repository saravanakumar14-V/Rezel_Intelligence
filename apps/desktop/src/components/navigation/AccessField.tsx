import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Compass } from 'lucide-react';
import { accessFieldBus } from './accessFieldState';
import { WorkflowRuntime } from '../../lib/ai/WorkflowRuntime';
import { ProviderRouter } from '../../lib/ai/providers/ProviderRouter';
import { RezelDirector, type DirectorEvent } from '../../lib/director/RezelDirector';
import {
  CAPABILITY_REGISTRY,
  validateCapabilityRegistry,
  type CapabilityDefinition,
} from '../../lib/navigation/CapabilityRegistry';
import {
  getSpatialSurface,
  validateSpatialSurfaceRegistry,
  type SpatialSurfaceDefinition,
  type SpatialSurfaceNode,
} from '../../lib/navigation/SpatialSurfaceRegistry';
import { MiniQuantumCore } from './MiniQuantumCore';
import { SurfaceStack } from './SurfaceStack';
import { cn } from '../../lib/cn';
import styles from './AccessField.module.css';

export interface AccessFieldProps {
  className?: string;
}

export type InteractionContext = 'home' | 'transitioning' | 'cognitive-field' | 'surface-active';

function getCoreAuraClass(capId: string | null): string {
  switch (capId) {
    case 'create':
      return styles.auraCreate;
    case 'converse':
      return styles.auraConverse;
    case 'automate':
      return styles.auraAutomate;
    case 'analyze':
      return styles.auraAnalyze;
    case 'inspect':
      return styles.auraInspect;
    case 'control':
      return styles.auraControl;
    default:
      return styles.auraIdle;
  }
}

// Helper: build full ancestral lineage from spatial registry
function buildSurfaceLineage(targetSurfaceId: string): SpatialSurfaceNode[] {
  const chain: SpatialSurfaceDefinition[] = [];
  let currentId: string | null = targetSurfaceId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const def = getSpatialSurface(currentId);
    if (!def) break;
    chain.unshift(def);
    currentId = def.parentId;
  }
  return chain.map((definition, idx) => ({
    id: definition.id,
    parentId: definition.parentId,
    capabilityId: definition.capabilityId,
    routeId: definition.id,
    depth: definition.depth || idx + 1,
    definition,
  }));
}

export default function AccessField({ className }: AccessFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [interactionContext, setInteractionContext] = useState<InteractionContext>('home');
  const [isTransitionActive, setIsTransitionActive] = useState(false);
  const [focusedCapId, setFocusedCapId] = useState<string | null>(null);

  // Spawned Surface Lineage Stack: [Level 1, Level 2, Level 3...]
  const [activeLineage, setActiveLineage] = useState<SpatialSurfaceNode[]>([]);
  // Memory of previous surface lineage per capability for context preservation
  const lineageMemoryRef = useRef<Map<string, SpatialSurfaceNode[]>>(new Map());

  // First-Use Contextual Discovery Hint
  const [hasInteracted, setHasInteracted] = useState(false);

  // Live Runtime States (Semantic Weather)
  const [activeWorkflowCount, setActiveWorkflowCount] = useState(0);
  const [activeApp, setActiveApp] = useState<string | null>(null);
  const [routingProfile, setRoutingProfile] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const hoverHysteresisTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Validate capability & spatial surface registries on mount
  useEffect(() => {
    validateCapabilityRegistry();
    const result = validateSpatialSurfaceRegistry();
    if (!result.valid) {
      console.warn('Unresolved surface targets detected:', result.unresolvedTargets);
    }
  }, []);

  // Spawn or extend a surface in the horizontal lineage
  const handleSpawnSurface = useCallback((targetSurfaceId: string) => {
    setHasInteracted(true);
    const def = getSpatialSurface(targetSurfaceId);
    if (!def) {
      console.warn(`Surface definition not found for: ${targetSurfaceId}`);
      return;
    }

    // Build the canonical ancestral lineage for the target surface
    const targetLineage = buildSurfaceLineage(targetSurfaceId);
    if (targetLineage.length > 0) {
      setActiveLineage(targetLineage);
      lineageMemoryRef.current.set(targetLineage[0].capabilityId, targetLineage);
      setInteractionContext('surface-active');
    }
  }, []);

  // Canonical Open Action: resets stale states and triggers cinematic transition
  const openCognitiveField = useCallback((targetSurfaceId?: string) => {
    setFocusedCapId(null);
    setInteractionContext('transitioning');
    setIsTransitionActive(true);

    if (transitionTimer.current) clearTimeout(transitionTimer.current);
    transitionTimer.current = setTimeout(() => {
      setInteractionContext(targetSurfaceId ? 'surface-active' : 'cognitive-field');
    }, 400);
  }, []);

  // Canonical Close Action: cleanly unmounts and restores HomeScreen interaction
  const closeCognitiveField = useCallback(() => {
    setFocusedCapId(null);
    setActiveLineage([]);
    setIsTransitionActive(false);
    setInteractionContext('home');
  }, []);

  // Subscribe to AccessField bus & enforce strict lifecycle with target surface routing
  useEffect(() => {
    const unsub = accessFieldBus.subscribe((open, targetSurfaceId) => {
      setIsOpen(open);
      if (open) {
        openCognitiveField(targetSurfaceId);
        if (targetSurfaceId) {
          handleSpawnSurface(targetSurfaceId);
        }
      } else {
        closeCognitiveField();
      }
    });
    return () => {
      unsub();
      if (transitionTimer.current) clearTimeout(transitionTimer.current);
    };
  }, [openCognitiveField, closeCognitiveField, handleSpawnSurface]);

  // Subscribe to real runtime director events
  useEffect(() => {
    if (!isOpen) return;

    const wfs = WorkflowRuntime.listActive ? WorkflowRuntime.listActive() : [];
    setActiveWorkflowCount(wfs.length);

    const session = RezelDirector.getApplicationSessionManager().getForegroundSession();
    if (session?.connectionStatus === 'CONNECTED') {
      setActiveApp(session.appId);
    } else {
      setActiveApp(null);
    }

    const profile = ProviderRouter.getRoutingProfile ? ProviderRouter.getRoutingProfile() : null;
    setRoutingProfile(profile);

    const handler = (event: DirectorEvent) => {
      if (event.type === 'workflow_started' || event.type === 'reasoning_workflow_completed') {
        const active = WorkflowRuntime.listActive ? WorkflowRuntime.listActive() : [];
        setActiveWorkflowCount(active.length);
      }
      if (event.type === 'application_changed') {
        const app =
          event.payload?.session?.appId ||
          event.payload?.activeApplication?.appId ||
          (typeof event.payload === 'string' ? event.payload : null);
        setActiveApp(app);
      }
    };

    RezelDirector.subscribe(handler);
    return () => RezelDirector.unsubscribe(handler);
  }, [isOpen]);

  const activeCapabilityId = useMemo<string | null>(() => {
    if (activeLineage.length > 0) {
      return activeLineage[0].capabilityId;
    }
    return focusedCapId;
  }, [activeLineage, focusedCapId]);

  const activeCapability = useMemo<CapabilityDefinition | null>(() => {
    if (!activeCapabilityId) return null;
    return CAPABILITY_REGISTRY.find((c) => c.id === activeCapabilityId) || null;
  }, [activeCapabilityId]);

  // Close surface at index (pops this surface and all downstream surfaces)
  const handleCloseSurface = useCallback((index: number) => {
    setActiveLineage((prev) => {
      const next = prev.slice(0, index);
      if (next.length === 0) {
        setInteractionContext('cognitive-field');
      } else {
        lineageMemoryRef.current.set(next[0].capabilityId, next);
      }
      return next;
    });
  }, []);

  // Focus surface (brings to active attention, trimming downstream if any)
  const handleFocusSurface = useCallback((index: number) => {
    setActiveLineage((prev) => {
      if (index < prev.length - 1) {
        const next = prev.slice(0, index + 1);
        if (next.length > 0) {
          lineageMemoryRef.current.set(next[0].capabilityId, next);
        }
        return next;
      }
      return prev;
    });
  }, []);

  // Return to Cognitive Field Root
  const handleReturnToRoot = useCallback(() => {
    setHasInteracted(true);
    setActiveLineage([]);
    setFocusedCapId(null);
    setInteractionContext('cognitive-field');
  }, []);

  // Focus persistence hysteresis
  const handlePointerEnterCap = useCallback((capId: string) => {
    if (hoverHysteresisTimer.current) {
      clearTimeout(hoverHysteresisTimer.current);
      hoverHysteresisTimer.current = null;
    }
    setFocusedCapId(capId);
  }, []);

  const handlePointerLeaveCap = useCallback(() => {
    if (activeLineage.length > 0) return; // Don't decay if surface active
    hoverHysteresisTimer.current = setTimeout(() => {
      setFocusedCapId(null);
    }, 200);
  }, [activeLineage.length]);

  // Strict Keyboard Routing: Multi-Tier Escape Retreat & Direct Jumps
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Global shortcut Alt+A always toggles Cognitive Field
      if (e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        e.stopPropagation();
        accessFieldBus.toggle();
        return;
      }

      // If R7 is closed, DO NOT intercept any other keys!
      if (!isOpen) return;

      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') {
        return;
      }

      // Stop event from leaking to HomeScreen camera or orbit controls while R7 is open
      e.stopPropagation();

      // Multi-Tier Escape Retreat:
      // Level 3 Surface -> Level 2 Surface
      // Level 2 Surface -> Level 1 Surface
      // Level 1 Surface -> Cognitive Field Root
      // Cognitive Field Root -> HomeScreen
      if (e.key === 'Escape') {
        e.preventDefault();
        if (activeLineage.length > 0) {
          handleCloseSurface(activeLineage.length - 1);
        } else if (focusedCapId !== null) {
          setFocusedCapId(null);
        } else {
          accessFieldBus.close();
        }
        return;
      }

      // Direct Key Jump 1-6
      if (['1', '2', '3', '4', '5', '6'].includes(e.key)) {
        const num = parseInt(e.key, 10);
        // If at root or jumping capability:
        if (activeLineage.length === 0) {
          const match = CAPABILITY_REGISTRY.find((c) => c.keyNum === num);
          if (match) {
            e.preventDefault();
            handleSpawnSurface(match.id);
            return;
          }
        } else {
          // Inside a surface: execute action index of current top surface
          const topSurface = activeLineage[activeLineage.length - 1];
          const actions = topSurface.definition.actions;
          if (actions && actions[num - 1]) {
            e.preventDefault();
            handleSpawnSurface(actions[num - 1].targetSurfaceId);
            return;
          }
        }
      }

      // In Cognitive Field Root: 2D Spatial Arrow Gravity
      if (activeLineage.length === 0 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        if (focusedCapId === null) {
          if (e.key === 'ArrowUp') setFocusedCapId('create');
          else if (e.key === 'ArrowRight') setFocusedCapId('analyze');
          else if (e.key === 'ArrowDown') setFocusedCapId('control');
          else if (e.key === 'ArrowLeft') setFocusedCapId('automate');
        } else {
          switch (focusedCapId) {
            case 'create':
              if (e.key === 'ArrowDown') setFocusedCapId('control');
              else if (e.key === 'ArrowLeft') setFocusedCapId('automate');
              else if (e.key === 'ArrowRight') setFocusedCapId('analyze');
              break;
            case 'analyze':
              if (e.key === 'ArrowDown') setFocusedCapId('converse');
              else if (e.key === 'ArrowLeft') setFocusedCapId('create');
              break;
            case 'converse':
              if (e.key === 'ArrowUp') setFocusedCapId('analyze');
              else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') setFocusedCapId('control');
              break;
            case 'control':
              if (e.key === 'ArrowUp') setFocusedCapId('create');
              else if (e.key === 'ArrowRight') setFocusedCapId('converse');
              else if (e.key === 'ArrowLeft') setFocusedCapId('inspect');
              break;
            case 'inspect':
              if (e.key === 'ArrowUp') setFocusedCapId('automate');
              else if (e.key === 'ArrowRight') setFocusedCapId('control');
              break;
            case 'automate':
              if (e.key === 'ArrowUp') setFocusedCapId('create');
              else if (e.key === 'ArrowRight') setFocusedCapId('analyze');
              else if (e.key === 'ArrowDown') setFocusedCapId('inspect');
              break;
          }
        }
        return;
      }

      // Enter in Cognitive Field: Spawn focused capability
      if (activeLineage.length === 0 && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        if (focusedCapId) {
          handleSpawnSurface(focusedCapId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [isOpen, activeLineage, focusedCapId, handleSpawnSurface, handleCloseSurface]);

  // Compute live breadcrumb trail
  const breadcrumbTrail = useMemo(() => {
    if (activeLineage.length === 0) {
      return focusedCapId ? `REZEL // ${focusedCapId.toUpperCase()}` : 'REZEL // COGNITIVE FIELD';
    }
    const parts = ['REZEL', activeLineage[0].definition.humanLabel.toUpperCase()];
    for (let i = 1; i < activeLineage.length; i++) {
      parts.push(activeLineage[i].definition.humanLabel.toUpperCase());
    }
    return parts.join('  /  ');
  }, [activeLineage, focusedCapId]);

  return (
    <>
      {/* ── Environment Trigger Button (Isolated Hit Target) ── */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          accessFieldBus.toggle();
        }}
        className="fixed top-3.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#040C24]/90 border border-cyan-500/40 hover:border-[#00E5FF] text-cyan-300 hover:text-[#00E5FF] backdrop-blur-md transition-all duration-300 cursor-pointer shadow-lg group select-none pointer-events-auto"
        title="Cognitive Field (Alt+A)"
        aria-label="Toggle Cognitive Field"
      >
        <Compass
          size={14}
          className="transition-transform duration-500 group-hover:rotate-45 text-[#00E5FF]"
        />
        <span className="font-mono text-[10px] tracking-[0.24em] font-bold uppercase">
          {isOpen ? 'CLOSE FIELD' : 'COGNITIVE FIELD'}
        </span>
      </button>

      {/* ── REZEL R7 Cognitive Field Overlay (Spawned Spatial Surfaces Layer) ── */}
      {isOpen && (
        <div
          ref={containerRef}
          data-interaction-context={interactionContext}
          className={cn(
            styles.cognitiveFieldOverlay,
            styles.cognitiveFieldActive,
            activeLineage.length > 0 && styles.cognitiveFieldSurfaceActive,
            className
          )}
          role="dialog"
          aria-modal="true"
          aria-label="Rezel Cognitive Field"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Phase 2: Staged Spatial Pulse Wave */}
          <div
            className={cn(
              styles.spatialPulseWave,
              isTransitionActive && styles.spatialPulseWaveActive
            )}
            aria-hidden="true"
          />

          {/* Layer 1 & 2: QuantumCore Atmospheric Resonance Aura */}
          <div
            className={cn(
              styles.coreAtmosphericAura,
              getCoreAuraClass(activeCapabilityId)
            )}
            aria-hidden="true"
          />

          {/* Fluid Atmospheric Canvas (Magnetic Streamlines & Semantic Weather) */}
          <svg
            className={styles.fluidAtmosphereCanvas}
            viewBox="-400 -400 800 800"
            aria-hidden="true"
          >
            {CAPABILITY_REGISTRY.map((c) => {
              const isTarget = activeCapabilityId === c.id;
              return (
                <line
                  key={`stream-${c.id}`}
                  x1="0"
                  y1="0"
                  x2={c.coords.x}
                  y2={c.coords.y}
                  className={isTarget ? styles.activeStreamResonance : styles.atmosphericStream}
                />
              );
            })}

            {/* Semantic Weather: Directional Workflow Execution Current */}
            {activeWorkflowCount > 0 && (
              <path
                d="M -270 -120 Q -100 -50 0 0"
                className={styles.directionalExecutionCurrent}
              />
            )}
          </svg>

          {/* Minimalist Top Spatial Header & Breadcrumb Trail */}
          <header className={styles.fieldHeader}>
            <div className={styles.fieldTitleGroup}>
              <span className={styles.fieldBreathDot} aria-hidden="true" />
              <span className={styles.fieldTitle}>
                {breadcrumbTrail}
              </span>
              <span className={styles.fieldSubtext}>
                {activeLineage.length > 0
                  ? `[${activeLineage[activeLineage.length - 1].definition.technicalIdentity} · ESC TO RETREAT]`
                  : focusedCapId
                  ? `[ATTENTION: ${activeCapability?.title} · ${activeCapability?.stateSummary}]`
                  : '[SPATIAL ORIGIN NOMINAL · SELECT CAPABILITY OBJECT]'}
              </span>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                accessFieldBus.close();
              }}
              className={styles.dismissButton}
              title="Decompress & Close (Esc)"
              aria-label="Close Field"
            >
              DISMISS (ESC)
            </button>
          </header>

          {/* ── THE COGNITIVE FIELD CANVAS (Permanent Spatial Anchor) ── */}
          <main
            className={cn(
              styles.cognitiveFieldCanvas,
              activeLineage.length > 0 && styles.cognitiveFieldCanvasQuieted
            )}
            role="menubar"
            aria-label="Primary Capability Objects"
          >
            {/* Central Navigation QuantumCore 2.0 Origin */}
            <MiniQuantumCore
              focusedCapId={focusedCapId}
              activeCapabilityId={activeCapabilityId}
              surfaceCount={activeLineage.length}
              onClick={handleReturnToRoot}
            />

            {/* First-Use Contextual Discovery Hint (Clean subtle reveal) */}
            {!hasInteracted && activeLineage.length === 0 && (
              <div className={styles.firstUseHintBox} aria-hidden="true">
                <span className={styles.firstUseHintTitle}>Explore Rezel</span>
                <span className={styles.firstUseHintSub}>Select a capability to begin</span>
              </div>
            )}

            {/* 6 Primary Capability Objects with Freestyle Spatial Composition */}
            {CAPABILITY_REGISTRY.map((cap, idx) => {
              const isSelected = activeLineage.length > 0 && activeLineage[0].capabilityId === cap.id;
              const isFocused = focusedCapId === cap.id || isSelected;
              const isAnyActive = activeLineage.length > 0 || focusedCapId !== null;
              const staggerClass = (styles as Record<string, string>)[`stagger${idx}`];

              return (
                <div
                  key={cap.id}
                  style={
                    {
                      left: `calc(50% + ${cap.coords.x}px)`,
                      top: `calc(50% + ${cap.coords.y}px)`,
                      '--cap-primary': cap.primaryColor,
                      '--cap-secondary': cap.secondaryColor,
                      '--cap-glow': cap.glowColor,
                    } as React.CSSProperties
                  }
                  className={cn(
                    styles.capabilityControlObject,
                    staggerClass,
                    isFocused && styles.capabilityControlObjectFocused,
                    isSelected && styles.capabilityControlObjectActiveLineage,
                    isAnyActive && !isFocused && styles.capabilityControlObjectDimmed
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSpawnSurface(cap.id);
                  }}
                  onMouseEnter={() => handlePointerEnterCap(cap.id)}
                  onMouseLeave={handlePointerLeaveCap}
                  role="menuitem"
                  tabIndex={0}
                  aria-label={`${cap.title} Capability Object`}
                >
                  {/* High-Fidelity 3D Hero Visual Asset */}
                  <div className={styles.heroVisualContainer}>
                    <img
                      src={cap.imageAsset}
                      alt={cap.title}
                      className={styles.heroVisualImg}
                    />
                  </div>

                  {/* 4-Level Disciplined Information Stack */}
                  <div className={styles.capabilityInfoStack}>
                    <span className={styles.capabilityTitle}>{cap.title}</span>
                    <span className={styles.capabilityIdentity}>{cap.stateSummary}</span>
                    <span className={styles.capabilityState}>
                      <span
                        className={cn(
                          styles.statePip,
                          isSelected && styles.statePipActive
                        )}
                        aria-hidden="true"
                      />
                      {isSelected ? 'ACTIVE' : 'AVAILABLE'}
                    </span>
                  </div>
                </div>
              );
            })}
          </main>

          {/* ── SPAWNED SPATIAL SURFACE STACK (Horizontal Lineage Expansion) ── */}
          {activeLineage.length > 0 && (
            <SurfaceStack
              activeLineage={activeLineage}
              onSelectAction={handleSpawnSurface}
              onCloseSurface={handleCloseSurface}
              onFocusSurface={handleFocusSurface}
            />
          )}

          {/* Minimalist Bottom Spatial Footer */}
          <footer className={styles.fieldFooter}>
            <span className={styles.fieldStatusIndicator}>
              {activeWorkflowCount > 0
                ? `● WEATHER: ${activeWorkflowCount} ACTIVE EXECUTION CURRENTS`
                : activeApp
                ? `● BRIDGE: ${activeApp.toUpperCase()} CONNECTED`
                : routingProfile
                ? `● ROUTING PROFILE: ${routingProfile}`
                : 'QUANTUM SPATIAL CONTINUITY // ALL INSTRUMENTS NOMINAL'}
            </span>

            <span className={styles.fieldHotkeyHints}>
              {activeLineage.length > 0
                ? '[1-4] SELECT ACTION · [ESC] RETREAT · [CORE] RETURN TO FIELD ROOT'
                : '[1-6] JUMP · [ARROWS] GRAVITY · [CLICK/ENTER] SPAWN SPATIAL SURFACE'}
            </span>
          </footer>
        </div>
      )}
    </>
  );
}
