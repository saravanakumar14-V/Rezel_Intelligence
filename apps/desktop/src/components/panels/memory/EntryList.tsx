import type { MemoryEntry } from '../../../lib/ai/types';

interface EntryListProps {
  entries: MemoryEntry[];
}

const CATEGORY_COLOR: Record<string, string> = {
  preference: '#00E5FF',
  context:    '#7A5CFF',
  automation: '#FFD54F',
  note:       '#00FFAE',
};

/**
 * EntryList
 *
 * Displays key-value memory entries from LocalMemory.
 * Each entry shows: key, value (truncated), category badge, timestamp.
 */
export default function EntryList({ entries }: EntryListProps) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center py-6 opacity-30">
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            color: '#7ECFFF',
            letterSpacing: '0.12em',
          }}
        >
          NO ENTRIES
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {entries.map((entry) => (
        <EntryRow key={entry.key} entry={entry} />
      ))}
    </div>
  );
}

function EntryRow({ entry }: { entry: MemoryEntry }) {
  const catColor = CATEGORY_COLOR[entry.category] ?? '#4BB8F0';

  return (
    <div
      className="flex flex-col gap-1 px-3 py-2 rounded-lg"
      style={{
        background: 'rgba(10,16,32,0.30)',
        border: '1px solid rgba(255,255,255,0.03)',
      }}
    >
      {/* Key + category */}
      <div className="flex items-center gap-2">
        <span
          className="flex-1 truncate"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '11px',
            color: '#EAFBFF',
            fontWeight: 500,
          }}
        >
          {entry.key}
        </span>
        <span
          className="shrink-0 px-1.5 py-px rounded"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '7px',
            letterSpacing: '0.08em',
            color: catColor,
            background: `${catColor}10`,
            border: `1px solid ${catColor}25`,
            textTransform: 'uppercase',
          }}
        >
          {entry.category}
        </span>
      </div>

      {/* Value */}
      <span
        className="line-clamp-2"
        style={{
          fontFamily: 'Inter, sans-serif',
          fontSize: '11px',
          color: '#7ECFFF',
          opacity: 0.6,
          lineHeight: 1.45,
        }}
      >
        {entry.value}
      </span>

      {/* Timestamp */}
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '8px',
          color: '#4BB8F0',
          opacity: 0.3,
        }}
      >
        {new Date(entry.updatedAt).toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
        })}
      </span>
    </div>
  );
}
