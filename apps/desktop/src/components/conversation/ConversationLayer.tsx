import { useState, useRef, useEffect } from 'react';
import { X, Maximize2, Minimize2, Cpu, Wrench, Sparkles, Plus, History } from 'lucide-react';
import MessageList from '../panels/chat/MessageList';
import ChatInput from '../panels/chat/ChatInput';
import { MotionEngine } from '../../lib/motion/MotionEngine';
import type { UseChatReturn } from '../../hooks/useChat';
import type { InspectorId } from '../../types/navigation';
import { cn } from '../../lib/cn';
import styles from './ConversationLayer.module.css';

export interface ConversationLayerProps {
  chat: UseChatReturn;
  activeTool?: string | null;
  isDismissed?: boolean;
  onDismiss?: () => void;
  onOpenInspector?: (id: InspectorId) => void;
  className?: string;
}

export default function ConversationLayer({
  chat,
  activeTool,
  isDismissed = false,
  onDismiss,
  onOpenInspector,
  className,
}: ConversationLayerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const { messages, streamingText, isProcessing, status, send, abort, newConversation } = chat;

  const latestMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const displayText =
    streamingText || (latestMessage?.role === 'assistant' ? latestMessage.content : '');

  // Animate entrance on mount / visibility
  useEffect(() => {
    if (containerRef.current && (!isDismissed || isProcessing)) {
      MotionEngine.animateEntrance(containerRef.current, {
        fromY: 16,
        scale: 0.98,
        durationToken: 'standard',
        easeToken: 'out',
      });
    }
  }, [isDismissed, isProcessing]);

  // If dismissed and not processing, or if there is no conversation yet, hide
  if (isDismissed && !isProcessing) {
    return null;
  }

  if (!isProcessing && !displayText && !activeTool && messages.length === 0) {
    return null;
  }

  const isExecuting = status === 'tool_executing';
  const isThinking = status === 'thinking' || status === 'streaming';

  return (
    <aside
      ref={containerRef}
      className={cn(
        styles.layerRoot,
        isExpanded ? styles.layerExpanded : styles.layerCompact,
        className
      )}
      role="region"
      aria-label="Rezel Ambient Conversation"
    >
      {isExpanded ? (
        /* ── EXPANDED FULL CONVERSATION VIEW ── */
        <div className={styles.expandedPanel}>
          {/* Expanded Header */}
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <div
                className={cn(
                  styles.statusDot,
                  isThinking && styles.statusDotThinking,
                  isExecuting && styles.statusDotExecuting
                )}
              />
              <span className={styles.sourceLabel}>
                {isExecuting ? 'EXECUTING ACTION' : isThinking ? 'REASONING' : 'CONVERSATION'}
              </span>
            </div>

            <div className={styles.headerRight}>
              <button
                type="button"
                onClick={newConversation}
                disabled={isProcessing}
                className={styles.iconBtn}
                title="Start a new conversation"
                aria-label="New conversation"
              >
                <Plus size={13} />
              </button>
              <button
                type="button"
                onClick={() => onOpenInspector?.('conversations')}
                className={styles.iconBtn}
                title="View all conversation transcripts"
                aria-label="View transcripts"
              >
                <History size={13} />
              </button>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className={styles.iconBtn}
                title="Contract to compact response card"
                aria-label="Contract to compact card"
              >
                <Minimize2 size={13} />
              </button>
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className={styles.iconBtn}
                  title="Dismiss conversation overlay"
                  aria-label="Dismiss"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Active Tool Chip */}
          {activeTool && (
            <div className={styles.toolChip}>
              <Wrench size={11} className="text-[#B388FF]" />
              <span>Capability: <strong>{activeTool}</strong></span>
            </div>
          )}

          {/* Expanded Message List */}
          <div className={styles.expandedBody}>
            <MessageList
              messages={messages}
              streamingText={streamingText}
              isProcessing={isProcessing}
            />
          </div>

          {/* Input at bottom */}
          <div className="p-3 border-t border-white/10 bg-[#060B1E]/90">
            <ChatInput
              onSend={send}
              onAbort={abort}
              isProcessing={isProcessing}
            />
          </div>
        </div>
      ) : (
        /* ── COMPACT AMBIENT RESPONSE VIEW ── */
        <div className={styles.compactCard}>
          {/* Compact Header */}
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <div
                className={cn(
                  styles.statusDot,
                  isThinking && styles.statusDotThinking,
                  isExecuting && styles.statusDotExecuting
                )}
              />
              <span className={styles.sourceLabel}>
                {isExecuting ? 'EXECUTING ACTION' : isThinking ? 'REASONING' : 'REZEL INTELLIGENCE'}
              </span>
            </div>

            <div className={styles.headerRight}>
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className={styles.iconBtn}
                title="Expand to full conversation panel"
                aria-label="Expand conversation"
              >
                <Maximize2 size={13} />
              </button>
              {onDismiss && (
                <button
                  type="button"
                  onClick={onDismiss}
                  className={styles.iconBtn}
                  title="Dismiss response card"
                  aria-label="Dismiss"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Active Tool Chip */}
          {activeTool && (
            <div className={styles.toolChip}>
              <Wrench size={11} className="text-[#B388FF]" />
              <span>Capability Invoked: <strong>{activeTool}</strong></span>
            </div>
          )}

          {/* Text Body */}
          <div className={styles.compactBody}>
            {displayText ? (
              <>
                {displayText}
                {isProcessing && <span className={styles.streamingCursor} />}
              </>
            ) : (
              <div className="flex items-center gap-2 text-cyan-300/60 font-mono text-xs py-2">
                <Cpu size={14} className="animate-spin text-cyan-400" />
                <span>Synthesizing multi-modal reasoning...</span>
              </div>
            )}
          </div>

          {/* Compact Footer */}
          <div className={styles.compactFooter}>
            <div className="flex items-center gap-1.5 opacity-60">
              <Sparkles size={10} className="text-[#00E5FF]" />
              <span>Ambient Intelligence Layer</span>
            </div>
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className={styles.expandLink}
            >
              VIEW FULL THREAD →
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
