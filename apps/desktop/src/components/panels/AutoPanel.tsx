import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, ChevronUp, Layers, Wrench, ShieldCheck } from 'lucide-react';
import PanelShell from './PanelShell';
import ToolCard from './auto/ToolCard';
import AuditLog from './auto/AuditLog';
import AutonomySessionCard from './auto/AutonomySessionCard';
import SpatialWorkflowGraph from '../hud/SpatialWorkflowGraph';
import { ToolRegistry } from '../../lib/ai/ToolRegistry';
import { AgentCore } from '../../lib/ai/AgentCore';
import { WorkflowRuntime } from '../../lib/ai/WorkflowRuntime';
import type { PlanEvent } from '../../lib/ai/PlanStateMachine';
import type { PlanStep, Workflow } from '../../lib/ai/types';
import type { AgentEvent } from '../../lib/ai/AgentCore';
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function AutoPanel() {
  // ── Tool registry ─────────────────────────────────────────────────────────
  const tools = useMemo<ToolDefinition[]>(() => ToolRegistry.getAll(), []);

  // ── Active Workflow & Plan state ──────────────────────────────────────────
  const [status, setStatus] = useState<AutoStatus>('idle');
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(() => {
    const active = WorkflowRuntime.listActive();
    if (active.length > 0) return active[0];
    const recent = WorkflowRuntime.listRecent();
    return recent.length > 0 ? recent[0] : null;
  });
  const [steps, setSteps] = useState<PlanStep[]>(() => activeWorkflow?.plan?.steps || []);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);

  // ── Section collapse ──────────────────────────────────────────────────────
  const [toolsOpen, setToolsOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  // ── Sync Active Workflow from WorkflowRuntime ─────────────────────────────
  const syncWorkflow = useCallback(() => {
    const active = WorkflowRuntime.listActive();
    if (active.length > 0) {
      setActiveWorkflow(active[0]);
      setSteps(active[0].plan?.steps || []);
      setStatus(
        active[0].status === 'RUNNING' || active[0].status === 'WAITING_FOR_USER'
          ? 'executing'
          : active[0].status === 'SUCCEEDED'
          ? 'completed'
          : active[0].status === 'FAILED'
          ? 'failed'
          : 'cancelled'
      );
    } else {
      const recent = WorkflowRuntime.listRecent();
      if (recent.length > 0) {
        setActiveWorkflow(recent[0]);
        setSteps(recent[0].plan?.steps || []);
      }
    }
  }, []);

  // ── AgentCore event handler ───────────────────────────────────────────────
  useEffect(() => {
    const handler = (event: AgentEvent) => {
      if (event.type === 'stream_tool_call' && event.toolCall) {
        if (event.toolCall.name !== 'create_workflow_plan') {
          setSteps((prev) => [
            ...prev,
            {
              id: event.toolCall!.id,
              description: `Executing ${event.toolCall!.name}`,
              status: 'RUNNING',
              attempts: 1,
              toolName: event.toolCall!.name,
              toolArgs: event.toolCall!.args,
            },
          ]);
          setStatus('executing');
        }
      }

      if (event.type === 'stream_tool_result' && event.toolResult) {
        if (event.toolResult.name !== 'create_workflow_plan') {
          setSteps((prev) =>
            prev.map((s) => {
              if (s.toolName === event.toolResult!.name && s.status === 'RUNNING') {
                return {
                  ...s,
                  status: event.toolResult!.success ? 'COMPLETED' : 'FAILED',
                  result: event.toolResult!.success ? event.toolResult!.output : undefined,
                  error: !event.toolResult!.success ? event.toolResult!.output : undefined,
                };
              }
              return s;
            })
          );
        }
        setAuditRefreshKey((k) => k + 1);
      }

      if (event.type === 'stream_error') {
        setStatus('failed');
      }
    };

    AgentCore.addEventHandler(handler);
    return () => AgentCore.removeEventHandler(handler);
  }, []);

  // ── WorkflowRuntime event handler ─────────────────────────────────────────
  useEffect(() => {
    const handler = (_event: PlanEvent) => {
      syncWorkflow();
      setAuditRefreshKey((k) => k + 1);
    };

    WorkflowRuntime.addEventHandler(handler);
    syncWorkflow();
    return () => WorkflowRuntime.removeEventHandler(handler);
  }, [syncWorkflow]);

  const handleExplainStep = useCallback(async (step: PlanStep) => {
    try {
      await AgentCore.send(`Explain workflow step: "${step.description}" and its current status (${step.status}).`);
    } catch (err) {
      console.error('Failed to explain step:', err);
    }
  }, []);

  const isActive = status === 'planning' || status === 'executing';
  const statusStyle = STATUS_STYLE[status];

  // Synthesize a fallback workflow object if executing direct tools without a plan
  const syntheticWorkflow: Workflow | null = useMemo(() => {
    if (activeWorkflow) return activeWorkflow;
    if (steps.length === 0) return null;
    const nowIso = new Date().toISOString();
    return {
      id: 'active-session-flow',
      status: isActive ? 'RUNNING' : 'SUCCEEDED',
      createdAt: nowIso,
      updatedAt: nowIso,
      plan: {
        id: 'synthetic-plan',
        goal: 'Active Agent Execution Stream',
        steps,
        status: isActive ? 'RUNNING' : 'SUCCEEDED',
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    };
  }, [activeWorkflow, steps, isActive]);

  return (
    <PanelShell
      title="Automation"
      subtitle={statusStyle.label}
    >
      <div className="flex flex-col gap-4 h-full">
        {/* ── Status Indicator ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-2 h-2 rounded-full"
              style={{
                background: statusStyle.color,
                boxShadow: isActive ? `0 0 8px ${statusStyle.color}` : 'none',
                animation: isActive ? 'rezel-orb-pulse 1.5s ease-in-out infinite' : 'none',
              }}
            />
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '10px',
                letterSpacing: '0.14em',
                color: statusStyle.color,
                fontWeight: 700,
              }}
            >
              {statusStyle.label}
            </span>
          </div>

          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9px',
              color: '#7ECFFF',
              opacity: 0.5,
              letterSpacing: '0.08em',
            }}
          >
            LIVING EXECUTION ENGINE
          </span>
        </div>

        {/* ── Scrollable Living Graph & Sections ────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-4 pr-1">
          {/* Autonomous Execution & Safety Observability Card */}
          <AutonomySessionCard />

          {/* Spatial Living Execution Graph */}
          {syntheticWorkflow ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 opacity-60">
                <Layers size={11} className="text-[#00E5FF]" />
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '8.5px',
                    letterSpacing: '0.14em',
                    color: '#00E5FF',
                  }}
                  className="uppercase"
                >
                  Active Task Graph
                </span>
              </div>
              <SpatialWorkflowGraph
                workflow={syntheticWorkflow}
                onExplainStep={handleExplainStep}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-6 rounded-xl border border-white/5 bg-[#060B1E]/40 text-center gap-2">
              <Layers size={20} className="text-[#7ECFFF]/30" />
              <span className="font-mono text-xs text-[#7ECFFF]/60 tracking-wider">
                NO ACTIVE WORKFLOW
              </span>
              <span className="text-[11px] text-white/30 max-w-[220px]">
                Ask Rezel to automate tasks across Blender, files, or system tools.
              </span>
            </div>
          )}

          {/* ── Registered Capabilities Section ──────────────────────────── */}
          <CollapsibleSection
            title={`CAPABILITIES & TOOLS (${tools.length})`}
            icon={<Wrench size={11} className="text-[#7ECFFF]" />}
            isOpen={toolsOpen}
            onToggle={() => setToolsOpen((v) => !v)}
          >
            <div className="flex flex-col gap-1.5">
              {tools.map((tool) => (
                <ToolCard key={tool.name} tool={tool} />
              ))}
            </div>
          </CollapsibleSection>

          {/* ── Audit History Section ──────────────────────────────────── */}
          <CollapsibleSection
            title="SECURITY AUDIT & OPERATIONS"
            icon={<ShieldCheck size={11} className="text-[#00FFAE]" />}
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

// ─── CollapsibleSection ───────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  icon,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const Icon = isOpen ? ChevronUp : ChevronDown;

  return (
    <div className="border border-white/5 rounded-xl bg-[#060B1E]/50 p-2.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between w-full cursor-pointer outline-none bg-transparent border-none"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '9px',
              letterSpacing: '0.14em',
              color: '#7ECFFF',
              fontWeight: 600,
            }}
            className="uppercase"
          >
            {title}
          </span>
        </div>
        <Icon size={12} color="#4BB8F0" strokeWidth={1.5} style={{ opacity: 0.6 }} />
      </button>
      {isOpen && <div className="mt-2.5">{children}</div>}
    </div>
  );
}
