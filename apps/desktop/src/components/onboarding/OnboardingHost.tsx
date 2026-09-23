import React, { useEffect, useState } from 'react';
import { OnboardingCoordinator } from '../../lib/onboarding/OnboardingCoordinator';
import type { OnboardingStage, OnboardingState } from '../../lib/onboarding/types';
import { AwakeningStage } from './stages/AwakeningStage';
import { EnvironmentStage } from './stages/EnvironmentStage';
import { CapabilitiesStage } from './stages/CapabilitiesStage';
import { HardwareStage } from './stages/HardwareStage';
import { ProvidersStage } from './stages/ProvidersStage';
import { LocalAIStage } from './stages/LocalAIStage';
import { IntegrationsStage } from './stages/IntegrationsStage';
import { PermissionsStage } from './stages/PermissionsStage';
import { PersonalizationStage } from './stages/PersonalizationStage';
import { ReadyStage } from './stages/ReadyStage';
import { Sparkles, RefreshCcw, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import styles from './OnboardingHost.module.css';

interface OnboardingHostProps {
  onComplete: () => void;
}

const STAGE_STEPS: OnboardingStage[] = [
  'awakening',
  'environment',
  'capabilities',
  'hardware',
  'providers',
  'local-ai',
  'integrations',
  'permissions',
  'personalization',
  'ready',
];

export const OnboardingHost: React.FC<OnboardingHostProps> = ({ onComplete }) => {
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(() => {
    return OnboardingCoordinator.getState();
  });

  useEffect(() => {
    const unsub = OnboardingCoordinator.subscribe((s) => {
      setOnboardingState(s);
    });

    return () => unsub();
  }, []);

  const handleAdvance = () => {
    OnboardingCoordinator.advance();
  };

  const handleSkip = () => {
    OnboardingCoordinator.skip();
  };

  const handleFinish = async () => {
    await OnboardingCoordinator.completeOnboarding();
    onComplete();
  };

  const showResumePrompt = onboardingState.interrupted && !onboardingState.completed;
  const currentStage = STAGE_STEPS.includes(onboardingState.currentStage)
    ? onboardingState.currentStage
    : 'awakening';
  const currentStageIndex = STAGE_STEPS.indexOf(currentStage);

  return (
    <div className={styles.onboardingOverlay} role="dialog" aria-modal="true" aria-label="Rezel Onboarding">
      <div className={styles.onboardingCardContainer}>
        {/* Stepper Header */}
        <div className={styles.stepperHeader}>
          <div className={styles.brandGroup}>
            <Sparkles size={14} className="text-cyan-400" />
            <span className={styles.brandLabel}>REZEL OS</span>
          </div>

          <div className="flex items-center gap-3">
            <span className={styles.stageIndicatorPill}>
              STEP {currentStageIndex + 1} OF {STAGE_STEPS.length}
            </span>

            <div className={styles.progressTrack} aria-hidden="true">
              {STAGE_STEPS.map((stage, idx) => {
                const isCompleted = onboardingState.completedStages.includes(stage) || idx < currentStageIndex;
                const isActive = idx === currentStageIndex;
                return (
                  <div
                    key={stage}
                    className={cn(
                      styles.progressSegment,
                      isCompleted && styles.progressSegmentCompleted,
                      isActive && styles.progressSegmentActive
                    )}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Interruption Recovery Modal */}
        {showResumePrompt ? (
          <div
            className={styles.resumePromptCard}
            role="alertdialog"
            aria-label="Previous Setup Detected"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                OnboardingCoordinator.continueInterruptedSetup();
              }
            }}
          >
            <h2 className={styles.stageTitle}>Previous Setup Detected</h2>
            <p className={styles.stageSubtitle}>
              Rezel saved your progress from a previous session. Would you like to continue from where you left off or restart?
            </p>
            <div className={styles.resumeButtonsRow}>
              <button
                type="button"
                onClick={() => {
                  OnboardingCoordinator.restart();
                }}
                className={styles.secondaryButton}
                aria-label="Restart onboarding from beginning"
              >
                <RefreshCcw size={12} />
                <span>RESTART FROM BEGINNING</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  OnboardingCoordinator.continueInterruptedSetup();
                }}
                className={styles.primaryActionButton}
                autoFocus
                aria-label="Continue setup from saved stage"
              >
                <span>CONTINUE SETUP</span>
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        ) : (
          /* Dynamic Stage Renderer */
          <>
            {currentStage === 'awakening' && <AwakeningStage onAdvance={handleAdvance} />}
            {currentStage === 'environment' && <EnvironmentStage onAdvance={handleAdvance} />}
            {currentStage === 'capabilities' && <CapabilitiesStage onAdvance={handleAdvance} />}
            {currentStage === 'hardware' && <HardwareStage onAdvance={handleAdvance} />}
            {currentStage === 'providers' && <ProvidersStage onAdvance={handleAdvance} onSkip={handleSkip} />}
            {currentStage === 'local-ai' && <LocalAIStage onAdvance={handleAdvance} onSkip={handleSkip} />}
            {currentStage === 'integrations' && <IntegrationsStage onAdvance={handleAdvance} onSkip={handleSkip} />}
            {currentStage === 'permissions' && <PermissionsStage onAdvance={handleAdvance} />}
            {currentStage === 'personalization' && <PersonalizationStage onAdvance={handleAdvance} />}
            {currentStage === 'ready' && <ReadyStage onComplete={handleFinish} />}
          </>
        )}
      </div>
    </div>
  );
};
