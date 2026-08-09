import { useEffect, useRef } from 'react';
import type { Message } from '../../../lib/ai/types';
import MessageBubble from './MessageBubble';

interface MessageListProps {
  messages: Message[];
  /** Partial text being streamed from the assistant. */
  streamingText: string;
  /** True when AgentCore is processing (shows thinking indicator). */
  isProcessing: boolean;
}

/**
 * MessageList
 *
 * Scrollable container of MessageBubble components.
 * Auto-scrolls to the bottom when new messages arrive or streaming text updates.
 * Shows a thinking indicator when AgentCore is processing.
 * Shows an empty-state prompt when no messages exist.
 */
export default function MessageList({
  messages,
  streamingText,
  isProcessing,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages or streaming updates
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streamingText]);

  // Empty state
  if (messages.length === 0 && !streamingText && !isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 opacity-30">
        <div
          className="w-8 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, #00E5FF, transparent)' }}
        />
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '10px',
            letterSpacing: '0.14em',
            color: '#7ECFFF',
          }}
        >
          START A CONVERSATION
        </span>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            color: '#4BB8F0',
            textAlign: 'center',
            lineHeight: 1.6,
            maxWidth: '220px',
          }}
        >
          Type a message or use voice input via the CommandOrb.
        </span>
        <div
          className="w-8 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, #00E5FF, transparent)' }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Rendered messages */}
      {messages.map((msg, i) => (
        <MessageBubble key={`${msg.timestamp}-${i}`} message={msg} />
      ))}

      {/* Streaming partial response */}
      {streamingText && (
        <div className="flex justify-start mb-3">
          <div className="max-w-[85%] flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '8px',
                  letterSpacing: '0.18em',
                  color: '#7ECFFF',
                  opacity: 0.5,
                }}
                className="uppercase"
              >
                REZEL
              </span>
              <div className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="w-1 h-1 rounded-full bg-[#00E5FF] animate-pulse"
                    style={{ animationDelay: `${i * 200}ms` }}
                  />
                ))}
              </div>
            </div>
            <div
              className="px-4 py-3 rounded-xl"
              style={{
                background: 'rgba(10,16,32,0.70)',
                border: '1px solid rgba(0,229,255,0.10)',
                borderRadius: '16px 16px 16px 4px',
              }}
            >
              <p
                style={{
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '13px',
                  lineHeight: 1.65,
                  color: '#EAFBFF',
                  opacity: 0.85,
                  margin: 0,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {streamingText}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Thinking indicator (no streaming text yet) */}
      {isProcessing && !streamingText && (
        <div className="flex justify-start mb-3">
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-xl"
            style={{
              background: 'rgba(10,16,32,0.50)',
              border: '1px solid rgba(0,229,255,0.08)',
              borderRadius: '16px 16px 16px 4px',
            }}
          >
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 rounded-full bg-[#00E5FF]"
                  style={{
                    animation: 'rezel-orb-pulse 1.2s ease-in-out infinite',
                    animationDelay: `${i * 200}ms`,
                  }}
                />
              ))}
            </div>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '9px',
                letterSpacing: '0.12em',
                color: '#4BB8F0',
                opacity: 0.6,
              }}
            >
              PROCESSING
            </span>
          </div>
        </div>
      )}

      {/* Scroll anchor */}
      <div ref={bottomRef} />
    </div>
  );
}
