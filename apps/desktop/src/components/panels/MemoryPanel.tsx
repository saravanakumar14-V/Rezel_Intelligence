import PanelShell from './PanelShell';
import { Brain } from 'lucide-react';

/**
 * MemoryPanel — Milestone 7.4 stub
 *
 * Will contain: conversation history browser, memory entries viewer,
 * search, statistics — connected to LocalMemory.
 */
export default function MemoryPanel() {
  return (
    <PanelShell title="Memory" subtitle="Knowledge store">
      <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
        <Brain size={28} strokeWidth={1} style={{ color: '#00E5FF' }} />
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
          Memory interface will connect to LocalMemory for conversation history and persistent knowledge.
        </span>
      </div>
    </PanelShell>
  );
}
