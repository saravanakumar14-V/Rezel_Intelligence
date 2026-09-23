import { Info, Zap } from 'lucide-react';

/**
 * AboutSection
 *
 * Displays application version, runtime environment, AI provider details,
 * and system architecture information for the Rezel desktop app.
 */
import { isTauri } from '@tauri-apps/api/core';

export default function AboutSection() {
  const isDesktop = typeof window !== 'undefined' && isTauri();
  const buildMode = import.meta.env.MODE || 'development';
  const rawArch = typeof navigator !== 'undefined' ? (navigator.platform || navigator.userAgent || 'Unknown') : 'Unknown';
  const arch = rawArch.length > 22 ? `${rawArch.slice(0, 20)}...` : rawArch;

  const rows = [
    { label: 'Rezel Version', value: 'v0.1.0-dev' },
    { label: 'Runtime', value: 'Tauri + React' },
    { label: 'AI Provider', value: 'Gemini' },
    {
      label: 'Provider Status',
      value: isDesktop ? 'Desktop' : 'Browser Dev',
      statusColor: isDesktop ? '#00FFAE' : '#FFD54F',
      hasZap: true,
    },
    { label: 'Build', value: buildMode },
    { label: 'Architecture', value: arch },
  ];

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border border-[rgba(0,229,255,0.12)] bg-[rgba(2,8,24,0.6)] backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Info size={14} style={{ color: '#00E5FF' }} />
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9px',
              letterSpacing: '0.14em',
              color: '#7ECFFF',
            }}
            className="uppercase"
          >
            About / Runtime
          </span>
        </div>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '12px',
            fontWeight: 700,
            color: '#00E5FF',
            textShadow: '0 0 8px rgba(0,229,255,0.4)',
            letterSpacing: '0.1em',
          }}
        >
          REZEL
        </span>
      </div>

      {/* Divider */}
      <div
        className="h-px w-full"
        style={{ background: 'linear-gradient(90deg, rgba(0,229,255,0.25), transparent)' }}
        aria-hidden
      />

      {/* Info Rows */}
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between text-xs">
            <span style={{ fontSize: '10px', color: '#4BB8F0' }}>{row.label}</span>
            <div className="flex items-center gap-1.5">
              {row.hasZap && (
                <Zap size={10} style={{ color: row.statusColor }} className="animate-pulse" />
              )}
              <span
                style={{
                  fontSize: '10px',
                  color: '#E0F0FF',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {row.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

