import PanelShell from './PanelShell';
import { MessageSquare } from 'lucide-react';

/**
 * ChatPanel — Milestone 7.2 stub
 *
 * Will contain: message list, text input, streaming AI responses,
 * voice input integration, conversation management via AgentCore.
 */
export default function ChatPanel() {
  return (
    <PanelShell title="Chat" subtitle="Conversation interface">
      <div className="flex flex-col items-center justify-center h-full gap-4 opacity-40">
        <MessageSquare size={28} strokeWidth={1} style={{ color: '#00E5FF' }} />
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
          Conversation interface will connect to AgentCore for streaming AI responses.
        </span>
      </div>
    </PanelShell>
  );
}
