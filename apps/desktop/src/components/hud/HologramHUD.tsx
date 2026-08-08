import { useEffect, useState } from "react";
import { useSystemMetrics } from "../../hooks/useSystemMetrics";
import StatusPanel from "./StatusPanel";
import CommandOrb from "./CommandOrb";
import ModeNav from "./ModeNav";
import type { OrbState } from "./CommandOrb";
import type { AppMode } from "./ModeNav";

/**
 * REZEL_VERSION
 *
 * Displayed in the top HUD bar. Update on each release.
 */
const REZEL_VERSION = "v0.1.0-dev";

/**
 * HUD_MOUNT_DELAY_MS
 *
 * Short delay before the HUD fades in after HomeScreen mounts.
 * Lets the 3D scene settle before overlaying UI chrome.
 */
const HUD_MOUNT_DELAY_MS = 600;

interface HologramHUDProps {
  orbState?: OrbState;
  onOrbClick?: () => void;
  mode?: AppMode;
  onModeChange?: (mode: AppMode) => void;
}

/**
 * HologramHUD
 *
 * The primary UI overlay that sits above the 3D SpaceScene canvas.
 * Layout (absolute-positioned, pointer-events-none by default):
 *
 *   ┌─ Top bar ─────────────────────────────────────┐
 *   │  [REZEL]    ············    [timestamp]        │
 *   ├───────────────────────────────────────────────┤
 *   │                                               │
 *   │  StatusPanel (left)          (right reserved) │
 *   │                                               │
 *   │              CommandOrb (bottom centre)       │
 *   └───────────────────────────────────────────────┘
 *
 * All panels use glassmorphic styling consistent with the Rezel design system:
 *  - backdrop-blur-md
 *  - border border-white/10
 *  - deep-space gradient background
 *  - cyan (#00E5FF) accent colour
 *
 * Performance:
 *  - Single useSystemMetrics call at this level; passed down as props
 *  - Mount fade uses CSS opacity transition (no JS animation library needed)
 *  - pointer-events-none on the wrapper prevents canvas mouse capture loss
 */
export default function HologramHUD({ orbState = "idle", onOrbClick, mode = "core", onModeChange }: HologramHUDProps) {
  const metrics = useSystemMetrics();
  const [visible, setVisible] = useState(false);
  const [timeStr, setTimeStr] = useState("");

  // Fade-in delay
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), HUD_MOUNT_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Live clock — updates every second
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="absolute inset-0 pointer-events-none select-none"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 1.2s ease",
        zIndex: 10,
      }}
      aria-hidden="true"
    >
      {/* ── Top HUD bar ─────────────────────────────────────── */}
      <div className="absolute top-0 left-0 right-0 flex items-center px-6 py-3">
        {/* Left — brand */}
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-pulse" />
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "11px",
              letterSpacing: "0.25em",
              color: "#00E5FF",
            }}
            className="uppercase opacity-80"
          >
            REZEL
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "9px",
              color: "#4BB8F0",
            }}
            className="opacity-50"
          >
            {REZEL_VERSION}
          </span>
        </div>

        {/* Centre — mode navigation */}
        <div className="flex-1 flex justify-center items-center">
          {onModeChange && (
            <ModeNav mode={mode} onModeChange={onModeChange} />
          )}
        </div>

        {/* Right — timestamp */}
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: "11px",
            color: "#7ECFFF",
            letterSpacing: "0.12em",
          }}
          className="opacity-60 tabular-nums"
        >
          {timeStr}
        </span>
      </div>

      {/* Top-left hairline border */}
      <div
        className="absolute top-[40px] left-6 right-6 h-px opacity-20"
        style={{ background: "linear-gradient(90deg, #00E5FF, transparent 60%)" }}
        aria-hidden
      />

      {/* ── Left panel — telemetry ─────────────────────────── */}
      <div className="absolute top-[60px] left-6">
        <StatusPanel metrics={metrics} />
      </div>

      {/* ── Bottom-centre — CommandOrb ─────────────────────── */}
      <div className="absolute bottom-8 left-0 right-0 flex justify-center">
        <CommandOrb state={orbState} onClick={onOrbClick} />
      </div>

      {/* Bottom hairline border */}
      <div
        className="absolute bottom-0 left-6 right-6 h-px opacity-10"
        style={{ background: "linear-gradient(90deg, transparent, #00E5FF 50%, transparent)" }}
        aria-hidden
      />
    </div>
  );
}
