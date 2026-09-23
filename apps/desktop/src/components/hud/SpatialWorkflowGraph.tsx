import { useRef, useEffect } from 'react';
import { Play, Pause, Square, RefreshCw, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';
import { MotionEngine } from '../../lib/motion/MotionEngine';
import type { Workflow, PlanStep } from '../../lib/ai/types';
import { WorkflowRuntime } from '../../lib/ai/WorkflowRuntime';
import { cn } from '../../lib/cn';
import styles from './SpatialWorkflowGraph.module.css';

export interface SpatialWorkflowGraphProps {
  workflow: Workflow;
  onSelectStep?: (step: PlanStep) => void;
  onExplainStep?: (step: PlanStep) => void;
  className?: string;
}

export default function SpatialWorkflowGraph({
  workflow,
  onSelectStep,
  onExplainStep,
  className,
}: SpatialWorkflowGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      MotionEngine.animateEntrance(containerRef.current, {
        fromY: 12,
        durationToken: 'standard',
        easeToken: 'out',
      });
    }
    return () => {
      if (containerRef.current) {
        MotionEngine.killTweens(containerRef.current);
      }
    };
  }, [workflow.id]);

  const steps = workflow.plan?.steps || [];
  const isRunning = workflow.status === 'RUNNING';
  const isPaused = workflow.status === 'PAUSED';

  const handlePauseResume = () => {
    if (isRunning) {
      WorkflowRuntime.pause(workflow.id);
    } else if (isPaused) {
      WorkflowRuntime.resume(workflow.id);
    }
  };

  const handleCancel = () => {
    WorkflowRuntime.cancel(workflow.id);
  };

  const handleRetry = () => {
    WorkflowRuntime.resumeWorkflow(workflow.id).catch(() => {
      WorkflowRuntime.resume(workflow.id);
    });
  };

  return (
    <div ref={containerRef} className={cn(styles.graphRoot, className)}>
      {/* ── Top Header Bar ─────────────────────────────────────────── */}
      <div className={styles.headerBar}>
        <div className={styles.goalWrapper}>
          <span className={styles.goalLabel}>GOAL:</span>
          <span className={styles.goalText} title={workflow.plan?.goal}>
            {workflow.plan?.goal || 'Multi-step Agent Automation'}
          </span>
        </div>

        <div className={styles.stateControls}>
          <span className={cn(styles.statusPill, styles[`statusPill-${workflow.status.toLowerCase()}`] || styles['statusPill-running'])}>
            {workflow.status}
          </span>

          {/* Quick controls */}
          {(isRunning || isPaused) && (
            <button
              type="button"
              onClick={handlePauseResume}
              className={styles.miniBtn}
              title={isRunning ? 'Pause execution' : 'Resume execution'}
            >
              {isRunning ? <Pause size={11} /> : <Play size={11} />}
            </button>
          )}

          {workflow.status === 'FAILED' && (
            <button
              type="button"
              onClick={handleRetry}
              className={cn(styles.miniBtn, styles.miniBtnPrimary)}
              title="Retry failed workflow"
            >
              <RefreshCw size={11} />
            </button>
          )}

          {(isRunning || isPaused || workflow.status === 'WAITING_FOR_USER') && (
            <button
              type="button"
              onClick={handleCancel}
              className={cn(styles.miniBtn, styles.miniBtnDanger)}
              title="Cancel workflow"
            >
              <Square size={11} />
            </button>
          )}
        </div>
      </div>

      {/* ── Flow Graph ─────────────────────────────────────────────── */}
      <div className={styles.flowContainer}>
        <div className={styles.spineLine} aria-hidden="true" />

        {steps.map((step, idx) => {
          const isStepRunning = step.status === 'RUNNING';
          const isStepCompleted = step.status === 'COMPLETED';
          const isStepFailed = step.status === 'FAILED';
          const isVerified = step.verificationResult === 'VERIFIED';
          const isUnverified = step.verificationResult === 'NOT_VERIFIED';

          let anchorClass = styles.nodeAnchor;
          let cardClass = styles.stepCard;

          if (isStepRunning) {
            anchorClass = cn(styles.nodeAnchor, styles.nodeAnchorActive);
            cardClass = cn(styles.stepCard, styles.stepCardActive);
          } else if (isStepCompleted) {
            anchorClass = cn(styles.nodeAnchor, styles.nodeAnchorCompleted);
            cardClass = cn(styles.stepCard, styles.stepCardCompleted);
          } else if (isStepFailed) {
            anchorClass = cn(styles.nodeAnchor, styles.nodeAnchorFailed);
            cardClass = cn(styles.stepCard, styles.stepCardFailed);
          }

          return (
            <div
              key={step.id || `step-${idx}`}
              className={cardClass}
              onClick={() => onSelectStep?.(step)}
              style={{ cursor: onSelectStep ? 'pointer' : 'default' }}
            >
              <div className={anchorClass} aria-hidden="true" />

              {/* Step Title & Capability */}
              <div className={styles.stepHeader}>
                <div className={styles.stepTitleGroup}>
                  <span className={styles.stepIndex}>0{idx + 1}</span>
                  <span className={styles.stepDescription}>{step.description}</span>
                </div>
                {step.toolName && (
                  <span className={styles.capabilityBadge}>{step.toolName}</span>
                )}
              </div>

              {/* Sanitized Live Tool Args (shown when running or if has args) */}
              {step.toolArgs && Object.keys(step.toolArgs).length > 0 && isStepRunning && (
                <div className={styles.paramPreview}>
                  {Object.entries(step.toolArgs)
                    .filter(([k]) => !/key|secret|token|auth/i.test(k))
                    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
                    .slice(0, 2)
                    .join(' | ')}
                </div>
              )}

              {/* Verification Feedback */}
              {step.verificationResult && (
                <div className={styles.verifBadge}>
                  {isVerified ? (
                    <CheckCircle2 size={12} className="text-[#00E676]" />
                  ) : isUnverified ? (
                    <AlertTriangle size={12} className="text-[#FFD54F]" />
                  ) : (
                    <HelpCircle size={12} className="text-[#7ECFFF]" />
                  )}
                  <span>
                    {isVerified ? 'VERIFIED: ' : 'OBSERVED: '}
                    {step.verificationReason || (isVerified ? 'State confirmed' : 'Verification pending')}
                  </span>
                </div>
              )}

              {/* Error Message if Failed */}
              {isStepFailed && (
                <div className={styles.errorBanner} role="alert">
                  <span>⚠ {step.error || 'Execution failed during step operation.'}</span>
                </div>
              )}

              {/* Contextual Action Row */}
              <div className={styles.actionRow}>
                {onExplainStep && (
                  <button
                    type="button"
                    onClick={() => onExplainStep(step)}
                    className={styles.miniBtn}
                  >
                    EXPLAIN STEP
                  </button>
                )}
                {isStepFailed && (
                  <button
                    type="button"
                    onClick={handleRetry}
                    className={cn(styles.miniBtn, styles.miniBtnPrimary)}
                  >
                    RETRY STEP
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
