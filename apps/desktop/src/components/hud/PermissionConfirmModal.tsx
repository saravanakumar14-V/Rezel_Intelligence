import { useEffect } from 'react';
import type { ApprovalRequest } from '../../lib/security/ToolExecutor';
import type { RiskLevel } from '../../lib/security/PermissionManager';

// ─── Risk colour palette ───────────────────────────────────────────────────────

const RISK_PALETTE: Record<RiskLevel, { accent: string; badge: string; bg: string }> = {
  LOW:      { accent: '#00E5FF', badge: '#00BFFF', bg: 'rgba(0,180,255,0.08)'  },
  MEDIUM:   { accent: '#FFD54F', badge: '#FFC107', bg: 'rgba(255,193,7,0.08)'  },
  HIGH:     { accent: '#FF9F1C', badge: '#FF7700', bg: 'rgba(255,120,0,0.10)'  },
  CRITICAL: { accent: '#FF3D71', badge: '#FF0044', bg: 'rgba(255,0,50,0.12)'   },
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '9px',
          color: '#4BB8F0',
          letterSpacing: '0.18em',
          opacity: 0.6,
          minWidth: '64px',
          paddingTop: '1px',
        }}
        className="uppercase shrink-0"
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: mono ? "'JetBrains Mono', monospace" : 'Inter, sans-serif',
          fontSize: '12px',
          color: '#EAFBFF',
          opacity: 0.85,
          wordBreak: 'break-all',
          lineHeight: 1.5,
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

interface PermissionConfirmModalProps {
  request: ApprovalRequest;
  onApprove: () => void;
  onDeny: () => void;
}

/**
 * PermissionConfirmModal
 *
 * Shown by HomeScreen when ToolExecutor suspends awaiting human approval.
 * Sits at z-50 above both the 3D canvas and the HologramHUD.
 *
 * Keyboard shortcuts:
 *  Enter  → Approve
 *  Escape → Deny
 *
 * This component has pointer-events by default (unlike HologramHUD).
 * The backdrop blocks all canvas interaction while the modal is open.
 */
export default function PermissionConfirmModal({
  request,
  onApprove,
  onDeny,
}: PermissionConfirmModalProps) {
  const palette = RISK_PALETTE[request.risk] ?? RISK_PALETTE.HIGH;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter')  { e.preventDefault(); onApprove(); }
      if (e.key === 'Escape') { e.preventDefault(); onDeny();    }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onApprove, onDeny]);

  const actionLabel = request.action.replace(/_/g, ' ').toUpperCase();

  return (
    /* ── Backdrop ───────────────────────────────────────────────────────── */
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{
        zIndex: 50,
        background: 'rgba(2,3,10,0.80)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
      role="presentation"
    >
      {/* ── Dialog ──────────────────────────────────────────────────────── */}
      <div
        className="relative flex flex-col gap-5 px-6 py-6 rounded-2xl"
        style={{
          background:
            'linear-gradient(140deg, rgba(0,20,45,0.97) 0%, rgba(0,8,22,0.99) 100%)',
          border: `1px solid ${palette.accent}2E`,
          boxShadow: [
            `0 0 0 1px ${palette.accent}18`,
            `0 0 48px ${palette.accent}14`,
            `0 24px 64px rgba(0,0,0,0.75)`,
          ].join(', '),
          minWidth: '360px',
          maxWidth: '500px',
          width: '90vw',
        }}
        role="dialog"
        aria-modal="true"
        aria-label={`Permission required: ${actionLabel}`}
      >
        {/* Corner accents */}
        <div
          className="absolute top-0 left-0 w-7 h-7 border-t-2 border-l-2 rounded-tl-2xl pointer-events-none"
          style={{ borderColor: palette.accent + '55' }}
          aria-hidden
        />
        <div
          className="absolute bottom-0 right-0 w-7 h-7 border-b-2 border-r-2 rounded-br-2xl pointer-events-none"
          style={{ borderColor: palette.accent + '55' }}
          aria-hidden
        />

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            {/* Label row */}
            <div className="flex items-center gap-2">
              <div
                className="w-2 h-2 rounded-full animate-pulse"
                style={{ background: palette.badge }}
              />
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '9px',
                  letterSpacing: '0.22em',
                  color: palette.badge,
                  opacity: 0.8,
                }}
                className="uppercase"
              >
                PERMISSION REQUIRED
              </span>
            </div>
            {/* Action name */}
            <h2
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '17px',
                color: '#EAFBFF',
                fontWeight: 600,
                lineHeight: 1.2,
              }}
            >
              {actionLabel}
            </h2>
          </div>

          {/* Risk badge */}
          <div
            className="flex items-center shrink-0 px-2.5 py-1 rounded-lg"
            style={{
              background: palette.bg,
              border: `1px solid ${palette.accent}44`,
            }}
          >
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '11px',
                color: palette.badge,
                fontWeight: 700,
                letterSpacing: '0.14em',
              }}
            >
              {request.risk}
            </span>
          </div>
        </div>

        {/* Hairline divider */}
        <div
          className="h-px w-full"
          style={{
            background: `linear-gradient(90deg, ${palette.accent}44, transparent 80%)`,
          }}
          aria-hidden
        />

        {/* ── Details ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {request.approvalContext ? (
            <DetailRow label="INTENT" value={request.approvalContext.message} />
          ) : (
            <>
              <DetailRow label="TOOL"   value={request.tool}   />
              <DetailRow label="ACTION" value={request.action} />
            </>
          )}
          {request.command && !request.approvalContext && (
            <DetailRow label="COMMAND" value={request.command} mono />
          )}
          {request.reason && (
            <div
              className="flex items-start gap-2 px-3 py-2 rounded-lg"
              style={{
                background: palette.bg,
                border: `1px solid ${palette.accent}22`,
              }}
            >
              <span style={{ color: palette.badge, fontSize: '13px', lineHeight: 1 }}>
                ⚠
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '11px',
                  color: palette.badge,
                  opacity: 0.85,
                  lineHeight: 1.5,
                }}
              >
                {request.reason}
              </span>
            </div>
          )}
        </div>

        {/* ── Action buttons ───────────────────────────────────────────── */}
        <div className="flex gap-3 mt-1">
          {/* Deny */}
          <button
            id="permission-deny-btn"
            onClick={onDeny}
            className="flex-1 py-2.5 rounded-xl transition-all duration-200 hover:brightness-125 active:scale-95"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              letterSpacing: '0.14em',
              fontWeight: 600,
              background: 'rgba(255,61,113,0.12)',
              border: '1px solid rgba(255,61,113,0.40)',
              color: '#FF3D71',
              cursor: 'pointer',
            }}
            aria-label="Deny (Escape)"
          >
            DENY  [Esc]
          </button>

          {/* Approve */}
          <button
            id="permission-approve-btn"
            onClick={onApprove}
            className="flex-1 py-2.5 rounded-xl transition-all duration-200 hover:brightness-125 active:scale-95"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              letterSpacing: '0.14em',
              fontWeight: 600,
              background: palette.bg,
              border: `1px solid ${palette.accent}55`,
              color: palette.badge,
              cursor: 'pointer',
            }}
            aria-label="Approve (Enter)"
          >
            APPROVE  [↵]
          </button>
        </div>

        {/* Audit note */}
        <p
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            color: '#4BB8F0',
            opacity: 0.35,
            textAlign: 'center',
            letterSpacing: '0.06em',
          }}
        >
          This action will be recorded in the Rezel security audit log.
        </p>

        {/* Scan-line texture */}
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none opacity-[0.025]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 4px)',
          }}
          aria-hidden
        />
      </div>
    </div>
  );
}
