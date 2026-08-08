import PanelShell from './PanelShell';
import { Zap } from 'lucide-react';

/**
 * AutoPanel — Milestone 7.3 stub
 *
 * Will contain: tool browser, task execution, plan progress,
 * permission integration via ToolExecutor, audit log viewer.
 */
export default function AutoPanel() {
  return (
    <PanelShell title="Automation" subtitle="Task execution engine">
      <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
        <Zap size={28} strokeWidth={1} style={{ color: '#00E5FF' }} />
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            letterSpacing: '0.14em',
            color: '#7ECFFF',
          }}
        >
          INTERFACE PENDING
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            color: '#4BB8F0',
            textAlign: 'center',
            lineHeight: 1.6,
            maxWidth: '240px',
          }}
        >
          Automation interface will connect to ToolRegistry and Planner for secure task execution.
        </span>
      </div>
    </PanelShell>
  );
}
