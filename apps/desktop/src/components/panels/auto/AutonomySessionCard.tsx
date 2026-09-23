import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  Cpu,
  Clock,
  Coins,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileCheck,
  PauseCircle,
  RefreshCw,
  Search,
  Zap,
  Layers,
  FileText
} from 'lucide-react';
import { AutonomySupervisor, type AutonomySessionInfo } from '../../../lib/ai/autonomy/AutonomySupervisor';
import type {
  AutonomyState,
  AutonomyEvent,
  AuditableDecision,
  AutonomyArtifact,
  SafetyBudget,
  AutonomyResult
} from '../../../lib/ai/autonomy/types';

// ── State Badges & Themes ───────────────────────────────────────────────────

export const AUTONOMY_STATE_CONFIG: Record<
  AutonomyState,
  { label: string; color: string; bg: string; border: string; icon: React.ComponentType<{ size?: number; className?: string }> }
> = {
  IDLE: {
    label: 'STANDBY',
    color: '#7ECFFF',
    bg: 'rgba(126, 207, 255, 0.08)',
    border: 'rgba(126, 207, 255, 0.2)',
    icon: Activity,
  },
  ANALYZING_GOAL: {
    label: 'ANALYZING GOAL',
    color: '#FFD54F',
    bg: 'rgba(255, 213, 79, 0.08)',
    border: 'rgba(255, 213, 79, 0.25)',
    icon: Search,
  },
  FORMULATING_BOUNDED_PLAN: {
    label: 'FORMULATING BOUNDED PLAN',
    color: '#00E5FF',
    bg: 'rgba(0, 229, 255, 0.08)',
    border: 'rgba(0, 229, 255, 0.25)',
    icon: Layers,
  },
  AWAITING_BUDGET_APPROVAL: {
    label: 'AWAITING BUDGET APPROVAL',
    color: '#FF9F1C',
    bg: 'rgba(255, 159, 28, 0.08)',
    border: 'rgba(255, 159, 28, 0.25)',
    icon: AlertTriangle,
  },
  EXECUTING: {
    label: 'EXECUTING BOUNDED OPS',
    color: '#00E5FF',
    bg: 'rgba(0, 229, 255, 0.12)',
    border: 'rgba(0, 229, 255, 0.35)',
    icon: Zap,
  },
  OBSERVING_STATE: {
    label: 'OBSERVING APP STATE',
    color: '#B388FF',
    bg: 'rgba(179, 136, 255, 0.08)',
    border: 'rgba(179, 136, 255, 0.25)',
    icon: Activity,
  },
  CORRECTION_REQUIRED: {
    label: 'CORRECTION REQUIRED',
    color: '#FF9F1C',
    bg: 'rgba(255, 159, 28, 0.1)',
    border: 'rgba(255, 159, 28, 0.3)',
    icon: RefreshCw,
  },
  EVALUATING_POLICY: {
    label: 'EVALUATING SECURITY POLICY',
    color: '#00FFAE',
    bg: 'rgba(0, 255, 174, 0.08)',
    border: 'rgba(0, 255, 174, 0.25)',
    icon: ShieldCheck,
  },
  EXECUTING_CORRECTION: {
    label: 'EXECUTING BOUNDED CORRECTION',
    color: '#FF9F1C',
    bg: 'rgba(255, 159, 28, 0.12)',
    border: 'rgba(255, 159, 28, 0.35)',
    icon: RefreshCw,
  },
  ESCALATING_TO_USER: {
    label: 'ESCALATING TO USER',
    color: '#FF3D71',
    bg: 'rgba(255, 61, 113, 0.1)',
    border: 'rgba(255, 61, 113, 0.3)',
    icon: AlertTriangle,
  },
  PAUSED: {
    label: 'PAUSED',
    color: '#FFD54F',
    bg: 'rgba(255, 213, 79, 0.08)',
    border: 'rgba(255, 213, 79, 0.25)',
    icon: PauseCircle,
  },
  GOAL_MET: {
    label: 'GOAL MET',
    color: '#00FFAE',
    bg: 'rgba(0, 255, 174, 0.12)',
    border: 'rgba(0, 255, 174, 0.35)',
    icon: CheckCircle2,
  },
  BUDGET_EXHAUSTED: {
    label: 'SAFETY BUDGET EXHAUSTED',
    color: '#FF3D71',
    bg: 'rgba(255, 61, 113, 0.12)',
    border: 'rgba(255, 61, 113, 0.35)',
    icon: ShieldAlert,
  },
  ABORTED: {
    label: 'EMERGENCY ABORTED',
    color: '#FF3D71',
    bg: 'rgba(255, 61, 113, 0.15)',
    border: 'rgba(255, 61, 113, 0.4)',
    icon: XCircle,
  },
  UNSUPPORTED_GOAL: {
    label: 'UNSUPPORTED GOAL',
    color: '#FF3D71',
    bg: 'rgba(255, 61, 113, 0.1)',
    border: 'rgba(255, 61, 113, 0.3)',
    icon: AlertTriangle,
  },
};

export default function AutonomySessionCard() {
  const [activeSession, setActiveSession] = useState<AutonomySessionInfo | null>(() => {
    const active = AutonomySupervisor.listActiveSessions();
    if (active.length > 0) return active[0];
    const recent = AutonomySupervisor.getRecentSessions();
    return recent.length > 0 ? recent[0] : null;
  });

  const [currentState, setCurrentState] = useState<AutonomyState>(activeSession?.state || 'IDLE');
  const [currentBudget, setCurrentBudget] = useState<SafetyBudget | null>(null);
  const [decisions, setDecisions] = useState<AuditableDecision[]>([]);
  const [artifacts, setArtifacts] = useState<AutonomyArtifact[]>([]);
  const [latestResult, setLatestResult] = useState<AutonomyResult | null>(activeSession?.result || null);

  useEffect(() => {
    const handler = (event: AutonomyEvent) => {
      if (event.type === 'session_started') {
        setActiveSession({
          sessionId: event.sessionId,
          goal: event.goal!,
          state: event.state || 'IDLE',
          startTime: event.timestamp,
          updatedAt: event.timestamp,
        });
        setCurrentState(event.state || 'IDLE');
        if (event.budget) setCurrentBudget(event.budget);
        setDecisions([]);
        setArtifacts([]);
        setLatestResult(null);
      } else if (event.type === 'state_changed') {
        setCurrentState(event.state || 'IDLE');
        if (event.budget) setCurrentBudget(event.budget);
      } else if (event.type === 'decision_logged' && event.decision) {
        setDecisions((prev) => [...prev, event.decision!]);
      } else if (event.type === 'artifact_produced' && event.artifact) {
        setArtifacts((prev) => [...prev, event.artifact!]);
      } else if (event.type === 'session_completed' && event.result) {
        setCurrentState(event.result.state);
        setLatestResult(event.result);
        setDecisions(event.result.decisions);
        setArtifacts(event.result.outputArtifacts);
        setCurrentBudget(event.result.budget);
      }
    };

    AutonomySupervisor.addEventHandler(handler);
    return () => AutonomySupervisor.removeEventHandler(handler);
  }, []);

  const config = AUTONOMY_STATE_CONFIG[currentState] || AUTONOMY_STATE_CONFIG.IDLE;
  const StateIcon = config.icon;

  return (
    <div
      className="flex flex-col gap-3 p-3.5 rounded-xl border transition-all duration-300"
      style={{
        backgroundColor: '#060B1E',
        borderColor: config.border,
      }}
    >
      {/* ── Header State Banner ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center w-7 h-7 rounded-lg"
            style={{ backgroundColor: config.bg, color: config.color, border: `1px solid ${config.border}` }}
          >
            <StateIcon size={14} className={currentState === 'EXECUTING' || currentState === 'ANALYZING_GOAL' ? 'animate-pulse' : ''} />
          </div>
          <div>
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '10.5px',
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: config.color,
              }}
            >
              {config.label}
            </div>
            <div className="text-[9.5px] font-mono text-[#7ECFFF]/60">
              {activeSession ? `SESSION: ${activeSession.sessionId.slice(0, 16)}...` : 'NO ACTIVE AUTONOMOUS SESSION'}
            </div>
          </div>
        </div>

        {latestResult && (
          <span
            className="text-[9px] font-mono px-2 py-0.5 rounded border"
            style={{
              borderColor: latestResult.success ? 'rgba(0, 255, 174, 0.3)' : 'rgba(255, 61, 113, 0.3)',
              color: latestResult.success ? '#00FFAE' : '#FF3D71',
              backgroundColor: latestResult.success ? 'rgba(0, 255, 174, 0.08)' : 'rgba(255, 61, 113, 0.08)',
            }}
          >
            {latestResult.classification}
          </span>
        )}
      </div>

      {/* ── Goal Description ──────────────────────────────────────────────── */}
      {activeSession?.goal && (
        <div className="p-2.5 rounded-lg border border-white/5 bg-[#0A122C]/60 flex flex-col gap-1">
          <div className="text-[9px] font-mono text-[#7ECFFF]/70 uppercase tracking-wider flex items-center justify-between">
            <span>Target Goal</span>
            {activeSession.goal.targetApplication && (
              <span className="text-[#00E5FF] px-1.5 py-0.2 rounded bg-[#00E5FF]/10">
                APP: {activeSession.goal.targetApplication.toUpperCase()}
              </span>
            )}
          </div>
          <div className="text-xs text-white/90 font-medium">
            {activeSession.goal.rawQuery}
          </div>
        </div>
      )}

      {/* ── Safety Budget Gauges ───────────────────────────────────────────── */}
      {currentBudget && (
        <div className="grid grid-cols-4 gap-1.5">
          <BudgetGauge
            label="OPS"
            used={currentBudget.operationsUsed}
            max={currentBudget.maxOperations}
            icon={<Cpu size={10} className="text-[#00E5FF]" />}
          />
          <BudgetGauge
            label="CORRECT"
            used={currentBudget.correctionsUsed}
            max={currentBudget.maxCorrections}
            icon={<RefreshCw size={10} className="text-[#FF9F1C]" />}
          />
          <BudgetGauge
            label="TOKENS"
            used={currentBudget.tokensUsed}
            max={currentBudget.maxTokens}
            icon={<Coins size={10} className="text-[#FFD54F]" />}
          />
          <BudgetGauge
            label="TIME"
            used={Math.round(currentBudget.durationMs / 1000)}
            max={Math.round(currentBudget.maxDurationMs / 1000)}
            unit="s"
            icon={<Clock size={10} className="text-[#B388FF]" />}
          />
        </div>
      )}

      {/* ── Output Artifacts ──────────────────────────────────────────────── */}
      {artifacts.length > 0 && (
        <div className="flex flex-col gap-1.5 p-2 rounded-lg border border-white/5 bg-[#0A122C]/40">
          <div className="text-[9px] font-mono text-[#00FFAE] tracking-wider uppercase flex items-center gap-1.5">
            <FileCheck size={11} />
            <span>Verified Output Artifacts ({artifacts.length})</span>
          </div>
          <div className="flex flex-col gap-1">
            {artifacts.map((art, idx) => (
              <div key={idx} className="flex items-center justify-between p-1.5 rounded bg-white/5 text-[10px]">
                <div className="flex items-center gap-1.5 truncate">
                  <FileText size={11} className="text-[#7ECFFF]" />
                  <span className="text-white/80 font-mono truncate">{art.name}</span>
                </div>
                {art.uri && (
                  <span className="text-[9px] font-mono text-[#7ECFFF]/60 px-1.5 py-0.5 rounded bg-black/30">
                    {art.type}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Auditable Structured Decision Feed (NO Chain of Thought) ──────── */}
      {decisions.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[9px] font-mono text-[#7ECFFF]/70 tracking-wider uppercase flex items-center justify-between">
            <span>Auditable Decision Trace ({decisions.length})</span>
            <span className="text-[8px] text-[#00FFAE]/70 font-mono">ZERO COT EXPOSURE</span>
          </div>
          <div className="max-h-40 overflow-y-auto flex flex-col gap-1.5 pr-1">
            {decisions.slice(-6).reverse().map((dec) => (
              <div
                key={dec.id}
                className="p-2 rounded-lg border border-white/5 bg-[#0A122C]/70 text-[10.5px] flex flex-col gap-1"
              >
                <div className="flex items-center justify-between font-mono text-[9px]">
                  <span className="text-[#00E5FF]">{dec.decisionType}</span>
                  <span className="text-white/40">{new Date(dec.timestamp).toLocaleTimeString()}</span>
                </div>
                <div className="text-white/80 text-[10px]">
                  {dec.reason}
                </div>
                {dec.selectedOperation && (
                  <div className="text-[9px] font-mono text-[#FFD54F]">
                    OP: {dec.selectedOperation}
                  </div>
                )}
                {dec.policyResult && (
                  <div className="flex items-center gap-1 text-[8.5px] font-mono">
                    <span className="text-white/50">POLICY:</span>
                    <span className={dec.policyResult === 'APPROVED' ? 'text-[#00FFAE]' : 'text-[#FF3D71]'}>
                      {dec.policyResult}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BudgetGauge({
  label,
  used,
  max,
  unit = '',
  icon,
}: {
  label: string;
  used: number;
  max: number;
  unit?: string;
  icon: React.ReactNode;
}) {
  const percent = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  const isHigh = percent >= 85;

  return (
    <div className="flex flex-col p-1.5 rounded-lg border border-white/5 bg-[#0A122C]/80">
      <div className="flex items-center justify-between text-[8px] font-mono text-white/50">
        <div className="flex items-center gap-1">
          {icon}
          <span>{label}</span>
        </div>
        <span className={isHigh ? 'text-[#FF3D71] font-bold' : 'text-white/80'}>
          {used}/{max}{unit}
        </span>
      </div>
      <div className="w-full bg-white/10 h-1 rounded-full mt-1.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${percent}%`,
            backgroundColor: isHigh ? '#FF3D71' : percent > 50 ? '#FFD54F' : '#00E5FF',
          }}
        />
      </div>
    </div>
  );
}
