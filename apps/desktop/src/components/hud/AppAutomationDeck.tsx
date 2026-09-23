import { useRef, useEffect } from 'react';
import { Box, Film, Activity, CheckCircle, AlertTriangle, RefreshCw, X } from 'lucide-react';
import { MotionEngine } from '../../lib/motion/MotionEngine';
import type { Workflow, PlanStep } from '../../lib/ai/types';
import { cn } from '../../lib/cn';
import styles from './AppAutomationDeck.module.css';

export interface AppAutomationDeckProps {
  workflow?: Workflow | null;
  activeApp: 'BLENDER' | 'AFTER_EFFECTS' | string;
  connectionState?: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED';
  activeDocument?: string;
  activeEntity?: string;
  onDismiss?: () => void;
  onReconnect?: () => void;
  className?: string;
}

export default function AppAutomationDeck({
  workflow,
  activeApp = 'BLENDER',
  connectionState = 'CONNECTED',
  activeDocument,
  activeEntity,
  onDismiss,
  onReconnect,
  className,
}: AppAutomationDeckProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      MotionEngine.animateEntrance(containerRef.current, {
        fromX: 20,
        durationToken: 'standard',
        easeToken: 'out',
      });
    }
    return () => {
      if (containerRef.current) {
        MotionEngine.killTweens(containerRef.current);
      }
    };
  }, [activeApp]);

  const isBlender = activeApp.toUpperCase().includes('BLENDER');
  const isAE = activeApp.toUpperCase().includes('AFTER') || activeApp.toUpperCase().includes('EFFECTS');

  const steps = workflow?.plan?.steps || [];
  const activeStep: PlanStep | undefined = steps.find((s) => s.status === 'RUNNING');
  const isVerified = activeStep?.verificationResult === 'VERIFIED';
  const isNotVerified = activeStep?.verificationResult === 'NOT_VERIFIED';

  const defaultDoc = isBlender ? 'Scene_Master.blend' : isAE ? 'Comp_VFX_Final.aep' : 'Workspace_Active';
  const defaultEntity = isBlender ? 'Camera_Rig_01' : isAE ? 'Layer_03_Glow' : 'Entity_01';

  return (
    <aside
      ref={containerRef}
      className={cn(styles.deckRoot, className)}
      role="region"
      aria-label={`${activeApp} Automation Intelligence Deck`}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className={styles.deckHeader}>
        <div className={styles.appBrandGroup}>
          <div
            className={cn(
              styles.appIconBubble,
              isBlender && styles.appIconBlender,
              isAE && styles.appIconAE
            )}
          >
            {isBlender ? <Box size={13} /> : isAE ? <Film size={13} /> : <Activity size={13} />}
          </div>
          <span className={styles.appNameText}>{activeApp}</span>
        </div>

        <div className="flex items-center gap-2">
          <div
            className={cn(
              styles.connectionStatus,
              connectionState === 'CONNECTED'
                ? styles.connConnected
                : connectionState === 'CONNECTING'
                ? styles.connConnecting
                : styles.connDisconnected
            )}
          >
            <span className={styles.statusDot} />
            <span>{connectionState}</span>
          </div>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-white/40 hover:text-white p-1 rounded transition-colors"
              title="Close deck"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Active Context Telemetry ─────────────────────────────── */}
      <div className={styles.telemetryGrid}>
        <div className={styles.telemetryCell}>
          <span className={styles.cellLabel}>{isBlender ? 'ACTIVE SCENE' : 'COMPOSITION'}</span>
          <span className={styles.cellValue}>{activeDocument || defaultDoc}</span>
        </div>
        <div className={styles.telemetryCell}>
          <span className={styles.cellLabel}>{isBlender ? 'ACTIVE OBJECT' : 'FOCUSED LAYER'}</span>
          <span className={styles.cellValue}>{activeEntity || defaultEntity}</span>
        </div>
      </div>

      {/* ── Live Operation Block ─────────────────────────────────── */}
      <div className={styles.operationBlock}>
        <div className={styles.opHeader}>
          <span className={styles.opStageLabel}>
            {activeStep ? 'OPERATING APPLICATION' : 'AUTOMATION STANDBY'}
          </span>
          {activeStep?.toolName && (
            <span className={styles.opCapability}>{activeStep.toolName}</span>
          )}
        </div>
        <span className={styles.opDescription}>
          {activeStep ? activeStep.description : 'Awaiting application-level commands from Rezel Director.'}
        </span>
      </div>

      {/* ── Verification Strip ───────────────────────────────────── */}
      {activeStep && (
        <div
          className={cn(
            styles.verifStrip,
            isVerified
              ? styles.verifStrip
              : isNotVerified
              ? styles.verifStripFailed
              : styles.verifStripPending
          )}
        >
          <div className="flex items-center gap-1.5">
            {isVerified ? (
              <CheckCircle size={12} className="text-[#00E676]" />
            ) : (
              <AlertTriangle size={12} className="text-[#FFD54F]" />
            )}
            <span>
              {isVerified
                ? 'STATE CONFIRMED & VERIFIED'
                : isNotVerified
                ? 'VERIFICATION FAILED'
                : 'OBSERVING STATE...'}
            </span>
          </div>
          <span className="opacity-60">{activeStep.verificationReason || 'Confirmed'}</span>
        </div>
      )}

      {/* ── Footer Actions ───────────────────────────────────────── */}
      <div className={styles.deckFooter}>
        {connectionState === 'DISCONNECTED' && onReconnect && (
          <button
            type="button"
            onClick={onReconnect}
            className={cn(styles.deckBtn, styles.deckBtnPrimary, 'flex items-center gap-1')}
          >
            <RefreshCw size={10} />
            <span>RECONNECT IPC</span>
          </button>
        )}
      </div>
    </aside>
  );
}
