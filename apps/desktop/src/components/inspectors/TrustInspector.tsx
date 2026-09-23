import { useState } from 'react';
import { ShieldCheck, Activity } from 'lucide-react';
import InspectorShell from './InspectorShell';
import PermissionsSection from '../panels/settings/PermissionsSection';
import AuditIntelligenceDeck from '../hud/audit/AuditIntelligenceDeck';
import { cn } from '../../lib/cn';
import styles from './TrustInspector.module.css';

interface TrustInspectorProps {
  onClose?: () => void;
}

export default function TrustInspector({ onClose }: TrustInspectorProps) {
  const [activeTab, setActiveTab] = useState<'permissions' | 'audit'>('permissions');

  return (
    <InspectorShell
      title="Trust & Authority"
      subtitle="Security Policies & Real-Time Audit"
      onClose={onClose}
    >
      <div className={styles.trustRoot}>
        {/* ── Hero Authority Shield Card ───────────────────────────── */}
        <div className={styles.heroAuthorityCard}>
          <div className={styles.heroHeader}>
            <div className={styles.heroTitleGroup}>
              <span className={styles.shieldDot} />
              <span>ZERO-TRUST POLICY GUARD</span>
            </div>
            <span className="font-mono text-[8px] text-[#00FFAE] bg-[#00FFAE]/10 px-2 py-0.5 rounded border border-[#00FFAE]/30">
              GOVERNANCE ACTIVE
            </span>
          </div>

          <span className={styles.heroStatusText}>
            HUMAN CONTROL & PERMISSION GOVERNANCE
          </span>

          <p className={styles.heroDescription}>
            Rezel operates under deterministic least-privilege security. Destructive actions, external terminal executions, and sensitive file operations require explicit human approval.
          </p>

          <div className={styles.heroMetaRow}>
            <span>POLICY MODE: STRICT HITL APPROVAL</span>
            <span>AUDIT LOGGING: IMMUTABLE</span>
          </div>
        </div>

        {/* ── Mode Switcher Tabs ───────────────────────────────────── */}
        <div className={styles.modeTabs}>
          <button
            type="button"
            onClick={() => setActiveTab('permissions')}
            className={cn(
              styles.modeTab,
              activeTab === 'permissions' && styles.modeTabActive
            )}
          >
            <ShieldCheck size={11} />
            <span>ACTIVE PERMISSIONS & GRANTS</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={cn(
              styles.modeTab,
              activeTab === 'audit' && styles.modeTabActive
            )}
          >
            <Activity size={11} />
            <span>REAL-TIME AUDIT TRAIL</span>
          </button>
        </div>

        {/* ── Tab Content ─────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {activeTab === 'permissions' ? (
            <PermissionsSection />
          ) : (
            <AuditIntelligenceDeck />
          )}
        </div>
      </div>
    </InspectorShell>
  );
}
