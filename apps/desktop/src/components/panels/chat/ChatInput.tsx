import { useState, useRef, useCallback } from 'react';
import { Send, Square } from 'lucide-react';

interface ChatInputProps {
  onSend: (content: string) => void;
  onAbort: () => void;
  isProcessing: boolean;
}

/**
 * ChatInput
 *
 * Text input for the chat panel.
 *
 * Features:
 *  - Auto-expanding textarea (up to 5 lines)
 *  - Enter to send, Shift+Enter for newline
 *  - Send button / Abort button (switches based on processing state)
 *  - Disabled while processing
 *  - Rezel HUD styling
 */
export default function ChatInput({
  onSend,
  onAbort,
  isProcessing,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isProcessing) return;
    onSend(trimmed);
    setText('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, isProcessing, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const canSend = text.trim().length > 0 && !isProcessing;

  return (
    <div
      className="flex items-end gap-2 px-4 py-3"
      style={{
        borderTop: '1px solid rgba(0,229,255,0.10)',
        background: 'rgba(2,6,18,0.60)',
      }}
    >
      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder="Message Rezel..."
        disabled={isProcessing}
        rows={1}
        className="flex-1 resize-none outline-none"
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: '13px',
          lineHeight: 1.5,
          color: '#EAFBFF',
          background: 'transparent',
          border: 'none',
          padding: '6px 0',
          maxHeight: '120px',
          opacity: isProcessing ? 0.4 : 1,
        }}
      />

      {/* Send / Abort button */}
      {isProcessing ? (
        <button
          onClick={onAbort}
          aria-label="Stop generation"
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-opacity hover:opacity-80 active:scale-95"
          style={{
            background: 'rgba(255,61,113,0.12)',
            border: '1px solid rgba(255,61,113,0.30)',
          }}
        >
          <Square size={14} color="#FF3D71" strokeWidth={2} />
        </button>
      ) : (
        <button
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send message"
          className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-all active:scale-95"
          style={{
            background: canSend ? 'rgba(0,229,255,0.12)' : 'transparent',
            border: canSend
              ? '1px solid rgba(0,229,255,0.30)'
              : '1px solid rgba(255,255,255,0.08)',
            opacity: canSend ? 1 : 0.3,
            cursor: canSend ? 'pointer' : 'default',
          }}
        >
          <Send size={14} color={canSend ? '#00E5FF' : '#7ECFFF'} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
