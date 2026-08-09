import { useState, useCallback } from 'react';
import { Shield, RefreshCw } from 'lucide-react';
import { PermissionManager } from '../../../lib/security/PermissionManager';
import { AuditLogger } from '../../../lib/security/AuditLogger';
import type { AuditEntry, AuditOutcome } from '../../../lib/security/AuditLogger';

/**
 * Color-code risk levels:
 * LOW=#00E5FF, MEDIUM=#FFB74D, HIGH=#FF7043, CRITICAL=#FF4D6A
 */
export const RISK_COLORS = {
  LOW: '#00E5FF',
  MEDIUM: '#FFB74D',
  HIGH: '#FF7043',
  CRITICAL: '#FF4D6A',
} as const;

/**
 * Color-code outcomes:
 * ALLOWED=#00E5FF, DENIED_BY_USER=#FFB74D, BLOCKED_*=#FF4D6A, ERROR=#FF4D6A
 */
const OUTCOME_COLORS: Record<AuditOutcome, string> = {
  ALLOWED: '#00E5FF',
  DENIED_BY_USER: '#FFB74D',
  BLOCKED_CRITICAL: '#FF4D6A',
  BLOCKED_UNSAFE: '#FF4D6A',
  ERROR: '#FF4D6A',
};

const OUTCOME_LABELS: Record<AuditOutcome, string> = {
  ALLOWED: 'Allowed',
  DENIED_BY_USER: 'Denied by User',
  BLOCKED_CRITICAL: 'Blocked (Critical)',
  BLOCKED_UNSAFE: 'Blocked (Unsafe)',
  ERROR: 'Error',
};

/**
 * PermissionsSection
 *
 * Read-only summary component for the Rezel Settings panel.
 * Displays active session tool grants and outcome stats for recent audit entries.
 */
export default function PermissionsSection() {
  const [grantedKeys, setGrantedKeys] = useState<readonly string[]>(() =>
    PermissionManager.getGrantedKeys()
  );
  const [recentAudits, setRecentAudits] = useState<readonly AuditEntry[]>(() =>
    AuditLogger.getRecent(20)
  );

  const handleRefresh = useCallback(() => {
    setGrantedKeys(PermissionManager.getGrantedKeys());
    setRecentAudits(AuditLogger.getRecent(20));
  }, []);

  const outcomeCounts: Record<AuditOutcome, number> = {
    ALLOWED: 0,
    DENIED_BY_USER: 0,
    BLOCKED_CRITICAL: 0,
    BLOCKED_UNSAFE: 0,
    ERROR: 0,
  };

  for (const entry of recentAudits) {
    if (entry.outcome in outcomeCounts) {
      outcomeCounts[entry.outcome]++;
    }
  }

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl border border-[rgba(0,229,255,0.12)] bg-[rgba(2,8,24,0.6)] backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={14} style={{ color: '#00E5FF' }} />
          <span
            className="uppercase"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9px',
              letterSpacing: '0.14em',
              color: '#7ECFFF',
            }}
          >
            PERMISSIONS & SECURITY
          </span>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          title="Refresh security summary"
          className="flex items-center gap-1 px-2 py-1 rounded transition-colors hover:bg-[rgba(0,229,255,0.1)] active:bg-[rgba(0,229,255,0.2)] cursor-pointer"
          style={{
            fontSize: '9px',
            fontFamily: "'JetBrains Mono', monospace",
            color: '#4BB8F0',
            border: '1px solid rgba(0,229,255,0.15)',
          }}
        >
          <RefreshCw size={10} style={{ color: '#00E5FF' }} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Hairline Divider */}
      <div
        className="h-px w-full"
        style={{ background: 'linear-gradient(90deg, rgba(0,229,255,0.25), transparent)' }}
        aria-hidden
      />

      {/* 1. Session Grants Section */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span style={{ fontSize: '10px', color: '#E0F0FF' }}>
            Session Grants ({grantedKeys.length})
          </span>
          <span style={{ fontSize: '9px', color: '#4BB8F0' }}>
            Session Active
          </span>
        </div>

        {grantedKeys.length === 0 ? (
          <span style={{ fontSize: '9px', color: '#4BB8F0' }} className="italic">
            No active grants
          </span>
        ) : (
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
            {grantedKeys.map((key) => (
              <span
                key={key}
                className="px-2 py-0.5 rounded border border-[rgba(0,229,255,0.2)] bg-[rgba(0,229,255,0.06)]"
                style={{
                  fontSize: '9px',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#E0F0FF',
                }}
              >
                {key}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 2. Recent Audit Summary Section */}
      <div className="flex flex-col gap-1.5 mt-1">
        <div className="flex items-center justify-between">
          <span style={{ fontSize: '10px', color: '#E0F0FF' }}>
            Recent Audit Summary
          </span>
          <span style={{ fontSize: '9px', color: '#4BB8F0' }}>
            Last {recentAudits.length} entries
          </span>
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {(Object.keys(OUTCOME_LABELS) as AuditOutcome[]).map((outcome) => {
            const count = outcomeCounts[outcome];
            const color = OUTCOME_COLORS[outcome];
            return (
              <div
                key={outcome}
                className="flex items-center justify-between p-2 rounded border border-[rgba(0,229,255,0.08)] bg-[rgba(0,229,255,0.03)]"
              >
                <span
                  style={{
                    fontSize: '9px',
                    color: color,
                  }}
                >
                  {OUTCOME_LABELS[outcome]}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: "'JetBrains Mono', monospace",
                    fontWeight: 600,
                    color: count > 0 ? color : '#4BB8F0',
                  }}
                >
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
