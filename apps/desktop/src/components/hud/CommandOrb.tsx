import { useMemo } from "react";
import { cn } from "../../lib/cn";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

interface CommandOrbProps {
  state?: OrbState;
  className?: string;
}

/**
 * STATE_CONFIG
 *
 * Defines visual parameters for each voice-engine state.
 * Colours, ring opacity, and animation timing vary per state so the
 * orb communicates its mode at a glance.
 */
const STATE_CONFIG: Record<
  OrbState,
  { label: string; core: string; ring: string; pulse: string; bpm: number }
> = {
  idle: {
    label: "STANDBY",
    core: "#00BFFF",
    ring: "rgba(0,200,255,0.15)",
    pulse: "rgba(0,200,255,0.06)",
    bpm: 3,
  },
  listening: {
    label: "LISTENING",
    core: "#00FF90",
    ring: "rgba(0,255,144,0.25)",
    pulse: "rgba(0,255,144,0.10)",
    bpm: 1.2,
  },
  thinking: {
    label: "PROCESSING",
    core: "#A880FF",
    ring: "rgba(168,128,255,0.25)",
    pulse: "rgba(168,128,255,0.10)",
    bpm: 0.8,
  },
  speaking: {
    label: "SPEAKING",
    core: "#FF9F1C",
    ring: "rgba(255,159,28,0.25)",
    pulse: "rgba(255,159,28,0.10)",
    bpm: 1.8,
  },
};

/**
 * CommandOrb
 *
 * A concentric-ring voice-state indicator placed at the bottom centre of
 * the HomeScreen HUD overlay. Three rings animate at staggered delays so the
 * orb always appears to be "breathing". The inner core colour changes per state.
 *
 * All animation is pure CSS keyframes (no JS RAF overhead).
 * Stage 6 will wire `state` to the useVoice hook.
 */
export default function CommandOrb({ state = "idle", className }: CommandOrbProps) {
  const cfg = STATE_CONFIG[state];

  // Unique animation duration per state derived from BPM
  const pulseDuration = useMemo(
    () => `${(60 / cfg.bpm).toFixed(1)}s`,
    [cfg.bpm]
  );

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {/* Rings stack — 3 concentric pulse rings */}
      <div className="relative flex items-center justify-center" style={{ width: 88, height: 88 }}>
        {/* Outer pulse ring */}
        <div
          className="absolute rounded-full"
          style={{
            width: 88,
            height: 88,
            border: `1px solid ${cfg.ring}`,
            background: cfg.pulse,
            animation: `rezel-orb-pulse ${pulseDuration} ease-in-out infinite`,
            animationDelay: "0s",
          }}
          aria-hidden
        />
        {/* Mid ring */}
        <div
          className="absolute rounded-full"
          style={{
            width: 64,
            height: 64,
            border: `1px solid ${cfg.ring}`,
            background: cfg.pulse,
            animation: `rezel-orb-pulse ${pulseDuration} ease-in-out infinite`,
            animationDelay: "-0.4s",
            opacity: 0.85,
          }}
          aria-hidden
        />
        {/* Inner ring */}
        <div
          className="absolute rounded-full"
          style={{
            width: 44,
            height: 44,
            border: `1px solid ${cfg.ring}`,
            background: cfg.pulse,
            animation: `rezel-orb-pulse ${pulseDuration} ease-in-out infinite`,
            animationDelay: "-0.8s",
            opacity: 0.7,
          }}
          aria-hidden
        />

        {/* Core orb */}
        <div
          className="relative rounded-full z-10"
          style={{
            width: 28,
            height: 28,
            background: `radial-gradient(circle at 35% 35%, #fff 0%, ${cfg.core} 50%, transparent 100%)`,
            boxShadow: `0 0 12px ${cfg.core}, 0 0 28px ${cfg.ring}, 0 0 48px ${cfg.pulse}`,
            transition: "background 0.6s ease, box-shadow 0.6s ease",
          }}
        />

        {/* Corner accent lines (top-left / bottom-right) */}
        <div
          className="absolute top-0 left-0 w-4 h-4 border-t border-l rounded-tl-full"
          style={{ borderColor: cfg.core, opacity: 0.5 }}
          aria-hidden
        />
        <div
          className="absolute bottom-0 right-0 w-4 h-4 border-b border-r rounded-br-full"
          style={{ borderColor: cfg.core, opacity: 0.5 }}
          aria-hidden
        />
      </div>

      {/* State label */}
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: "9px",
          letterSpacing: "0.2em",
          color: cfg.core,
          opacity: 0.7,
        }}
        className="uppercase"
      >
        {cfg.label}
      </span>
    </div>
  );
}
