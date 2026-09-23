import React from 'react';
import styles from './CompanionWindow.module.css';

export interface CompanionProgressProps {
  workflowName?: string;
  stepDescription?: string;
  stepIndex?: number;
  totalSteps?: number;
  progressPercentage?: number;
  activeWorkflowCount?: number;
}

export const CompanionProgress: React.FC<CompanionProgressProps> = ({
  workflowName = 'Active Automation',
  stepDescription = 'Processing steps...',
  stepIndex = 1,
  totalSteps = 1,
  progressPercentage = 0,
  activeWorkflowCount = 1,
}) => {
  const percent = Math.min(100, Math.max(0, progressPercentage));

  return (
    <div className={styles.body} role="region" aria-label="Workflow progress">
      {/* Workflow Title & Multi-Workflow Indicator */}
      <div className={styles.workflowHeader}>
        <span className={styles.workflowTitle} title={workflowName}>
          {workflowName}
        </span>
        {activeWorkflowCount > 1 && (
          <span
            className={styles.bgCountBadge}
            aria-label={`${activeWorkflowCount - 1} background workflows active`}
          >
            +{activeWorkflowCount - 1} BG
          </span>
        )}
      </div>

      {/* Step Description & Counter */}
      <div className={styles.stepRow}>
        <span className={styles.stepDescription} title={stepDescription}>
          {stepDescription}
        </span>
        <span className={styles.stepCounter} aria-label={`Step ${stepIndex} of ${totalSteps}`}>
          STEP {stepIndex}/{totalSteps}
        </span>
      </div>

      {/* Progress Track */}
      <div className={styles.progressTrack} aria-hidden="true">
        <div className={styles.progressFill} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
};
