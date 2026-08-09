import { Terminal, HardDrive, Shield, Database, Globe, Cpu } from 'lucide-react';
import type { ToolDefinition, ToolCategory } from '../../../lib/ai/types';
import type { RiskLevel } from '../../../lib/security/PermissionManager';

// ─── Risk styling ─────────────────────────────────────────────────────────────

const RISK_COLOR: Record<RiskLevel, string> = {
  LOW:      '#00E5FF',
  MEDIUM:   '#FFD54F',
  HIGH:     '#FF9F1C',
  CRITICAL: '#FF3D71',
};

// ─── Category icons ───────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<ToolCategory, React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>> = {
  system:  Cpu,
  memory:  Database,
  file:    HardDrive,
  shell:   Terminal,
  network: Globe,
  ai:      Shield,
};

// ─── Component ────────────────────────────────────────────────────────────────

interface ToolCardProps {
  tool: ToolDefinition;
}

/**
 * ToolCard
 *
 * Compact display of a single registered tool.
 * Shows: category icon, name, description, risk badge, parameter count.
 *
 * Read-only — this card is informational. Execution is initiated through
 * the task input, not by clicking individual tools.
 */
export default function ToolCard({ tool }: ToolCardProps) {
  const Icon = CATEGORY_ICON[tool.category] ?? Terminal;
  const riskColor = RISK_COLOR[tool.risk] ?? RISK_COLOR.MEDIUM;
  const paramCount = Object.keys(tool.parameters).length;

  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors duration-200"
      style={{
        background: 'rgba(10,16,32,0.40)',
        border: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      {/* Category icon */}
      <div
        className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md mt-0.5"
        style={{
          background: 'rgba(0,229,255,0.06)',
          border: '1px solid rgba(0,229,255,0.10)',
        }}
      >
        <Icon size={13} color="#00E5FF" strokeWidth={1.5} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        {/* Name + risk badge */}
        <div className="flex items-center gap-2">
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11px',
              color: '#EAFBFF',
              fontWeight: 600,
            }}
            className="truncate"
          >
            {tool.name}
          </span>
          <span
            className="shrink-0 px-1.5 py-px rounded"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '8px',
              letterSpacing: '0.10em',
              color: riskColor,
              background: `${riskColor}12`,
              border: `1px solid ${riskColor}30`,
              fontWeight: 600,
            }}
          >
            {tool.risk}
          </span>
        </div>

        {/* Description */}
        <span
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: '11px',
            color: '#7ECFFF',
            opacity: 0.6,
            lineHeight: 1.45,
          }}
          className="line-clamp-2"
        >
          {tool.description}
        </span>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-0.5">
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '8px',
              color: '#4BB8F0',
              opacity: 0.45,
              letterSpacing: '0.10em',
            }}
          >
            {tool.category.toUpperCase()}
          </span>
          {paramCount > 0 && (
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '8px',
                color: '#4BB8F0',
                opacity: 0.35,
              }}
            >
              {paramCount} param{paramCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
