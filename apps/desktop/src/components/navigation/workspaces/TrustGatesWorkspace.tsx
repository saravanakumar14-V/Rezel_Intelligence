import React, { useState } from 'react';
import { Shield } from 'lucide-react';
import { PermissionManager } from '../../../lib/security/PermissionManager';
import styles from '../SpatialSurface.module.css';

interface GateConfig {
  key: string;
  tool: string;
  action: string;
  title: string;
  desc: string;
}

const GATE_DEFINITIONS: GateConfig[] = [
  {
    key: 'fileSystemWrite',
    tool: 'filesystem',
    action: 'write_file',
    title: 'File System Modifications',
    desc: 'Require human confirmation before saving or overwriting project files',
  },
  {
    key: 'shellExecution',
    tool: 'system',
    action: 'run_system_command',
    title: 'Terminal Shell Execution',
    desc: 'Always prompt before executing non-sandboxed terminal commands',
  },
  {
    key: 'outboundNetwork',
    tool: 'network',
    action: 'http_request',
    title: 'External Network Requests',
    desc: 'Permit trusted endpoints (Anthropic, Google, GitHub, Localhost)',
  },
  {
    key: 'agentSwarmLoop',
    tool: 'agent',
    action: 'background_loop',
    title: 'Background Agent Swarms',
    desc: 'Limit autonomous background execution to 3 concurrent tasks',
  },
];

export const TrustGatesWorkspace: React.FC = () => {
  // Initialize state based on actual PermissionManager session grants
  // Note: GATED means confirmation is required (not pre-granted); OPEN means pre-granted (isGranted is true)
  const [gatesState, setGatesState] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const g of GATE_DEFINITIONS) {
      // isGated is true when NOT pre-approved in session
      initial[g.key] = !PermissionManager.isGranted(g.tool, g.action);
    }
    return initial;
  });

  const [gateFeedback, setGateFeedback] = useState<string | null>(null);

  const handleToggleGate = (gate: GateConfig) => {
    setGatesState((prev) => {
      const isCurrentlyGated = prev[gate.key];
      const willBeGated = !isCurrentlyGated;

      if (willBeGated) {
        // Gated: revoke session pre-approval so confirmation is required
        PermissionManager.revoke(gate.tool, gate.action);
        setGateFeedback(`Policy active: ${gate.title} is now GATED (Requires Human Confirmation)`);
      } else {
        // Open: grant session approval
        PermissionManager.grant(gate.tool, gate.action);
        setGateFeedback(`Policy updated: ${gate.title} is now OPEN (Session Pre-Approved)`);
      }

      setTimeout(() => setGateFeedback(null), 3000);
      return { ...prev, [gate.key]: willBeGated };
    });
  };

  return (
    <div className={styles.taskTrustGates}>
      {gateFeedback && (
        <div className={styles.gateFeedbackToast}>
          <Shield size={12} className="text-cyan-400" />
          <span>{gateFeedback}</span>
        </div>
      )}

      <div className={styles.gateList}>
        {GATE_DEFINITIONS.map((gate) => {
          const isGated = gatesState[gate.key] ?? true;
          return (
            <div
              key={gate.key}
              className={styles.gateRow}
              onClick={() => handleToggleGate(gate)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToggleGate(gate);
                }
              }}
            >
              <div className={styles.gateMeta}>
                <span className={styles.gateTitle}>{gate.title}</span>
                <span className={styles.gateDesc}>{gate.desc}</span>
              </div>
              <span className={isGated ? styles.gateBadgeActive : styles.gateBadgePassive}>
                {isGated ? 'GATED' : 'OPEN'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
