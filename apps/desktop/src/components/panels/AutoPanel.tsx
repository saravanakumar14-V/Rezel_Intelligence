import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Send, Square, ChevronDown, ChevronUp } from 'lucide-react';
import PanelShell from './PanelShell';
import ToolCard from './auto/ToolCard';
import AuditLog from './auto/AuditLog';
import { ToolRegistry } from '../../lib/ai/ToolRegistry';
import { Planner } from '../../lib/ai/Planner';
import { AgentCore } from '../../lib/ai/AgentCore';
import type { PlanStep } from '../../lib/ai/types';
import type { PlanEvent } from '../../lib/ai/Planner';
import type { ToolDefinition } from '../../lib/ai/types';

// ─── Status labels ────────────────────────────────────────────────────────────

type AutoStatus = 'idle' | 'planning' | 'executing' | 'completed' | 'failed' | 'cancelled';

const STATUS_STYLE: Record<AutoStatus, { label: string; color: string }> = {
  idle:       { label: 'STANDBY',    color: '#4BB8F0' },
  planning:   { label: 'PLANNING',   color: '#FFD54F' },
  executing:  { label: 'EXECUTING',  color: '#00E5FF' },
  completed:  { label: 'COMPLETED',  color: '#00FFAE' },
  failed:     { label: 'FAILED',     color: '#FF3D71' },
  cancelled:  { label: 'CANCELLED',  color: '#FF9F1C' },
};

const STEP_COLOR: Record<string, string> = {
  pending:   '#4BB8F0',
  running:   '#00E5FF',
  completed: '#00FFAE',
  failed:    '#FF3D71',
  skipped:   '#FF9F1C',
};

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * AutoPanel
 *
 * Automation operations console exposing:
 *  1. Registered tools (from ToolRegistry)
 *  2. Active task/plan execution with step progress
 *  3. Audit history (from AuditLogger)
 *
 * Execution flow:
 *  Task input → AgentCore.send() → AI generates plan → Planner.execute()
 *  → AIToolExecutor → SecurityToolExecutor → full security pipeline
 *
 * The panel never bypasses the security layer.
 */
export default function AutoPanel() {
  // ── Tool registry ─────────────────────────────────────────────────────────
  const tools = useMemo<ToolDefinition[]>(() => ToolRegistry.getAll(), []);

  // ── Task state ────────────────────────────────────────────────────────────
  const [taskInput, setTaskInput] = useState('');
  const [status, setStatus] = useState<AutoStatus>('idle');
  const [steps, setSteps] = useState<PlanStep[]>([]);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  const abortRef = useRef(false);

  // ── Section collapse ──────────────────────────────────────────────────────
  const [toolsOpen, setToolsOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(true);

  // ── Planner event handler ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (event: PlanEvent) => {
      if (event.type === 'step_start' || event.type === 'step_complete' ||
          event.type === 'step_failed' || event.type === 'step_skipped') {
        // Update step statuses from the plan
        setSteps((prev) => prev.map((s) => {
          if (s.id === event.stepId) {
            return {
              ...s,
              status: event.type === 'step_start' ? 'running'
                : event.type === 'step_complete' ? 'completed'
                : event.type === 'step_failed' ? 'failed'
                : 'skipped',
              result: event.result,
              error: event.error,
            };
          }
          return s;
        }));
      }

      if (event.type === 'plan_complete') {
        setStatus('completed');
        setAuditRefreshKey((k) => k + 1);
      }
      if (event.type === 'plan_failed') {
        setStatus('failed');
        setAuditRefreshKey((k) => k + 1);
      }
    };

    Planner.setEventHandler(handler);
    return () => Planner.setEventHandler(null);
  }, []);

  // ── Run task ──────────────────────────────────────────────────────────────

  const runTask = useCallback(async () => {
    const goal = taskInput.trim();
    if (!goal || status === 'executing' || status === 'planning') return;

    setStatus('planning');
    abortRef.current = false;
    setSteps([]);

    try {
      // Use AgentCore to send the task — the AI will decide tool usage
      const response = await AgentCore.send(goal);

      if (abortRef.current) {
        setStatus('cancelled');
        return;
      }

      // Check if a plan was generated or it was a direct response
      // For now, display the result as completed
      setStatus('completed');
      setAuditRefreshKey((k) => k + 1);

      if (response) {
        // No-op: response was handled through the existing event system
      }
    } catch (err: unknown) {
      if (!abortRef.current) {
        setStatus('failed');
      }
      console.error('[AutoPanel] Task failed:', err);
    }
  }, [taskInput, status]);

  // ── Cancel ────────────────────────────────────────────────────────────────

  const cancelTask = useCallback(() => {
    abortRef.current = true;
    AgentCore.abort();
    setStatus('cancelled');
  }, []);

  // ── Keyboard handler ──────────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runTask();
      }
    },
    [runTask],
  );

  const isActive = status === 'planning' || status === 'executing';
  const statusStyle = STATUS_STYLE[status];

  return (
    <PanelShell
      title="Automation"
      subtitle={statusStyle.label}
    >
      <div className="flex flex-col gap-4 h-full">

        {/* ── Status indicator ─────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background: statusStyle.color,
              boxShadow: isActive ? `0 0 6px ${statusStyle.color}` : 'none',
              animation: isActive ? 'rezel-orb-pulse 1.5s ease-in-out infinite' : 'none',
            }}
          />
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9px',
              letterSpacing: '0.14em',
              color: statusStyle.color,
              opacity: 0.7,
            }}
          >
            {statusStyle.label}
          </span>
        </div>

        {/* ── Task input ───────────────────────────────────────────────── */}
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{
            background: 'rgba(2,6,18,0.60)',
            border: '1px solid rgba(0,229,255,0.10)',
          }}
        >
          <input
            type="text"
            value={taskInput}
            onChange={(e) => setTaskInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe a task..."
            disabled={isActive}
            className="flex-1 outline-none bg-transparent"
            style={{
              fontFamily: 'Inter, sans-serif',
              fontSize: '12px',
              color: '#EAFBFF',
              opacity: isActive ? 0.4 : 1,
            }}
          />
          {isActive ? (
            <button
              onClick={cancelTask}
              aria-label="Cancel task"
              className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md cursor-pointer transition-opacity hover:opacity-80 active:scale-95"
              style={{
                background: 'rgba(255,61,113,0.12)',
                border: '1px solid rgba(255,61,113,0.30)',
              }}
            >
              <Square size={12} color="#FF3D71" strokeWidth={2} />
            </button>
          ) : (
            <button
              onClick={runTask}
              disabled={!taskInput.trim()}
              aria-label="Run task"
              className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md cursor-pointer transition-all active:scale-95"
              style={{
                background: taskInput.trim() ? 'rgba(0,229,255,0.12)' : 'transparent',
                border: taskInput.trim()
                  ? '1px solid rgba(0,229,255,0.30)'
                  : '1px solid rgba(255,255,255,0.08)',
                opacity: taskInput.trim() ? 1 : 0.3,
                cursor: taskInput.trim() ? 'pointer' : 'default',
              }}
            >
              <Send size={12} color={taskInput.trim() ? '#00E5FF' : '#7ECFFF'} strokeWidth={2} />
            </button>
          )}
        </div>

        {/* ── Active plan steps ─────────────────────────────────────────── */}
        {steps.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '8px',
                letterSpacing: '0.16em',
                color: '#00E5FF',
                opacity: 0.5,
              }}
              className="uppercase"
            >
              EXECUTION PLAN
            </span>
            {steps.map((step, i) => (
              <StepRow key={step.id} step={step} index={i} />
            ))}
          </div>
        )}

        {/* ── Scrollable area for collapsible sections ──────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">

          {/* ── Tools section (collapsible) ───────────────────────────── */}
          <CollapsibleSection
            title={`CAPABILITIES (${tools.length})`}
            isOpen={toolsOpen}
            onToggle={() => setToolsOpen((v) => !v)}
          >
            <div className="flex flex-col gap-1.5">
              {tools.map((tool) => (
                <ToolCard key={tool.name} tool={tool} />
              ))}
            </div>
          </CollapsibleSection>

          {/* ── Audit log section (collapsible) ───────────────────────── */}
          <CollapsibleSection
            title="RECENT OPERATIONS"
            isOpen={auditOpen}
            onToggle={() => setAuditOpen((v) => !v)}
          >
            <AuditLog count={15} refreshKey={auditRefreshKey} />
          </CollapsibleSection>
        </div>
      </div>
    </PanelShell>
  );
}

// ─── StepRow ──────────────────────────────────────────────────────────────────

function StepRow({ step, index }: { step: PlanStep; index: number }) {
  const color = STEP_COLOR[step.status] ?? STEP_COLOR.pending;
  const isRunning = step.status === 'running';

  return (
    <div
      className="flex items-start gap-2 px-2.5 py-2 rounded-lg"
      style={{
        background: 'rgba(10,16,32,0.35)',
        border: `1px solid ${color}15`,
      }}
    >
      {/* Step number / status dot */}
      <div
        className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full mt-px"
        style={{
          border: `1px solid ${color}40`,
          background: step.status === 'completed' ? `${color}15` : 'transparent',
        }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '8px',
            color,
            fontWeight: 600,
            animation: isRunning ? 'rezel-orb-pulse 1.2s ease-in-out infinite' : 'none',
          }}
        >
          {step.status === 'completed' ? '✓' : step.status === 'failed' ? '✗' : index + 1}
        </span>
      </div>

      {/* Step info */}
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: '11px',
            color: '#EAFBFF',
            opacity: step.status === 'skipped' ? 0.4 : 0.8,
            lineHeight: 1.4,
          }}
        >
          {step.description}
        </span>
        {step.result && (
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9px',
              color: '#00FFAE',
              opacity: 0.5,
            }}
            className="truncate"
          >
            {step.result}
          </span>
        )}
        {step.error && (
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9px',
              color: '#FF3D71',
              opacity: 0.6,
            }}
          >
            {step.error}
          </span>
        )}
      </div>

      {/* Status label */}
      <span
        className="shrink-0"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '7px',
          letterSpacing: '0.08em',
          color,
          opacity: 0.6,
          textTransform: 'uppercase',
        }}
      >
        {step.status}
      </span>
    </div>
  );
}

// ─── CollapsibleSection ───────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const Icon = isOpen ? ChevronUp : ChevronDown;

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex items-center justify-between w-full py-1.5 cursor-pointer outline-none"
        style={{ background: 'transparent', border: 'none' }}
      >
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '8px',
            letterSpacing: '0.16em',
            color: '#00E5FF',
            opacity: 0.5,
          }}
          className="uppercase"
        >
          {title}
        </span>
        <Icon size={12} color="#4BB8F0" strokeWidth={1.5} style={{ opacity: 0.4 }} />
      </button>
      {isOpen && <div className="mt-1">{children}</div>}
    </div>
  );
}
