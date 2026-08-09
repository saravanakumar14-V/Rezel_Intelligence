import { useCallback } from 'react';
import { Plus } from 'lucide-react';
import PanelShell from './PanelShell';
import MessageList from './chat/MessageList';
import ChatInput from './chat/ChatInput';
import type { UseChatReturn } from '../../hooks/useChat';

interface ChatPanelProps {
  chat: UseChatReturn;
}

/**
 * ChatPanel
 *
 * Fully functional conversation interface connected to AgentCore.
 *
 * Architecture:
 *  HomeScreen → useChat → AgentCore → GeminiProvider / ToolRegistry / Memory
 *  HomeScreen owns the event handler and forwards events to useChat.
 *  ChatPanel receives the useChat return as props (no duplicate hooks).
 *
 * Features:
 *  - Message display with streaming partial responses
 *  - Text input with Enter-to-send
 *  - Thinking/processing state indicator
 *  - Abort generation
 *  - New conversation
 *  - Persistent via LocalMemory (through AgentCore)
 *
 * Voice input flows separately through HomeScreen → useVoice → AgentCore.
 * Both paths use the same AgentCore.send() and share the same conversation.
 */
export default function ChatPanel({ chat }: ChatPanelProps) {
  const {
    messages,
    streamingText,
    isProcessing,
    error,
    send,
    abort,
    newConversation,
  } = chat;

  const handleNewConversation = useCallback(() => {
    newConversation();
  }, [newConversation]);

  return (
    <PanelShell
      title="Chat"
      subtitle={isProcessing ? 'Processing...' : 'Conversation interface'}
    >
      {/* New conversation button */}
      <div className="flex justify-end mb-3 -mt-1">
        <button
          onClick={handleNewConversation}
          disabled={isProcessing}
          aria-label="New conversation"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg cursor-pointer transition-all hover:opacity-80 active:scale-95"
          style={{
            background: 'rgba(0,229,255,0.06)',
            border: '1px solid rgba(0,229,255,0.15)',
            opacity: isProcessing ? 0.3 : 0.6,
            cursor: isProcessing ? 'default' : 'pointer',
          }}
        >
          <Plus size={11} color="#00E5FF" strokeWidth={2} />
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '8px',
              letterSpacing: '0.14em',
              color: '#00E5FF',
            }}
          >
            NEW
          </span>
        </button>
      </div>

      {/* Message list — takes remaining vertical space */}
      <div className="flex-1 min-h-0 overflow-y-auto -mx-5 px-5">
        <MessageList
          messages={messages}
          streamingText={streamingText}
          isProcessing={isProcessing}
        />
      </div>

      {/* Error display */}
      {error && (
        <div
          className="mx-0 mt-2 px-3 py-2 rounded-lg"
          style={{
            background: 'rgba(255,61,113,0.08)',
            border: '1px solid rgba(255,61,113,0.20)',
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              color: '#FF3D71',
              opacity: 0.8,
            }}
          >
            {error}
          </span>
        </div>
      )}

      {/* Chat input — fixed at bottom of panel */}
      <div className="-mx-5 -mb-4 mt-2">
        <ChatInput
          onSend={send}
          onAbort={abort}
          isProcessing={isProcessing}
        />
      </div>
    </PanelShell>
  );
}
