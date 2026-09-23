import { useState, useEffect } from 'react';
import { ShieldAlert, Check, X, Clock } from 'lucide-react';
import type { ApprovalRequest } from '../../../lib/ai/approval/types';
import { ApprovalBridge } from '../../../lib/ai/approval/ApprovalBridge';
import { cn } from '../../../lib/cn';
import styles from './ContextualApprovalSurface.module.css';

export interface ContextualApprovalSurfaceProps {
  request: ApprovalRequest;
  onDecided?: () => void;
}

export default function ContextualApprovalSurface({
  request,
  onDecided,
}: ContextualApprovalSurfaceProps) {
  const [scope, setScope] = useState<'ONE_TIME' | 'SESSION'>('ONE_TIME');
  const [isProcessing, setIsProcessing] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(() => {
    if (!request.expiresAt) return null;
    return Math.max(0, Math.round((request.expiresAt - Date.now()) / 1000));
  });

  useEffect(() => {
    if (secondsRemaining === null) return;
    const interval = setInterval(() => {
      const rem = request.expiresAt ? Math.max(0, Math.round((request.expiresAt - Date.now()) / 1000)) : 0;
      setSecondsRemaining(rem);
      if (rem <= 0) {
        clearInterval(interval);
        // Automatic timeout deny
        ApprovalBridge.deny(request.approvalId, 'Approval expired on timeout')
          .catch(console.error)
          .finally(() => onDecided?.());
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [request.approvalId, request.expiresAt, onDecided, secondsRemaining]);

  // Keyboard shortcut listener (Enter = Approve, Esc = Deny)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isProcessing) {
        e.preventDefault();
        handleApprove();
      } else if (e.key === 'Escape' && !isProcessing) {
        e.preventDefault();
        handleDeny();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isProcessing, scope, request.approvalId]);

  const handleApprove = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await ApprovalBridge.approve(request.approvalId, { scope });
      onDecided?.();
    } catch (err) {
      console.error('Approval failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeny = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    try {
      await ApprovalBridge.deny(request.approvalId, 'Denied by user');
      onDecided?.();
    } catch (err) {
      console.error('Denial failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const riskClass = styles[`risk-${request.riskLevel.toLowerCase()}`];
  const badgeClass = styles[`badge-${request.riskLevel.toLowerCase()}`];

  return (
    <div className={styles.surfaceOverlay} role="dialog" aria-modal="true" aria-labelledby="approval-title">
      <div className={cn(styles.approvalCard, riskClass)}>
        {/* ── Header ───────────────────────────────────────────── */}
        <div className={styles.cardHeader}>
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className={request.riskLevel === 'CRITICAL' ? 'text-[#FF3D71]' : 'text-[#FFD54F]'} />
            <span className={styles.actionTitle}>Human Approval Gate</span>
          </div>

          <div className="flex items-center gap-2">
            {secondsRemaining !== null && (
              <span className="flex items-center gap-1 font-mono text-[9px] text-[#FFD54F] bg-[#FFD54F]/10 px-2 py-0.5 rounded border border-[#FFD54F]/30">
                <Clock size={10} /> {secondsRemaining}s
              </span>
            )}
            <span className={cn(styles.riskBadge, badgeClass)}>
              {request.riskLevel} RISK
            </span>
          </div>
        </div>

        {/* ── Summary & Rationale ───────────────────────────────── */}
        <div className={styles.rationaleBox}>
          <span className={styles.rationaleLabel}>REQUESTED ACTION & PURPOSE</span>
          <span className={styles.rationaleText}>{request.summary || request.reason}</span>
        </div>

        {/* ── Scope & Affected Resources ───────────────────────── */}
        <div className={styles.scopeBox}>
          <span className="font-mono text-[8px] text-white/50 tracking-wider uppercase">
            TARGET RESOURCES & CAPABILITIES
          </span>
          <div className={styles.resourceList}>
            {request.requestedCapabilities.map((cap, idx) => (
              <span key={idx} className={styles.resourceItem}>
                • Capability: {cap}
              </span>
            ))}
            {request.affectedResources.map((res, idx) => (
              <span key={idx} className={styles.resourceItem}>
                • Resource: {res}
              </span>
            ))}
          </div>

          {/* Scope Grant Option */}
          <div className={styles.scopeToggleRow}>
            <span className="text-white/50">GRANT DURATION:</span>
            <button
              type="button"
              onClick={() => setScope('ONE_TIME')}
              className={cn(styles.scopeBtn, scope === 'ONE_TIME' && styles.scopeBtnActive)}
            >
              This Action Only
            </button>
            <button
              type="button"
              onClick={() => setScope('SESSION')}
              className={cn(styles.scopeBtn, scope === 'SESSION' && styles.scopeBtnActive)}
            >
              Allow for Workspace Session
            </button>
          </div>
        </div>

        {/* ── Action Footer ─────────────────────────────────────── */}
        <div className={styles.actionFooter}>
          <button
            type="button"
            disabled={isProcessing}
            onClick={handleDeny}
            className={styles.denyBtn}
          >
            <X size={12} className="inline mr-1" />
            DENY (ESC)
          </button>

          <button
            type="button"
            disabled={isProcessing}
            onClick={handleApprove}
            className={styles.approveBtn}
          >
            <Check size={12} className="inline mr-1" />
            APPROVE & EXECUTE (ENTER)
          </button>
        </div>
      </div>
    </div>
  );
}
