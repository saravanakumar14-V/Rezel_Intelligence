import { useEffect, useRef } from 'react';
import { MotionEngine } from '../../lib/motion/MotionEngine';
import { X, Maximize2, Cpu, Wrench, Sparkles } from 'lucide-react';
import type { Message } from '../../lib/ai/types';
import type { AgentStatus } from '../../lib/ai/AgentCore';
import { cn } from '../../lib/cn';
import styles from './SpatialResponseCard.module.css';

export interface SpatialResponseCardProps {
  streamingText: string;
  latestMessage: Message | null;
  isProcessing: boolean;
  status: AgentStatus;
  onDismiss: () => void;
  onExpandToChat: () => void;
  activeTool?: string | null;
}

export default function SpatialResponseCard({
  streamingText,
  latestMessage,
  isProcessing,
  status,
  onDismiss,
  onExpandToChat,
  activeTool,
}: SpatialResponseCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // GSAP Entrance animation with automatic cleanup
  useEffect(() => {
    if (containerRef.current) {
      MotionEngine.animateEntrance(containerRef.current, {
        fromY: 16,
        scale: 0.98,
        durationToken: 'standard',
        easeToken: 'out',
      });
    }
    return () => {
      if (containerRef.current) {
        MotionEngine.killTweens(containerRef.current);
      }
    };
  }, []);

  const displayText = streamingText || (latestMessage?.role === 'assistant' ? latestMessage.content : '');

  if (!isProcessing && !displayText && !activeTool) {
    return null;
  }

  const isExecuting = status === 'tool_executing';
  const isThinking = status === 'thinking' || status === 'streaming';

  return (
    <aside
      ref={containerRef}
      className={styles.spatialOverlay}
      role="region"
      aria-label="Rezel Live Intelligence Response"
    >
      <div className={styles.card}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div
              className={cn(
                styles.statusIndicator,
                isThinking && styles.statusIndicatorThinking,
                isExecuting && styles.statusIndicatorExecuting
              )}
            />
            <span className={styles.sourceLabel}>
              {isExecuting ? 'EXECUTING ACTION' : isThinking ? 'REASONING' : 'REZEL INTELLIGENCE'}
            </span>
            <span className={styles.modelBadge}>Gemini 1.5 • Neural Stream</span>
          </div>

          <div className={styles.headerRight}>
            <button
              type="button"
              onClick={onExpandToChat}
              className={styles.iconBtn}
              title="Expand conversation to Full Chat Panel"
              aria-label="Expand to full chat"
            >
              <Maximize2 size={13} />
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className={styles.iconBtn}
              title="Dismiss response overlay"
              aria-label="Dismiss response"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Active Tool Chip if invoking tools */}
        {activeTool && (
          <div className={styles.toolChip}>
            <Wrench size={11} className="text-[#B388FF]" />
            <span>Capability Invoked: <strong>{activeTool}</strong></span>
          </div>
        )}

        {/* Content Body */}
        <div className={styles.contentBody}>
          {displayText ? (
            <>
              {displayText}
              {isProcessing && <span className={styles.streamingCursor} />}
            </>
          ) : (
            <div className="flex items-center gap-2 text-cyan-300/60 font-mono text-xs py-2">
              <Cpu size={14} className="animate-spin text-cyan-400" />
              <span>Synthesizing multi-modal response...</span>
            </div>
          )}
        </div>

        {/* Footer info & quick expand link */}
        <div className={styles.footer}>
          <div className="flex items-center gap-2">
            <Sparkles size={10} className="text-[#00E5FF]" />
            <span>Contextual AI Workspace Layer</span>
          </div>
          <button
            type="button"
            onClick={onExpandToChat}
            className={styles.footerExpandLink}
          >
            VIEW IN CHAT PANEL →
          </button>
        </div>
      </div>
    </aside>
  );
}
