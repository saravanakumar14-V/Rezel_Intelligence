import { useCallback } from 'react';
import { Trash2 } from 'lucide-react';

interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: string;
}

interface ConversationListProps {
  conversations: ConversationSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * ConversationList
 *
 * Scrollable list of stored conversations from LocalMemory.
 * Each row shows title, message count, and relative timestamp.
 * Selected conversation is highlighted with cyan accent.
 * Delete button with confirmation guard (requires double-click).
 */
export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onDelete,
}: ConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 opacity-30">
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            color: '#7ECFFF',
            letterSpacing: '0.12em',
          }}
        >
          NO CONVERSATIONS
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {conversations.map((conv) => (
        <ConversationRow
          key={conv.id}
          conv={conv}
          isSelected={conv.id === selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

// ─── ConversationRow ──────────────────────────────────────────────────────────

function ConversationRow({
  conv,
  isSelected,
  onSelect,
  onDelete,
}: {
  conv: ConversationSummary;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const handleClick = useCallback(() => onSelect(conv.id), [onSelect, conv.id]);

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Simple confirmation via window.confirm
      if (window.confirm(`Delete "${conv.title}"?\n\nThis cannot be undone.`)) {
        onDelete(conv.id);
      }
    },
    [onDelete, conv.id, conv.title],
  );

  const timeAgo = formatRelativeTime(conv.updatedAt);

  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-left w-full cursor-pointer transition-all duration-200 outline-none group"
      style={{
        background: isSelected ? 'rgba(0,229,255,0.08)' : 'rgba(10,16,32,0.30)',
        border: isSelected
          ? '1px solid rgba(0,229,255,0.20)'
          : '1px solid rgba(255,255,255,0.03)',
      }}
    >
      {/* Active indicator */}
      <div
        className="shrink-0 w-1 h-6 rounded-full transition-colors duration-200"
        style={{
          background: isSelected ? '#00E5FF' : 'rgba(255,255,255,0.06)',
        }}
      />

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span
          className="truncate"
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: '12px',
            color: isSelected ? '#EAFBFF' : '#B0D4F1',
            fontWeight: isSelected ? 500 : 400,
          }}
        >
          {conv.title}
        </span>
        <div className="flex items-center gap-2">
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '8px',
              color: '#4BB8F0',
              opacity: 0.4,
            }}
          >
            {conv.messageCount} msg{conv.messageCount !== 1 ? 's' : ''}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '8px',
              color: '#4BB8F0',
              opacity: 0.3,
            }}
          >
            {timeAgo}
          </span>
        </div>
      </div>

      {/* Delete button — visible on hover */}
      <div
        className="shrink-0 opacity-0 group-hover:opacity-60 transition-opacity duration-200"
        onClick={handleDelete}
        role="button"
        aria-label={`Delete ${conv.title}`}
      >
        <Trash2 size={12} color="#FF3D71" strokeWidth={1.5} />
      </div>
    </button>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
