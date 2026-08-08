import { useCallback } from 'react';
import {
  Orbit,
  MessageSquare,
  Zap,
  Brain,
  Settings,
} from 'lucide-react';
import { cn } from '../../lib/cn';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AppMode = 'core' | 'chat' | 'auto' | 'memory' | 'settings';

interface ModeNavProps {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
}

// ─── Mode definitions ─────────────────────────────────────────────────────────

interface ModeEntry {
  id: AppMode;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
}

const MODES: readonly ModeEntry[] = [
  { id: 'core',     label: 'CORE',   icon: Orbit          },
  { id: 'chat',     label: 'CHAT',   icon: MessageSquare  },
  { id: 'auto',     label: 'AUTO',   icon: Zap            },
  { id: 'memory',   label: 'MEM',    icon: Brain          },
  { id: 'settings', label: 'SYS',    icon: Settings       },
];

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * ModeNav
 *
 * Horizontal mode switcher rendered inside the HologramHUD top bar.
 * Five icon+label tabs with an active indicator line.
 *
 * Visual language:
 *  - JetBrains Mono, 9px uppercase, wide letter-spacing
 *  - Cyan accent on active tab, dim on inactive
 *  - No background — blends with the HUD glassmorphism
 *  - pointer-events-auto on each button (parent HUD is pointer-events-none)
 */
export default function ModeNav({ mode, onModeChange }: ModeNavProps) {
  return (
    <nav
      className="flex items-center gap-1"
      role="tablist"
      aria-label="Rezel mode navigation"
    >
      {MODES.map((entry) => (
        <ModeButton
          key={entry.id}
          entry={entry}
          isActive={mode === entry.id}
          onClick={onModeChange}
        />
      ))}
    </nav>
  );
}

// ─── ModeButton ───────────────────────────────────────────────────────────────

function ModeButton({
  entry,
  isActive,
  onClick,
}: {
  entry: ModeEntry;
  isActive: boolean;
  onClick: (mode: AppMode) => void;
}) {
  const Icon = entry.icon;

  const handleClick = useCallback(() => {
    onClick(entry.id);
  }, [onClick, entry.id]);

  return (
    <button
      role="tab"
      aria-selected={isActive}
      aria-label={entry.label}
      onClick={handleClick}
      className={cn(
        'relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg',
        'pointer-events-auto cursor-pointer',
        'transition-all duration-300 ease-out',
        'outline-none focus-visible:ring-1 focus-visible:ring-[#00E5FF]/50',
        isActive
          ? 'opacity-100'
          : 'opacity-40 hover:opacity-70',
      )}
      style={{
        background: isActive ? 'rgba(0,229,255,0.08)' : 'transparent',
        border: isActive ? '1px solid rgba(0,229,255,0.20)' : '1px solid transparent',
      }}
    >
      <Icon
        size={13}
        strokeWidth={isActive ? 2 : 1.5}
        color={isActive ? '#00E5FF' : '#7ECFFF'}
      />
      <span
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '9px',
          letterSpacing: '0.16em',
          color: isActive ? '#00E5FF' : '#7ECFFF',
          fontWeight: isActive ? 600 : 400,
        }}
      >
        {entry.label}
      </span>

      {/* Active indicator line */}
      {isActive && (
        <div
          className="absolute bottom-0 left-2 right-2 h-px"
          style={{ background: 'linear-gradient(90deg, transparent, #00E5FF, transparent)' }}
          aria-hidden
        />
      )}
    </button>
  );
}
