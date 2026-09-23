import { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import type { Message } from '../../../lib/ai/types';

interface MessageBubbleProps {
  message: Message;
}

/**
 * MessageBubble
 *
 * Single message display within the chat panel.
 * User messages: right-aligned, cyan-tinted border.
 * Assistant messages: left-aligned, subtle surface background.
 * Tool messages: compact, monospaced, dimmed.
 *
 * Uses the Rezel design language: JetBrains Mono for labels/meta,
 * Inter for message body, glassmorphic surfaces, cyan accents.
 * Supports mouse text selection (Ctrl+C) and explicit message copy action.
 */
export default function MessageBubble({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';

  const handleCopy = useCallback(async () => {
    if (!message.content) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(message.content);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = message.content;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('[MessageBubble] Failed to copy text:', err);
    }
  }, [message.content]);

  // Don't render empty assistant messages (tool-call-only turns)
  if (isAssistant && !message.content && message.toolCalls?.length) {
    return null;
  }

  // Tool messages: compact inline display
  if (isTool) {
    return (
      <div className="flex justify-start mb-2 select-text">
        <div
          className="max-w-[90%] px-3 py-2 rounded-lg"
          style={{
            background: 'rgba(122,92,255,0.06)',
            border: '1px solid rgba(122,92,255,0.15)',
            userSelect: 'text',
          }}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '8px',
              letterSpacing: '0.16em',
              color: '#A880FF',
              opacity: 0.6,
              userSelect: 'none',
            }}
            className="uppercase block mb-1"
          >
            TOOL RESULT
          </span>
          <pre
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              color: '#B0D4F1',
              opacity: 0.7,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              margin: 0,
              lineHeight: 1.5,
              userSelect: 'text',
            }}
          >
            {message.content}
          </pre>
        </div>
      </div>
    );
  }

  const timestamp = new Date(message.timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className={`flex mb-3 group ${isUser ? 'justify-end' : 'justify-start'} select-text`}
    >
      <div
        className="max-w-[85%] flex flex-col gap-1"
      >
        {/* Role label + timestamp + copy button */}
        <div
          className={`flex items-center gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
        >
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '8px',
              letterSpacing: '0.18em',
              color: isUser ? '#00E5FF' : '#7ECFFF',
              opacity: 0.5,
              userSelect: 'none',
            }}
            className="uppercase"
          >
            {isUser ? 'YOU' : 'REZEL'}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '8px',
              color: '#4BB8F0',
              opacity: 0.3,
              userSelect: 'none',
            }}
          >
            {timestamp}
          </span>
          {isAssistant && message.content && (
            <button
              onClick={handleCopy}
              title={copied ? 'Copied to clipboard' : 'Copy message'}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity p-0.5 rounded cursor-pointer ml-1"
              style={{
                background: 'transparent',
                border: 'none',
                color: copied ? '#00E5FF' : '#7ECFFF',
              }}
            >
              {copied ? <Check size={10} strokeWidth={2.5} /> : <Copy size={10} />}
            </button>
          )}
        </div>

        {/* Message content */}
        <div
          className="px-4 py-3 rounded-xl relative select-text"
          style={{
            background: isUser
              ? 'rgba(0,229,255,0.06)'
              : 'rgba(10,16,32,0.70)',
            border: isUser
              ? '1px solid rgba(0,229,255,0.18)'
              : '1px solid rgba(255,255,255,0.06)',
            borderRadius: isUser
              ? '16px 16px 4px 16px'
              : '16px 16px 16px 4px',
            userSelect: 'text',
          }}
        >
          <p
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: '13px',
              lineHeight: 1.65,
              color: '#EAFBFF',
              opacity: isUser ? 0.9 : 0.85,
              margin: 0,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              userSelect: 'text',
            }}
          >
            {message.content}
          </p>
        </div>
      </div>
    </div>
  );
}
