import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  Square,
  RefreshCw,
  HelpCircle,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Wrench,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import InspectorShell from './InspectorShell';
import SpatialWorkflowGraph from '../hud/SpatialWorkflowGraph';
import ToolCard from '../panels/auto/ToolCard';
import AuditLog from '../panels/auto/AuditLog';
import { ToolRegistry } from '../../lib/ai/ToolRegistry';
import { AgentCore } from '../../lib/ai/AgentCore';
import { WorkflowRuntime } from '../../lib/ai/WorkflowRuntime';
import type { PlanEvent } from '../../lib/ai/PlanStateMachine';
import type { PlanStep, Workflow } from '../../lib/ai/types';
import type { ToolDefinition } from '../../lib/ai/types';
import { cn } from '../../lib/cn';
import styles from './WorkflowInspector.module.css';

interface WorkflowInspectorProps {
  onClose?: () => void;
}

export default function WorkflowInspector({ onClose }: WorkflowInspectorProps) {
  const tools = useMemo<ToolDefinition[]>(() => ToolRegistry.getAll(), []);

  const [activeWorkflows, setActiveWorkflows] = useState<Workflow[]>(() => WorkflowRuntime.listActive());
  const [recentWorkflows, setRecentWorkflows] = useState<Workflow[]>(() => WorkflowRuntime.listRecent());
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(() => {
    const active = WorkflowRuntime.listActive();
    if (active.length > 0) return active[0].id;
    const recent = WorkflowRuntime.listRecent();
    return recent.length > 0 ? recent[0].id : null;
  });

  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);

  const [toolsOpen, setToolsOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  const syncWorkflows = useCallback(() => {
    const active = WorkflowRuntime.listActive();
    const recent = WorkflowRuntime.listRecent();
    setActiveWorkflows(active);
    setRecentWorkflows(recent);

    // Keep selected workflow ID valid
    setSelectedWorkflowId((prevId) => {
      if (prevId && (active.some((w) => w.id === prevId) || recent.some((w) => w.id === prevId))) {
        return prevId;
      }
      return active[0]?.id || recent[0]?.id || null;
    });
  }, []);

  useEffect(() => {
    syncWorkflows();
    const handler = (_event: PlanEvent) => {
      syncWorkflows();
      setAuditRefreshKey((k) => k + 1);
    };

    WorkflowRuntime.addEventHandler(handler);
    return () => WorkflowRuntime.removeEventHandler(handler);
  }, [syncWorkflows]);

  const allWorkflows = useMemo(() => {
    const list: Workflow[] = [...activeWorkflows];
    for (const r of recentWorkflows) {
      if (!list.some((w) => w.id === r.id)) {
        list.push(r);
      }
    }
    return list;
  }, [activeWorkflows, recentWorkflows]);

  const currentWorkflow = useMemo(() => {
    return allWorkflows.find((w) => w.id === selectedWorkflowId) || allWorkflows[0] || null;
  }, [allWorkflows, selectedWorkflowId]);

  const steps = currentWorkflow?.plan?.steps || [];
  const activeStep = useMemo(() => {
    if (selectedStepId) {
      const found = steps.find((s) => s.id === selectedStepId);
      if (found) return found;
    }
    return steps.find((s) => s.status === 'RUNNING') || steps.find((s) => s.status === 'FAILED') || steps[0] || null;
  }, [steps, selectedStepId]);

  const activeStepIdx = steps.findIndex((s) => s.id === activeStep?.id);
  const stepCount = steps.length || 1;
  const currentStepNum = activeStepIdx >= 0 ? activeStepIdx + 1 : 1;

  const isRunning = currentWorkflow?.status === 'RUNNING';
  const isPaused = currentWorkflow?.status === 'PAUSED';
  const isFailed = currentWorkflow?.status === 'FAILED';
  const isVerified = currentWorkflow?.status === 'SUCCEEDED';
  const isWaitingUser = currentWorkflow?.status === 'WAITING_FOR_USER';

  const handlePauseResume = () => {
    if (!currentWorkflow) return;
    if (isRunning) {
      WorkflowRuntime.pause(currentWorkflow.id);
    } else if (isPaused) {
      WorkflowRuntime.resume(currentWorkflow.id);
    }
    syncWorkflows();
  };

  const handleCancel = () => {
    if (!currentWorkflow) return;
    WorkflowRuntime.cancel(currentWorkflow.id);
    syncWorkflows();
  };

  const handleRetry = () => {
    if (!currentWorkflow) return;
    WorkflowRuntime.resumeWorkflow(currentWorkflow.id).catch(() => {
      WorkflowRuntime.resume(currentWorkflow.id);
    });
    syncWorkflows();
  };

  const handleExplainStep = useCallback(async (step: PlanStep) => {
    try {
      await AgentCore.send(`Explain workflow step: "${step.description}" and its current status (${step.status}).`);
    } catch (err) {
      console.error('Failed to explain step:', err);
    }
  }, []);

  const getBeaconClass = () => {
    if (isRunning) return styles.stateBeaconRunning;
    if (isFailed) return styles.stateBeaconFailed;
    if (isVerified) return styles.stateBeaconVerified;
    return styles.stateBeacon;
  };

  const getStatusColor = () => {
    if (isRunning) return '#00E5FF';
    if (isFailed) return '#FF5252';
    if (isVerified) return '#00E676';
    if (isPaused) return '#FFD54F';
    return '#7ECFFF';
  };

  return (
    <InspectorShell
      title="Workflow Intelligence"
      subtitle={currentWorkflow ? `Goal: ${currentWorkflow.plan?.goal?.slice(0, 30)}...` : 'Real-time Execution Engine'}
      onClose={onClose}
    >
      <div className={styles.workflowRoot}>
        {/* ── Multi-Workflow Switcher Strip (if > 1 workflow) ───────── */}
        {allWorkflows.length > 1 && (
          <div className={styles.workflowSwitcher}>
            {allWorkflows.map((wf, idx) => {
              const isSelected = wf.id === currentWorkflow?.id;
              const isWfRunning = wf.status === 'RUNNING';
              return (
                <button
                  key={wf.id}
                  type="button"
                  onClick={() => {
                    setSelectedWorkflowId(wf.id);
                    setSelectedStepId(null);
                  }}
                  className={cn(
                    styles.switcherPill,
                    isSelected && styles.switcherPillActive
                  )}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      background: isWfRunning ? '#00E5FF' : wf.status === 'SUCCEEDED' ? '#00E676' : '#7ECFFF',
                    }}
                  />
                  <span>
                    #{idx + 1}: {wf.plan?.goal?.slice(0, 18) || 'Task'}...
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Main View (if workflow exists) ───────────────────────── */}
        {currentWorkflow ? (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 pr-1">
            {/* ── Hero Goal Card ────────────────────────────────────── */}
            <div className={styles.heroCard}>
              <div className={styles.heroHeader}>
                <div className={styles.heroStatusGroup}>
                  <span className={cn(styles.stateBeacon, getBeaconClass())} />
                  <span className={styles.statusLabel} style={{ color: getStatusColor() }}>
                    {isWaitingUser ? 'WAITING FOR APPROVAL' : currentWorkflow.status}
                  </span>
                </div>

                <span className={styles.progressBadge}>
                  STEP {currentStepNum}/{stepCount}
                </span>
              </div>

              <span className={styles.goalTitle}>
                {currentWorkflow.plan?.goal || 'Multi-step Agent Automation'}
              </span>

              <div className={styles.heroMetaRow}>
                <span>CREATED {new Date(currentWorkflow.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span className={styles.appTag}>BLENDER & SYSTEM AUTOMATION</span>
              </div>
            </div>

            {/* ── Active / Selected Step Deep Focus ─────────────────── */}
            {activeStep && (
              <div className={styles.activeStepCard}>
                <div className={styles.stepHeaderRow}>
                  <div className="flex items-center gap-2">
                    <span className={styles.stepIndexBadge}>
                      STEP {currentStepNum}
                    </span>
                    <span className={styles.stepActionName}>
                      {activeStep.description}
                    </span>
                  </div>

                  {activeStep.toolName && (
                    <span className="font-mono text-[8px] font-bold text-[#B388FF] bg-[#B388FF]/15 px-2 py-0.5 rounded border border-[#B388FF]/30">
                      {activeStep.toolName}
                    </span>
                  )}
                </div>

                {/* Sanitized Live Parameters */}
                {activeStep.toolArgs && Object.keys(activeStep.toolArgs).length > 0 && (
                  <div className={styles.paramBox}>
                    {JSON.stringify(activeStep.toolArgs, null, 2)}
                  </div>
                )}

                {/* Verification Indicator */}
                <div className="flex items-center justify-between pt-1">
                  {activeStep.verificationResult === 'VERIFIED' ? (
                    <div className={cn(styles.verificationPill, styles.verified)}>
                      <CheckCircle2 size={11} />
                      <span>RESULT VERIFIED BY ENGINE</span>
                    </div>
                  ) : activeStep.verificationResult === 'NOT_VERIFIED' ? (
                    <div className={cn(styles.verificationPill, styles.unverified)}>
                      <AlertTriangle size={11} />
                      <span>EXECUTION COMPLETE — RESULT UNVERIFIED</span>
                    </div>
                  ) : activeStep.status === 'FAILED' ? (
                    <div className={cn(styles.verificationPill, styles.failed)}>
                      <ShieldAlert size={11} />
                      <span>STEP EXECUTION FAULT</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 font-mono text-[8px] text-[#7ECFFF]/60">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-pulse" />
                      <span>OBSERVING RUNTIME STATE...</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => handleExplainStep(activeStep)}
                    className="flex items-center gap-1 font-mono text-[8px] text-[#00E5FF] hover:underline cursor-pointer"
                  >
                    <HelpCircle size={10} />
                    <span>EXPLAIN STEP</span>
                  </button>
                </div>
              </div>
            )}

            {/* ── Failure & Recovery Diagnostic Card (if failed) ───── */}
            {(isFailed || activeStep?.status === 'FAILED') && (
              <div className={styles.recoveryCard}>
                <div className={styles.recoveryHeader}>
                  <ShieldAlert size={12} />
                  <span>DIAGNOSTIC & RECOVERY GUIDANCE</span>
                </div>

                <span className={styles.recoveryReason}>
                  {activeStep?.error || 'Step execution encountered an unhandled fault. Safety policy preserved existing workspace state.'}
                </span>

                <span className={styles.recoveryActionText}>
                  Rezel recommends: Retry with alternate provider parameters or inspect tool capabilities below.
                </span>
              </div>
            )}

            {/* ── Interactive Step Flow Graph ──────────────────────── */}
            <div className="flex flex-col gap-1.5 mt-1">
              <div className="flex items-center gap-1.5 opacity-60">
                <Layers size={10} className="text-[#00E5FF]" />
                <span className="font-mono text-[8px] uppercase tracking-wider text-[#00E5FF]">
                  EXECUTION TOPOLOGY GRAPH
                </span>
              </div>

              <SpatialWorkflowGraph
                workflow={currentWorkflow}
                onSelectStep={(step) => setSelectedStepId(step.id)}
                onExplainStep={handleExplainStep}
              />
            </div>

            {/* ── Registered Tools Collapsible Drawer ───────────────── */}
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

            {/* ── Operations Audit Collapsible Drawer ───────────────── */}
            <CollapsibleSection
              title="SECURITY & OPERATIONS AUDIT"
              icon={<ShieldCheck size={11} className="text-[#00FFAE]" />}
              isOpen={auditOpen}
              onToggle={() => setAuditOpen((v) => !v)}
            >
              <AuditLog count={15} refreshKey={auditRefreshKey} />
            </CollapsibleSection>
          </div>
        ) : (
          /* ── Empty State ─────────────────────────────────────────── */
          <div className={styles.emptyState}>
            <Layers size={28} className="text-[#7ECFFF]/30" />
            <span className="font-mono text-xs text-[#7ECFFF]/70 font-semibold tracking-wider">
              NO ACTIVE WORKFLOWS
            </span>
            <span className="text-xs text-white/40 max-w-[240px]">
              Ask Rezel to automate complex tasks across Blender, 3D scenes, files, or local models.
            </span>
          </div>
        )}

        {/* ── Primary Action Controls ──────────────────────────────── */}
        {currentWorkflow && (
          <div className={styles.controlRow}>
            {(isRunning || isPaused) && (
              <button
                type="button"
                onClick={handlePauseResume}
                className={cn(styles.btnAction, styles.btnPrimary)}
              >
                {isRunning ? <Pause size={12} /> : <Play size={12} />}
                <span>{isRunning ? 'PAUSE WORKFLOW' : 'RESUME WORKFLOW'}</span>
              </button>
            )}

            {isFailed && (
              <button
                type="button"
                onClick={handleRetry}
                className={cn(styles.btnAction, styles.btnPrimary)}
              >
                <RefreshCw size={12} />
                <span>RETRY WORKFLOW</span>
              </button>
            )}

            {(isRunning || isPaused || isWaitingUser) && (
              <button
                type="button"
                onClick={handleCancel}
                className={cn(styles.btnAction, styles.btnDanger)}
              >
                <Square size={12} />
                <span>CANCEL WORKFLOW</span>
              </button>
            )}

            {activeStep && (
              <button
                type="button"
                onClick={() => handleExplainStep(activeStep)}
                className={cn(styles.btnAction, styles.btnSecondary)}
              >
                <HelpCircle size={12} />
                <span>EXPLAIN</span>
              </button>
            )}
          </div>
        )}
      </div>
    </InspectorShell>
  );
}

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
