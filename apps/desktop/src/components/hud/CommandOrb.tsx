import { cn } from "../../lib/cn";
import styles from "./CommandOrb.module.css";

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "interrupted";

export interface CommandOrbProps {
  state?: OrbState;
  onClick?: () => void;
  className?: string;
}

/**
 * STATE_CONFIG
 *
 * Defines human-readable telemetry labels for each voice-engine state.
 * Color, ring, glow, and motion behavior are defined in CommandOrb.module.css
 * using B1 Design Tokens (--rz-voice-*).
 */
export const STATE_CONFIG: Record<
  OrbState,
  { label: string; description: string }
> = {
  idle: {
    label: "STANDBY",
    description: "Voice assistant idle, waiting for activation keyword or command",
  },
  listening: {
    label: "LISTENING",
    description: "Microphone active, receiving speech stream",
  },
  thinking: {
    label: "PROCESSING",
    description: "Processing reasoning and plan generation",
  },
  speaking: {
    label: "SPEAKING",
    description: "Audio synthesis output active",
  },
  interrupted: {
    label: "INTERRUPTED",
    description: "Barge-in detected, synthesized speech cancelled",
  },
};

/**
 * CommandOrb
 *
 * Visual representation of Rezel Voice & Reasoning Engine state.
 * Implements Stitch DESIGN.md multi-layered visual hierarchy:
 * 1. Core orb with state-driven radial gradient
 * 2. Inner glow & pulse ring
 * 3. Primary ring
 * 4. Secondary ring / orbital activity
 * 5. Telemetry corner brackets
 * 6. Monospace state label
 *
 * Pure CSS animations via CommandOrb.module.css for zero JS render overhead.
 */
export default function CommandOrb({ state = "idle", onClick, className }: CommandOrbProps) {
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.idle;
  const stateClass = styles[`state-${state}`] || styles["state-idle"];
  const isInteractive = Boolean(onClick);

  return (
    <div
      className={cn(
        styles.container,
        stateClass,
        isInteractive ? styles.interactive : styles.nonInteractive,
        className
      )}
      onClick={onClick}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && onClick) {
          e.preventDefault();
          onClick();
        }
      }}
      role="button"
      tabIndex={isInteractive ? 0 : undefined}
      aria-label={`Voice status: ${cfg.label}`}
      aria-description={cfg.description}
    >
      {/* Visual rings stack */}
      <div className={styles.stack}>
        {/* Outer pulse ring */}
        <div className={styles.outerRing} aria-hidden="true" />
        {/* Mid ring */}
        <div className={styles.midRing} aria-hidden="true" />
        {/* Inner ring */}
        <div className={styles.innerRing} aria-hidden="true" />

        {/* Core glowing orb */}
        <div className={styles.core} aria-hidden="true" />

        {/* Telemetry corner brackets */}
        <div className={styles.bracketTopLeft} aria-hidden="true" />
        <div className={styles.bracketBottomRight} aria-hidden="true" />
      </div>

      {/* State monospace label */}
      <span className={styles.label}>
        {cfg.label}
      </span>
    </div>
  );
}
