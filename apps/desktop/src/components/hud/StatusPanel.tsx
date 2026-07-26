import { useCallback } from "react";
import { cn } from "../../lib/cn";
import type { SystemMetrics } from "../../hooks/useSystemMetrics";

interface GaugeBarProps {
  label: string;
  value: number;   // 0–100
  unit?: string;
  color: string;   // tailwind / CSS colour token
  subtitle?: string;
}

/**
 * GaugeBar
 *
 * A single horizontal gauge row — label, animated fill bar, and live value.
 * The fill uses a clip-path width transition so the bar is smooth with no
 * layout thrashing. depthWrite-free overlay design matches the glassmorphic
 * HUD aesthetic.
 */
function GaugeBar({ label, value, unit = "%", color, subtitle }: GaugeBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className="flex flex-col gap-1">
      {/* Row header */}
      <div className="flex items-baseline justify-between">
        <span
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", letterSpacing: "0.12em" }}
          className="text-[#7ECFFF] uppercase opacity-70 tracking-widest"
        >
          {label}
        </span>
        <span
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px" }}
          className="text-white font-semibold tabular-nums"
        >
          {clamped.toFixed(1)}
          <span className="text-[10px] text-[#7ECFFF] opacity-70 ml-0.5">{unit}</span>
        </span>
      </div>

      {/* Subtitle — e.g. "4.3 GB / 16 GB" */}
      {subtitle && (
        <span
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px" }}
          className="text-[#4BB8F0] opacity-50 -mt-0.5"
        >
          {subtitle}
        </span>
      )}

      {/* Bar track */}
      <div className="relative h-[3px] w-full rounded-full bg-white/10 overflow-hidden">
        {/* Fill */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
          style={{ width: `${clamped}%`, background: color }}
        />
        {/* Shine shimmer */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.35) 50%, transparent 100%)",
            transform: "skewX(-20deg)",
          }}
        />
      </div>
    </div>
  );
}

interface StatusPanelProps {
  metrics: SystemMetrics | null;
  className?: string;
}

/**
 * StatusPanel
 *
 * Glassmorphic side panel displaying live CPU and RAM telemetry.
 * Receives `metrics` from the parent HologramHUD (single polling source).
 * Renders a skeleton state while the first Tauri response is in-flight.
 */
export default function StatusPanel({ metrics, className }: StatusPanelProps) {
  const formatBytes = useCallback((bytes: number) => {
    const gb = bytes / (1024 ** 3);
    return gb.toFixed(1);
  }, []);

  const ramPct = metrics
    ? (metrics.used_memory / metrics.total_memory) * 100
    : 0;

  const ramSubtitle = metrics
    ? `${formatBytes(metrics.used_memory)} GB / ${formatBytes(metrics.total_memory)} GB`
    : "— GB / — GB";

  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 px-4 py-4 rounded-xl",
        "backdrop-blur-md border border-white/10",
        className
      )}
      style={{
        background: "linear-gradient(135deg, rgba(0,30,60,0.65) 0%, rgba(0,10,30,0.75) 100%)",
        boxShadow: "0 0 24px rgba(0,200,255,0.08), inset 0 1px 0 rgba(255,255,255,0.06)",
        minWidth: "180px",
      }}
    >
      {/* Corner accent — top-left */}
      <div
        className="absolute top-0 left-0 w-5 h-5 border-t border-l border-[#00E5FF]/40 rounded-tl-xl"
        aria-hidden
      />
      {/* Corner accent — bottom-right */}
      <div
        className="absolute bottom-0 right-0 w-5 h-5 border-b border-r border-[#00E5FF]/40 rounded-br-xl"
        aria-hidden
      />

      {/* Panel label */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-pulse" />
        <span
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "9px", letterSpacing: "0.18em" }}
          className="text-[#00E5FF] uppercase opacity-60"
        >
          SYS TELEMETRY
        </span>
      </div>

      {/* Gauges */}
      <GaugeBar
        label="CPU"
        value={metrics?.cpu_usage ?? 0}
        unit="%"
        color="linear-gradient(90deg, #00BFFF, #00E5FF)"
      />
      <GaugeBar
        label="RAM"
        value={ramPct}
        unit="%"
        color="linear-gradient(90deg, #7A5CFF, #A880FF)"
        subtitle={ramSubtitle}
      />

      {/* Scan-line decorative overlay */}
      <div
        className="absolute inset-0 rounded-xl pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 4px)",
        }}
        aria-hidden
      />
    </div>
  );
}
