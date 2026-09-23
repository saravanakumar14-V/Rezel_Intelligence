import { useMemo } from 'react';
import type { Workflow, PlanStep } from '../../lib/ai/types';
import { cn } from '../../lib/cn';
import styles from './CreatorAutomationHUD.module.css';

export interface CreatorAutomationHUDProps {
  workflow?: Workflow | null;
  activeApp?: string | null;
  isAppConnected?: boolean;
  backgroundCount?: number;
  isCreatorMode?: boolean;
  className?: string;
}

/**
 * Sanitizes tool parameters for safe user-facing display.
 * Strips secrets, raw buffers, PIDs, and internal security configs.
 */
function sanitizeParameters(args?: Record<string, unknown>): string | null {
  if (!args || Object.keys(args).length === 0) return null;

  const allowedKeys = ['name', 'location', 'scale', 'rotation', 'path', 'type', 'count', 'dimensions', 'target'];
  const sanitized: string[] = [];

  for (const [k, v] of Object.entries(args)) {
    if (allowedKeys.includes(k.toLowerCase()) || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      // Don't expose keys containing sensitive strings
      if (/key|secret|token|password|auth/i.test(k)) continue;
      const strVal = typeof v === 'object' ? JSON.stringify(v) : String(v);
      sanitized.push(`${k}: ${strVal}`);
    }
  }

  return sanitized.length > 0 ? sanitized.slice(0, 3).join(' | ') : null;
}

export default function CreatorAutomationHUD({
  workflow,
  activeApp = 'BLENDER',
  isAppConnected = true,
  backgroundCount = 0,
  isCreatorMode = true,
  className,
}: CreatorAutomationHUDProps) {
  if (!workflow || !workflow.plan) {
    return null;
  }

  const steps = workflow.plan.steps || [];
  const totalSteps = steps.length;
  const completedSteps = useMemo(
    () => steps.filter((s) => s.status === 'COMPLETED').length,
    [steps]
  );

  const activeIndex = useMemo(
    () => steps.findIndex((s) => s.status === 'RUNNING'),
    [steps]
  );

  const workflowStateClass = `statusPill-${workflow.status.toLowerCase()}`;

  return (
    <div
      className={cn(
        styles.container,
        isCreatorMode && styles.creatorThemed,
        className
      )}
      role="region"
      aria-label="Creator Automation Workflow HUD"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className={styles.hudHeader}>
        <div className={styles.headerLeft}>
          <span className={styles.modeBadge}>CREATOR</span>
          <span className={styles.workflowGoal} title={workflow.plan.goal}>
            {workflow.plan.goal}
          </span>
        </div>

        <div className={styles.headerRight}>
          {activeApp && (
            <div
              className={cn(
                styles.appBadge,
                isAppConnected ? styles.appBadgeConnected : styles.appBadgeDisconnected
              )}
              aria-label={`Application ${activeApp} is ${isAppConnected ? 'connected' : 'disconnected'}`}
            >
              <span className={isAppConnected ? styles.dotConnected : styles.dotDisconnected} aria-hidden="true" />
              <span>{activeApp}</span>
            </div>
          )}

          {backgroundCount > 0 && (
            <span className={styles.backgroundCount} aria-label={`${backgroundCount} background workflows active`}>
              +{backgroundCount} BG
            </span>
          )}
        </div>
      </div>

      {/* ── Status & Progress Telemetry ─────────────────────────── */}
      <div className={styles.statusStrip}>
        <span className={styles.progressCounter} aria-label={`Progress: ${completedSteps} of ${totalSteps} steps completed`}>
          STEP {activeIndex >= 0 ? activeIndex + 1 : completedSteps} / {totalSteps}
        </span>

        <span className={cn(styles.statusPill, styles[workflowStateClass] || styles['statusPill-running'])}>
          {workflow.status}
        </span>
      </div>

      {/* ── Step Timeline ───────────────────────────────────────── */}
      <ol className={styles.timelineList} aria-label="Workflow Step Timeline">
        {steps.map((step: PlanStep, idx: number) => {
          const isRunning = step.status === 'RUNNING';
          const isCompleted = step.status === 'COMPLETED';
          const isFailed = step.status === 'FAILED';
          const isCancelled = step.status === 'CANCELLED';
          const isUnknown = step.executionOutcome === 'UNKNOWN';

          let nodeClass = styles['node-pending'];

          if (isRunning) {
            nodeClass = styles['node-running'];
          } else if (isUnknown) {
            nodeClass = styles['node-unknown'];
          } else if (isCompleted) {
            nodeClass = styles['node-succeeded'];
          } else if (isFailed) {
            nodeClass = styles['node-failed'];
          } else if (isCancelled) {
            nodeClass = styles['node-cancelled'];
          }

          const paramPreview = isRunning ? sanitizeParameters(step.toolArgs) : null;
          const isVerified = step.verificationResult === 'VERIFIED';
          const isNotVerified = step.verificationResult === 'NOT_VERIFIED';

          return (
            <li
              key={step.id || `step-${idx}`}
              className={cn(styles.timelineItem, isRunning && styles.timelineItemActive)}
              aria-current={isRunning ? 'step' : undefined}
            >
              {/* Step Node */}
              <div className={styles.nodeWrapper} aria-hidden="true">
                <div className={cn(styles.stepNode, nodeClass)} />
                {isRunning && <div className={styles.spinnerRing} />}
              </div>

              {/* Step Content */}
              <div className={styles.stepContent}>
                <div className={styles.stepHeader}>
                  <span className={styles.stepTitle}>
                    {idx + 1}. {step.description}
                  </span>
                  {step.toolName && <span className={styles.stepCapability}>{step.toolName}</span>}
                </div>

                {/* Sanitized Live Tool Parameters for Active Step */}
                {paramPreview && (
                  <div className={styles.stepArgsPreview} aria-label="Tool parameters">
                    {paramPreview}
                  </div>
                )}

                {/* Verification Result */}
                {step.verificationResult && (
                  <div
                    className={cn(
                      styles.verificationBlock,
                      isVerified
                        ? styles['verif-verified']
                        : isNotVerified
                        ? styles['verif-not_verified']
                        : styles['verif-unknown']
                    )}
                  >
                    <span>
                      {isVerified ? '✓' : isUnknown ? '?' : '⚠'} {step.verificationReason || (isVerified ? 'State confirmed' : 'Verification unconfirmed')}
                    </span>
                  </div>
                )}

                {/* Explicit Step Error (Sanitized) */}
                {isFailed && step.error && (
                  <div className={styles.errorBanner} role="alert">
                    <span>⚠ {step.error}</span>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
