import { useEffect, useState } from "react";
import { useSystemMetrics } from "../../hooks/useSystemMetrics";
import StatusPanel from "./StatusPanel";
import ModeNav from "./ModeNav";
import ModeSelector from "./ModeSelector";
import CreatorAutomationHUD from "./CreatorAutomationHUD";
import AppAutomationDeck from "./AppAutomationDeck";
import ProviderNetworkDeck from "./providers/ProviderNetworkDeck";
import ContextualApprovalSurface from "./approval/ContextualApprovalSurface";
import NotificationSurface from "./notifications/NotificationSurface";
import ContextSpatialIndicator from "./navigation/ContextSpatialIndicator";
import WorkspaceContextPill from "./workspace/WorkspaceContextPill";
import { ApprovalBridge } from "../../lib/ai/approval/ApprovalBridge";
import type { ApprovalRequest } from "../../lib/ai/approval/types";
import { RezelDirector, type DirectorEvent } from "../../lib/director/RezelDirector";
import { WorkflowRuntime } from "../../lib/ai/WorkflowRuntime";
import type { Workflow } from "../../lib/ai/types";
import type { OrbState } from "./CommandOrb";
import type { AppMode } from "./ModeNav";
import { cn } from "../../lib/cn";
import styles from "./HologramHUD.module.css";

const REZEL_VERSION = "v0.1.0-dev";
const HUD_MOUNT_DELAY_MS = 600;

export interface HologramHUDProps {
  orbState?: OrbState;
  onOrbClick?: () => void;
  mode?: AppMode;
  onModeChange?: (mode: AppMode) => void;
  transitionStyle?: "smooth" | "cinematic" | "instant";
  hudDensity?: "minimal" | "focused" | "dense";
  className?: string;
}

interface ActiveWorkflowSummary {
  id: string;
  title: string;
  currentStep: string;
  state: "RUNNING" | "VERIFIED" | "FAILED" | "PAUSED";
}

/**
 * HologramHUD
 *
 * Full Mode HUD overlay implementing the approved Stitch design architecture:
 * - TOP BAR: Brand node, navigation tabs, ModeSelector, live clock
 * - LEFT DECK: Telemetry panel, active application session, workflow preview
 * - BOTTOM DECK: Interactive Command Center & Voice barge-in capsule
 *
 * Consumes B1 Design Tokens via HologramHUD.module.css.
 */
export default function HologramHUD({
  mode = "core",
  onModeChange,
  transitionStyle = "smooth",
  hudDensity = "focused",
  className,
}: HologramHUDProps) {
  const metrics = useSystemMetrics();
  const [visible, setVisible] = useState(false);
  const [timeStr, setTimeStr] = useState("");
  const [activeApp, setActiveApp] = useState<string | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<ActiveWorkflowSummary | null>(null);
  const [isCreatorMode, setIsCreatorMode] = useState<boolean>(() => RezelDirector.getCurrentMode() === "CREATOR");
  const [fullWorkflow, setFullWorkflow] = useState<Workflow | null>(null);
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(() => ApprovalBridge.getLatestPending() || null);

  // Subscribe to pending approvals
  useEffect(() => {
    const unsub = ApprovalBridge.subscribe((list) => {
      setPendingApproval(list[0] || null);
    });
    return () => unsub();
  }, []);

  // Fade-in delay after scene mounts
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), HUD_MOUNT_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // Live Monospace Clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString("en-US", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Live workflow timeline synchronization
  useEffect(() => {
    const wfHandler = () => {
      const active = WorkflowRuntime.listActive();
      if (active.length > 0) {
        setFullWorkflow(active[0]);
      } else {
        const recent = WorkflowRuntime.listRecent();
        if (recent.length > 0 && (recent[0].status === "SUCCEEDED" || recent[0].status === "FAILED")) {
          setFullWorkflow(recent[0]);
        }
      }
    };
    WorkflowRuntime.addEventHandler(wfHandler);
    wfHandler();
    return () => WorkflowRuntime.removeEventHandler(wfHandler);
  }, []);

  // Subscribe to existing Director workflow, mode and app events
  useEffect(() => {
    const handler = (event: DirectorEvent) => {
      if (event.type === "mode_changed") {
        setIsCreatorMode(event.payload?.mode === "CREATOR");
      } else if (event.type === "workflow_started" && event.payload?.workflowId) {
        setActiveWorkflow({
          id: event.payload.workflowId,
          title: event.payload.title || "Active Automation",
          currentStep: "Initializing...",
          state: "RUNNING",
        });
      } else if (event.type === "workflow_progress" && event.payload) {
        setActiveWorkflow((prev) =>
          prev
            ? {
                ...prev,
                currentStep: event.payload.stepId || event.payload.capability || "Executing step...",
                state: "RUNNING",
              }
            : null
        );
      } else if (event.type === "reasoning_workflow_completed") {
        setActiveWorkflow((prev) => (prev ? { ...prev, state: "VERIFIED", currentStep: "Complete" } : null));
        setTimeout(() => setActiveWorkflow(null), 4000);
      } else if (event.type === "reasoning_error" || event.type === "error") {
        setActiveWorkflow((prev) => (prev ? { ...prev, state: "FAILED", currentStep: "Failed" } : null));
      } else if (event.type === "application_changed") {
        const app = event.payload?.activeApplication?.appId || (typeof event.payload === "string" ? event.payload : null);
        setActiveApp(app);
      }
    };

    RezelDirector.subscribe(handler);
    return () => RezelDirector.unsubscribe(handler);
  }, []);

  const transitionClass =
    transitionStyle === "instant"
      ? styles.transitionInstant
      : transitionStyle === "cinematic"
      ? styles.transitionCinematic
      : styles.transitionSmooth;

  return (
    <div
      className={cn(styles.hudRoot, transitionClass, className)}
      style={{ opacity: visible ? 1 : 0 }}
      role="region"
      aria-label="Rezel Full Hologram HUD"
    >
      {/* ── TOP HUD BAR ────────────────────────────────────────── */}
      <header className={styles.topBar} role="banner">
        {/* Left: Brand Node & Version & Spatial Context Trail & Multi-Context Indicators */}
        <div className={styles.brandGroup}>
          <div className={styles.brandDot} aria-hidden="true" />
          <span className={styles.brandName}>REZEL</span>
          <span className={styles.versionBadge}>{REZEL_VERSION}</span>
          <ContextSpatialIndicator />
          <WorkspaceContextPill />
        </div>

        {/* Center: Mode Navigation Tabs */}
        <div className={styles.centerNav}>
          {onModeChange && <ModeNav mode={mode} onModeChange={onModeChange} />}
        </div>

        {/* Right: AI Mode Selector & Monospace Clock */}
        <div className={styles.rightControls}>
          <ModeSelector />
          <span className={styles.clock} aria-label={`Current system time ${timeStr}`}>
            {timeStr}
          </span>
        </div>
      </header>

      {/* Decorative Top Hairline */}
      <div className={styles.topHairline} aria-hidden="true" />

      {/* ── LEFT TELEMETRY DECK ────────────────────────────────── */}
      {hudDensity !== "minimal" && (
        <aside className={styles.telemetryDeck} aria-label="System Telemetry and Sessions">
          {/* Active Application Connection Status */}
          {activeApp && (
            <div className={styles.appSessionCard}>
              <span className={styles.sessionLabel}>{activeApp}</span>
              <span className={styles.sessionStatus}>
                <span className={styles.statusDotGreen} />
                CONNECTED
              </span>
            </div>
          )}

          {/* Active Workflow High-Level Summary Preview */}
          {activeWorkflow && (
            <div className={styles.workflowSummaryCard} role="status" aria-live="polite">
              <div className={styles.workflowHeader}>
                <span className={styles.workflowTitle}>{activeWorkflow.title}</span>
                <span className={styles.workflowStateBadge}>{activeWorkflow.state}</span>
              </div>
              <span className={styles.workflowStepText}>{activeWorkflow.currentStep}</span>
            </div>
          )}

          {/* Hardware Telemetry Gauges */}
          <StatusPanel metrics={metrics} />
        </aside>
      )}

      {/* ── RIGHT DECK — Creator & Application Automation HUD ── */}
      {fullWorkflow ? (
        <div className={styles.creatorHudHost}>
          <CreatorAutomationHUD
            workflow={fullWorkflow}
            activeApp={activeApp || "BLENDER"}
            isAppConnected={Boolean(activeApp)}
            backgroundCount={Math.max(0, WorkflowRuntime.listActive().length - 1)}
            isCreatorMode={isCreatorMode}
          />
        </div>
      ) : activeApp || isCreatorMode ? (
        <div className={styles.creatorHudHost}>
          <AppAutomationDeck
            activeApp={activeApp || "BLENDER"}
            connectionState={activeApp ? "CONNECTED" : "CONNECTING"}
          />
        </div>
      ) : mode === 'settings' ? (
        <div className={styles.creatorHudHost}>
          <ProviderNetworkDeck />
        </div>
      ) : null}

      {/* Contextual Human Approval Gate Surface */}
      {pendingApproval && (
        <ContextualApprovalSurface
          request={pendingApproval}
          onDecided={() => setPendingApproval(null)}
        />
      )}

      {/* Unified Notification and Event Surface */}
      <NotificationSurface />

      {/* Decorative Bottom Hairline */}
      <div className={styles.bottomHairline} aria-hidden="true" />
    </div>
  );
}
