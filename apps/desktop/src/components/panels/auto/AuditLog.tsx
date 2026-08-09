import { useMemo } from 'react';
import { AuditLogger, type AuditEntry, type AuditOutcome } from '../../../lib/security/AuditLogger';
import type { RiskLevel } from '../../../lib/security/PermissionManager';

// ─── Outcome styling ─────────────────────────────────────────────────────────

const OUTCOME_STYLE: Record<AuditOutcome, { label: string; color: string }> = {
  ALLOWED:          { label: 'OK',      color: '#00FFAE' },
  DENIED_BY_USER:   { label: 'DENIED',  color: '#FF3D71' },
  BLOCKED_CRITICAL: { label: 'BLOCKED', color: '#FF3D71' },
  BLOCKED_UNSAFE:   { label: 'UNSAFE',  color: '#FF9F1C' },
  ERROR:            { label: 'ERROR',   color: '#FF3D71' },
};

const RISK_COLOR: Record<RiskLevel, string> = {
  LOW:      '#00E5FF',
  MEDIUM:   '#FFD54F',
  HIGH:     '#FF9F1C',
  CRITICAL: '#FF3D71',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface AuditLogProps {
  /** Number of recent entries to show. */
  count?: number;
  /** Trigger re-render when this changes (incremented on new operations). */
  refreshKey?: number;
}

/**
 * AuditLog
 *
 * Displays recent audit entries from AuditLogger.getRecent().
 * Read-only, no polling — refreshes when refreshKey changes.
 */
export default function AuditLog({ count = 15, refreshKey = 0 }: AuditLogProps) {
  const entries = useMemo(() => {
    // refreshKey dependency forces re-read from AuditLogger
    void refreshKey;
    return [...AuditLogger.getRecent(count)].reverse();
  }, [count, refreshKey]);

  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 opacity-30">
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            color: '#7ECFFF',
            letterSpacing: '0.12em',
          }}
        >
          NO OPERATIONS RECORDED
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {entries.map((entry) => (
        <AuditRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

// ─── AuditRow ─────────────────────────────────────────────────────────────────

function AuditRow({ entry }: { entry: AuditEntry }) {
  const outcomeStyle = OUTCOME_STYLE[entry.outcome] ?? OUTCOME_STYLE.ERROR;
  const riskColor = RISK_COLOR[entry.risk] ?? RISK_COLOR.MEDIUM;

  const time = new Date(entry.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1.5 rounded"
      style={{
        background: 'rgba(10,16,32,0.30)',
        border: '1px solid rgba(255,255,255,0.03)',
      }}
    >
      {/* Timestamp */}
      <span
        className="shrink-0 tabular-nums"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '9px',
          color: '#4BB8F0',
          opacity: 0.4,
          minWidth: '54px',
        }}
      >
        {time}
      </span>

      {/* Action name */}
      <span
        className="flex-1 truncate"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '10px',
          color: '#EAFBFF',
          opacity: 0.7,
        }}
      >
        {entry.action}
      </span>

      {/* Risk badge */}
      <span
        className="shrink-0"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '7px',
          color: riskColor,
          opacity: 0.5,
          letterSpacing: '0.08em',
        }}
      >
        {entry.risk}
      </span>

      {/* Outcome badge */}
      <span
        className="shrink-0 px-1.5 py-px rounded"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '7px',
          letterSpacing: '0.08em',
          color: outcomeStyle.color,
          background: `${outcomeStyle.color}10`,
          border: `1px solid ${outcomeStyle.color}25`,
          fontWeight: 600,
        }}
      >
        {outcomeStyle.label}
      </span>

      {/* Duration */}
      {entry.durationMs != null && (
        <span
          className="shrink-0 tabular-nums"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '8px',
            color: '#4BB8F0',
            opacity: 0.3,
          }}
        >
          {entry.durationMs < 1000
            ? `${entry.durationMs.toFixed(0)}ms`
            : `${(entry.durationMs / 1000).toFixed(1)}s`}
        </span>
      )}
    </div>
  );
}
