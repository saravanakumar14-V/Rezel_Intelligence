import React, { useState } from 'react';
import { ShieldCheck, FileText, Terminal, Globe, ChevronRight } from 'lucide-react';
import { PermissionManager } from '../../../lib/security/PermissionManager';
import styles from '../OnboardingHost.module.css';

interface StageProps {
  onAdvance: () => void;
}

interface PermissionCardData {
  key: string;
  tool: string;
  action: string;
  name: string;
  icon: typeof FileText;
  why: string;
  scope: string;
  color: string;
}

const PERMISSION_EXPLAINERS: PermissionCardData[] = [
  {
    key: 'filesystem',
    tool: 'filesystem',
    action: 'write_file',
    name: 'File System Modifications',
    icon: FileText,
    why: 'Rezel creates, updates, and structures project files when generating code or saving workflows.',
    scope: 'User projects only. System-owned directories (Windows, System32) are strictly blocked.',
    color: 'text-cyan-400',
  },
  {
    key: 'terminal',
    tool: 'system',
    action: 'run_system_command',
    name: 'Terminal & Command Execution',
    icon: Terminal,
    why: 'Runs test suites, compiles projects, and executes local development scripts on demand.',
    scope: 'Explicit human approval required for non-sandboxed commands. Destructive commands are permanently gated.',
    color: 'text-amber-400',
  },
  {
    key: 'network',
    tool: 'network',
    action: 'http_request',
    name: 'Outbound Network Requests',
    icon: Globe,
    why: 'Queries authenticated AI model providers and reaches approved documentation endpoints.',
    scope: 'Restricted to authenticated vendor endpoints and localhost.',
    color: 'text-purple-400',
  },
];

export const PermissionsStage: React.FC<StageProps> = ({ onAdvance }) => {
  const [gatesState, setGatesState] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const p of PERMISSION_EXPLAINERS) {
      initial[p.key] = !PermissionManager.isGranted(p.tool, p.action);
    }
    return initial;
  });

  const handleToggle = (p: PermissionCardData) => {
    setGatesState((prev) => {
      const willBeGated = !prev[p.key];
      if (willBeGated) {
        PermissionManager.revoke(p.tool, p.action);
      } else {
        PermissionManager.grant(p.tool, p.action);
      }
      return { ...prev, [p.key]: willBeGated };
    });
  };

  return (
    <div className={styles.stageStandard}>
      <div className={styles.stageHeader}>
        <span className={styles.stageCategoryTag}>STAGE 07 · SECURITY & TRUST BOUNDARIES</span>
        <h1 className={styles.stageTitle}>Security & Safe Defaults</h1>
        <p className={styles.stageSubtitle}>
          Rezel enforces granular security boundaries. You have total control over what AI agents can read, write, and execute.
        </p>
      </div>

      <div className={styles.permissionsList}>
        {PERMISSION_EXPLAINERS.map((p) => {
          const isGated = gatesState[p.key] ?? true;
          const Icon = p.icon;

          return (
            <div key={p.key} className={styles.permissionCard}>
              <div className={styles.permissionCardHeader}>
                <div className="flex items-center gap-2">
                  <Icon size={16} className={p.color} />
                  <span className={styles.permissionName}>{p.name}</span>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggle(p)}
                  className={isGated ? styles.gateActivePill : styles.gateOpenPill}
                  title="Toggle security gate"
                >
                  {isGated ? 'GATED (RECOMMENDED)' : 'PRE-APPROVED'}
                </button>
              </div>

              <div className={styles.permissionDetailsCol}>
                <p className={styles.permissionWhy}>
                  <strong className="text-slate-200">Why needed:</strong> {p.why}
                </p>
                <p className={styles.permissionScope}>
                  <strong className="text-slate-200">Enforcement Scope:</strong> {p.scope}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.securityNote}>
        <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
        <span>Safe defaults active: Potentially destructive commands always require manual confirmation. Permissions can be reconfigured anytime in Control → Trust Gates.</span>
      </div>

      <div className={styles.stageActionDeck}>
        <span className={styles.techMeta}>SECURITY POLICIES ARMED</span>

        <button type="button" onClick={onAdvance} className={styles.primaryActionButton}>
          <span>CONFIRM POLICIES & CONTINUE</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
