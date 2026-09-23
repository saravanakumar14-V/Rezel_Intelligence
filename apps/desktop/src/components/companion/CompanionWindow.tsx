import React, { useEffect, useState, useCallback } from 'react';
import { RezelDirector, type DirectorEvent } from '../../lib/director/RezelDirector';
import { WorkflowRuntime } from '../../lib/ai/WorkflowRuntime';
import { CompanionObservation } from './CompanionObservation';
import { CompanionProgress } from './CompanionProgress';
import { CompanionControls } from './CompanionControls';
import { useVoice } from '../../hooks/useVoice';
import type { OrbState } from '../hud/CommandOrb';
import styles from './CompanionWindow.module.css';

export interface CompanionWindowProps {
  onRestore?: () => void;
  className?: string;
}

export const CompanionWindow: React.FC<CompanionWindowProps> = ({ onRestore, className }) => {
  const [appId, setAppId] = useState<string>('blender');
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTED' | 'DISCONNECTED'>('CONNECTED');
  const [workflowName, setWorkflowName] = useState<string>('Active Automation');
  const [stepDescription, setStepDescription] = useState<string>('Executing automation steps...');
  const [stepIndex, setStepIndex] = useState<number>(1);
  const [totalSteps, setTotalSteps] = useState<number>(1);
  const [progressPercentage, setProgressPercentage] = useState<number>(0);
  const [verificationState, setVerificationState] = useState<'VERIFIED' | 'NOT_VERIFIED' | 'UNKNOWN' | 'FAILED' | 'RECOVERY_REQUIRED' | null>(null);
  const [activeWorkflowCount, setActiveWorkflowCount] = useState<number>(1);
  const [transcriptSnippet, setTranscriptSnippet] = useState<string>('');
  const [agentStatus, setAgentStatus] = useState<string>('idle');
  const [currentMode, setCurrentMode] = useState<string>(() => RezelDirector.getCurrentMode());

  const { voiceState, startListening, cancel: cancelVoice } = useVoice();

  // Map effective voice orb state
  const effectiveOrbState: OrbState =
    voiceState === 'listening' || voiceState === 'speaking' || voiceState === 'thinking' || voiceState === 'interrupted'
      ? voiceState
      : agentStatus === 'thinking' || agentStatus === 'tool_executing' || agentStatus === 'streaming'
      ? 'thinking'
      : 'idle';

  useEffect(() => {
    // Initial session & mode info
    const session = RezelDirector.getApplicationSessionManager().getForegroundSession();
    if (session) {
      setAppId(session.appId);
      setConnectionStatus(session.connectionStatus);
    }
    setCurrentMode(RezelDirector.getCurrentMode());

    // Check active workflows immediately
    const activeList = WorkflowRuntime.listActive();
    setActiveWorkflowCount(activeList.length);
    if (activeList.length > 0) {
      const wf = activeList[0];
      setWorkflowName(wf.plan.goal || 'Active Automation');
      setTotalSteps(wf.plan.steps.length);
      const curIdx = wf.plan.steps.findIndex((s) => s.status === 'RUNNING' || s.status === 'PENDING');
      setStepIndex(curIdx >= 0 ? curIdx + 1 : wf.plan.steps.length);
      const completed = wf.plan.steps.filter((s) => s.status === 'COMPLETED').length;
      setProgressPercentage(Math.round((completed / (wf.plan.steps.length || 1)) * 100));
    }

    const handler = (event: DirectorEvent) => {
      if (event.type === 'workflow_started') {
        const wf = WorkflowRuntime.get(event.payload?.workflowId);
        if (wf) {
          setWorkflowName(wf.plan.goal || 'Active Automation');
          setTotalSteps(wf.plan.steps.length);
          setStepIndex(1);
          setProgressPercentage(0);
          setVerificationState(null);
        }
        setActiveWorkflowCount(WorkflowRuntime.listActive().length);
      } else if (event.type === 'workflow_progress') {
        const wfEvent = event.payload?.event || event.payload;
        const wfId = wfEvent?.workflowId || event.payload?.workflowId;
        if (wfId) {
          const wf = WorkflowRuntime.get(wfId);
          if (wf) {
            setWorkflowName(wf.plan.goal || 'Active Automation');
            setTotalSteps(wf.plan.steps.length);
            const currentStepIdx = wf.plan.steps.findIndex((s) => s.status === 'RUNNING' || s.status === 'PENDING');
            setStepIndex(currentStepIdx >= 0 ? currentStepIdx + 1 : wf.plan.steps.length);
            const completedCount = wf.plan.steps.filter((s) => s.status === 'COMPLETED').length;
            setProgressPercentage(Math.round((completedCount / (wf.plan.steps.length || 1)) * 100));

            const activeStep = wf.plan.steps.find((s) => s.id === wfEvent?.stepId || s.status === 'RUNNING');
            if (activeStep) {
              setStepDescription(activeStep.description || activeStep.toolName || 'Processing step');
              if (activeStep.verificationResult) {
                setVerificationState(activeStep.verificationResult);
              }
            }
          }
        }
        setActiveWorkflowCount(WorkflowRuntime.listActive().length);
      } else if (event.type === 'verification_updated') {
        const step = event.payload?.step;
        if (step?.verificationResult) {
          setVerificationState(step.verificationResult);
        }
      } else if (event.type === 'unknown_state') {
        setVerificationState('UNKNOWN');
      } else if (event.type === 'mode_changed') {
        setCurrentMode(event.payload?.mode || RezelDirector.getCurrentMode());
      } else if (event.type === 'stream_text') {
        setTranscriptSnippet(event.payload?.text?.slice(-40) ?? '');
      } else if (event.type === 'status_change') {
        setAgentStatus(event.payload?.status ?? 'idle');
      } else if (event.type === 'application_changed') {
        if (event.payload?.session) {
          setAppId(event.payload.session.appId);
          setConnectionStatus(event.payload.session.connectionStatus);
        } else if (typeof event.payload === 'string') {
          setAppId(event.payload);
        }
      }
    };

    RezelDirector.subscribe(handler);
    return () => RezelDirector.unsubscribe(handler);
  }, []);

  const handleCancel = useCallback(() => {
    RezelDirector.interrupt();
  }, []);

  const handleRestore = useCallback(() => {
    if (onRestore) {
      onRestore();
    } else {
      RezelDirector.restoreFullMode().catch(console.error);
    }
  }, [onRestore]);

  const handleOrbClick = useCallback(() => {
    if (effectiveOrbState === 'listening' || effectiveOrbState === 'speaking' || effectiveOrbState === 'thinking') {
      cancelVoice();
    } else {
      startListening();
    }
  }, [effectiveOrbState, cancelVoice, startListening]);

  return (
    <div
      className={`${styles.container} ${className || ''}`}
      role="region"
      aria-label="Rezel Companion Window"
    >
      <CompanionObservation
        appId={appId}
        connectionStatus={connectionStatus}
        verificationState={verificationState}
        mode={currentMode}
        onExpand={handleRestore}
      />

      <CompanionProgress
        workflowName={workflowName}
        stepDescription={stepDescription}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        progressPercentage={progressPercentage}
        activeWorkflowCount={activeWorkflowCount}
      />

      <CompanionControls
        onCancel={handleCancel}
        onRestore={handleRestore}
        orbState={effectiveOrbState}
        onOrbClick={handleOrbClick}
        transcriptSnippet={transcriptSnippet}
      />
    </div>
  );
};

export default CompanionWindow;
