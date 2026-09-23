import { useState, useEffect, useCallback } from 'react';
import { Play, Pause, Square, RefreshCw, ChevronUp, ChevronDown, ExternalLink } from 'lucide-react';
import SpatialWorkflowGraph from '../hud/SpatialWorkflowGraph';
import { WorkflowRuntime } from '../../lib/ai/WorkflowRuntime';
import { ModelManager } from '../../lib/ai/models/ModelManager';
import { AdaptiveWorkspaceManager } from '../../lib/workspace/multi-context/AdaptiveWorkspaceManager';
import type { RezelActiveContext } from '../../lib/workspace/multi-context/types';
import { RezelDirector, type DirectorEvent } from '../../lib/director/RezelDirector';
import type { Workflow } from '../../lib/ai/types';
import type { UniversalModelRecord } from '../../lib/ai/models/types';
import type { InspectorId } from '../../types/navigation';
import { cn } from '../../lib/cn';
import styles from './ActivityBand.module.css';

export interface ActivityBandProps {
  onOpenInspector?: (id: InspectorId) => void;
  className?: string;
}

export default function ActivityBand({ onOpenInspector, className }: ActivityBandProps) {
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
  const [downloadingModel, setDownloadingModel] = useState<UniversalModelRecord | null>(null);
  const [indexingContext, setIndexingContext] = useState<RezelActiveContext | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const syncActiveWorkflow = useCallback(() => {
    const active = WorkflowRuntime.listActive();
    if (active.length > 0) {
      setActiveWorkflow(active[0]);
    } else {
      const recent = WorkflowRuntime.listRecent();
      if (recent.length > 0 && (recent[0].status === 'RUNNING' || recent[0].status === 'PAUSED')) {
        setActiveWorkflow(recent[0]);
      } else {
        setActiveWorkflow(null);
      }
    }
  }, []);

  const syncDownloadingModel = useCallback(() => {
    const models = ModelManager.listModels();
    const activeAcquisition = models.find(
      (m) => m.state === 'DOWNLOADING' || m.state === 'VERIFYING' || m.state === 'REGISTERING'
    );
    setDownloadingModel(activeAcquisition || null);
  }, []);

  const syncWorkspaceContexts = useCallback(() => {
    const bgContexts = AdaptiveWorkspaceManager.getBackgroundContexts();
    const indexing = bgContexts.find((c) => c.type === 'KNOWLEDGE_INDEX');
    setIndexingContext(indexing || null);
  }, []);

  useEffect(() => {
    syncActiveWorkflow();
    syncDownloadingModel();
    syncWorkspaceContexts();

    const wfHandler = () => syncActiveWorkflow();
    WorkflowRuntime.addEventHandler(wfHandler);

    const unsubModel = ModelManager.subscribe(() => {
      syncDownloadingModel();
    });

    const unsubWs = AdaptiveWorkspaceManager.subscribe(() => {
      syncWorkspaceContexts();
    });

    const dirHandler = (event: DirectorEvent) => {
      if (
        event.type === 'workflow_started' ||
        event.type === 'workflow_progress' ||
        event.type === 'reasoning_workflow_started'
      ) {
        syncActiveWorkflow();
      } else if (
        event.type === 'reasoning_workflow_completed' ||
        event.type === 'reasoning_error'
      ) {
        // Delay hide on completion
        setTimeout(() => syncActiveWorkflow(), 4000);
      }
    };

    RezelDirector.subscribe(dirHandler);

    return () => {
      WorkflowRuntime.removeEventHandler(wfHandler);
      unsubModel();
      unsubWs();
      RezelDirector.unsubscribe(dirHandler);
    };
  }, [syncActiveWorkflow, syncDownloadingModel, syncWorkspaceContexts]);

  // If no workflow, download, or indexing task is active, hide
  if (!activeWorkflow && !downloadingModel && !indexingContext) {
    return null;
  }

  // 1. If a workflow is active, prioritize workflow execution
  if (activeWorkflow) {
    const isRunning = activeWorkflow.status === 'RUNNING';
    const isPaused = activeWorkflow.status === 'PAUSED';
    const isFailed = activeWorkflow.status === 'FAILED';
    const isVerified = activeWorkflow.status === 'SUCCEEDED';

    const steps = activeWorkflow.plan?.steps || [];
    const currentStepIdx = steps.findIndex((s) => s.status === 'RUNNING' || s.status === 'PENDING');
    const activeStep = steps.find((s) => s.status === 'RUNNING') || steps[0];
    const stepCount = steps.length || 1;
    const currentStepNum = currentStepIdx >= 0 ? currentStepIdx + 1 : stepCount;

    const handlePauseResume = () => {
      if (isRunning) {
        WorkflowRuntime.pause(activeWorkflow.id);
      } else if (isPaused) {
        WorkflowRuntime.resume(activeWorkflow.id);
      }
      syncActiveWorkflow();
    };

    const handleCancel = () => {
      WorkflowRuntime.cancel(activeWorkflow.id);
      syncActiveWorkflow();
    };

    const handleRetry = () => {
      WorkflowRuntime.resumeWorkflow(activeWorkflow.id).catch(() => {
        WorkflowRuntime.resume(activeWorkflow.id);
      });
      syncActiveWorkflow();
    };

    return (
      <div className={cn(styles.bandRoot, className)}>
        {/* ── EXPANDED FULL GRAPH VIEW (if open) ── */}
        {isExpanded && (
          <div className={styles.expandedContainer}>
            <SpatialWorkflowGraph workflow={activeWorkflow} />
          </div>
        )}

        {/* ── COMPACT CAPSULE BAR ── */}
        <div
          className={cn(
            styles.capsule,
            isRunning && styles.capsuleRunning,
            isFailed && styles.capsuleFailed,
            isVerified && styles.capsuleVerified
          )}
        >
          {/* Left: Indicator, Title & Current Step */}
          <div className={styles.leftGroup}>
            <div
              className={cn(
                styles.stateDot,
                isRunning && styles.stateDotRunning,
                isFailed && styles.stateDotFailed,
                isVerified && styles.stateDotVerified
              )}
            />

            <div className={styles.workflowInfo}>
              <div className={styles.titleRow}>
                <span className={styles.title} title={activeWorkflow.plan?.goal}>
                  {activeWorkflow.plan?.goal || 'Active Workflow'}
                </span>
                <span className={styles.stepBadge}>
                  STEP {currentStepNum}/{stepCount}
                </span>
              </div>
              <span className={styles.currentStepText} title={activeStep?.description}>
                {activeStep?.description || 'Executing automation pipeline...'}
              </span>
            </div>
          </div>

          {/* Right: Quick Controls */}
          <div className={styles.controls}>
            {(isRunning || isPaused) && (
              <button
                type="button"
                onClick={handlePauseResume}
                className={styles.iconBtn}
                title={isRunning ? 'Pause execution' : 'Resume execution'}
                aria-label={isRunning ? 'Pause' : 'Resume'}
              >
                {isRunning ? <Pause size={12} /> : <Play size={12} />}
              </button>
            )}

            {isFailed && (
              <button
                type="button"
                onClick={handleRetry}
                className={styles.iconBtn}
                title="Retry failed workflow"
                aria-label="Retry"
              >
                <RefreshCw size={12} />
              </button>
            )}

            {(isRunning || isPaused || activeWorkflow.status === 'WAITING_FOR_USER') && (
              <button
                type="button"
                onClick={handleCancel}
                className={cn(styles.iconBtn, styles.iconBtnDanger)}
                title="Cancel workflow"
                aria-label="Cancel"
              >
                <Square size={12} />
              </button>
            )}

            {/* Expand / Collapse inline graph */}
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className={styles.iconBtn}
              title={isExpanded ? 'Collapse graph' : 'Expand step graph'}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            </button>

            {/* Open full Workflow Inspector */}
            {onOpenInspector && (
              <button
                type="button"
                onClick={() => onOpenInspector('workflow')}
                className={styles.iconBtn}
                title="Open full Automation Inspector"
                aria-label="Open Automation Inspector"
              >
                <ExternalLink size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. Model Acquisition in ActivityBand
  if (downloadingModel) {
    const isVerifying = downloadingModel.state === 'VERIFYING';
    const isRegistering = downloadingModel.state === 'REGISTERING';
    const percent = downloadingModel.downloadProgress?.percent ?? 50;

    const handleCancelDownload = () => {
      ModelManager.cancelAcquisition(downloadingModel.id);
      syncDownloadingModel();
    };

    return (
      <div className={cn(styles.bandRoot, className)}>
        <div className={cn(styles.capsule, styles.capsuleRunning)}>
          <div className={styles.leftGroup}>
            <div className={cn(styles.stateDot, styles.stateDotRunning)} />

            <div className={styles.workflowInfo}>
              <div className={styles.titleRow}>
                <span className={styles.title}>
                  ACQUIRING NEURAL WEIGHTS: {downloadingModel.displayName}
                </span>
                <span className={styles.stepBadge}>
                  {percent}%
                </span>
              </div>
              <span className={styles.currentStepText}>
                {isVerifying
                  ? 'Verifying model checksum & safety signature...'
                  : isRegistering
                  ? 'Registering model with local runtime engine...'
                  : downloadingModel.downloadProgress?.bytesReceived
                  ? `Streaming chunks: ${(downloadingModel.downloadProgress.bytesReceived / (1024 * 1024)).toFixed(0)} MB • ETA ${downloadingModel.downloadProgress.etaSeconds}s`
                  : 'Acquiring weights from repository...'}
              </span>
            </div>
          </div>

          <div className={styles.controls}>
            <button
              type="button"
              onClick={handleCancelDownload}
              className={cn(styles.iconBtn, styles.iconBtnDanger)}
              title="Cancel model download"
              aria-label="Cancel download"
            >
              <Square size={12} />
            </button>

            {onOpenInspector && (
              <button
                type="button"
                onClick={() => onOpenInspector('models')}
                className={styles.iconBtn}
                title="Open Model Intelligence Inspector"
                aria-label="Open Model Inspector"
              >
                <ExternalLink size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 3. Knowledge Ingestion in ActivityBand
  if (indexingContext) {
    const handleCancelIndexing = () => {
      AdaptiveWorkspaceManager.cancelContext(indexingContext.id);
      syncWorkspaceContexts();
    };

    return (
      <div className={cn(styles.bandRoot, className)}>
        <div className={cn(styles.capsule, styles.capsuleRunning)}>
          <div className={styles.leftGroup}>
            <div className={cn(styles.stateDot, styles.stateDotRunning)} />

            <div className={styles.workflowInfo}>
              <div className={styles.titleRow}>
                <span className={styles.title}>
                  {indexingContext.title}
                </span>
                <span className={styles.stepBadge}>
                  {indexingContext.progress ?? 40}%
                </span>
              </div>
              <span className={styles.currentStepText}>
                {indexingContext.summary || 'Parsing and embedding document into local vector index...'}
              </span>
            </div>
          </div>

          <div className={styles.controls}>
            <button
              type="button"
              onClick={handleCancelIndexing}
              className={cn(styles.iconBtn, styles.iconBtnDanger)}
              title="Cancel knowledge indexing"
              aria-label="Cancel indexing"
            >
              <Square size={12} />
            </button>

            {onOpenInspector && (
              <button
                type="button"
                onClick={() => onOpenInspector('memory')}
                className={styles.iconBtn}
                title="Open Knowledge & Memory Inspector"
                aria-label="Open Memory Inspector"
              >
                <ExternalLink size={12} />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
