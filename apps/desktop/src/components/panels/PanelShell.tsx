import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface PanelShellProps {
  /** Panel title shown in the header */
  title: string;
  /** Optional subtitle / status text */
  subtitle?: string;
  /** Panel content */
  children: ReactNode;
  /** Additional classes for the outer wrapper */
  className?: string;
}

/**
 * PanelShell
 *
 * Shared glassmorphic container used by all Phase 7 panels.
 * Positioned on the right side of the screen with consistent
 * Rezel visual language: deep-space gradient, cyan accents,
 * JetBrains Mono labels, scan-line texture, corner accents.
 *
 * pointer-events-auto is set on this shell so panel contents
 * are interactive despite the parent PanelHost being pointer-events-none.
 */
export default function PanelShell({
  title,
  subtitle,
  children,
  className,
}: PanelShellProps) {
  return (
    <div
      className={cn(
        'absolute top-[56px] right-6 bottom-[100px]',
        'w-[400px] max-w-[calc(100vw-240px)]',
        'flex flex-col rounded-2xl overflow-hidden',
        'pointer-events-auto',
        className,
      )}
      style={{
        background:
          'linear-gradient(160deg, rgba(2,8,24,0.92) 0%, rgba(0,4,14,0.96) 100%)',
        border: '1px solid rgba(0,229,255,0.12)',
        boxShadow: [
          '0 0 0 1px rgba(0,229,255,0.06)',
          '0 0 60px rgba(0,229,255,0.06)',
          '0 32px 80px rgba(0,0,0,0.6)',
        ].join(', '),
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <div className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-pulse" />
        <div className="flex flex-col gap-0.5">
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              letterSpacing: '0.22em',
              color: '#00E5FF',
              fontWeight: 600,
            }}
            className="uppercase"
          >
            {title}
          </span>
          {subtitle && (
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '9px',
                color: '#4BB8F0',
                letterSpacing: '0.08em',
              }}
              className="opacity-50"
            >
              {subtitle}
            </span>
          )}
        </div>
      </div>

      {/* Hairline divider */}
      <div
        className="mx-5 h-px"
        style={{ background: 'linear-gradient(90deg, rgba(0,229,255,0.25), transparent 80%)' }}
        aria-hidden
      />

      {/* ── Content ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {children}
      </div>

      {/* Corner accents */}
      <div
        className="absolute top-0 left-0 w-6 h-6 border-t border-l border-[#00E5FF]/25 rounded-tl-2xl pointer-events-none"
        aria-hidden
      />
      <div
        className="absolute bottom-0 right-0 w-6 h-6 border-b border-r border-[#00E5FF]/25 rounded-br-2xl pointer-events-none"
        aria-hidden
      />

      {/* Scan-line texture */}
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none opacity-[0.02]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 4px)',
        }}
        aria-hidden
      />
    </div>
  );
}
