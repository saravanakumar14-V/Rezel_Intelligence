import React, { useEffect, useState } from 'react';
import { Award, Check, ChevronRight } from 'lucide-react';
import { OnboardingCoordinator } from '../../../lib/onboarding/OnboardingCoordinator';
import type { HardwareCapabilityProfile } from '../../../lib/onboarding/types';
import styles from '../OnboardingHost.module.css';

interface StageProps {
  onAdvance: () => void;
}

export const HardwareStage: React.FC<StageProps> = ({ onAdvance }) => {
  const [profile, setProfile] = useState<HardwareCapabilityProfile | undefined>(() => {
    return OnboardingCoordinator.getState().hardwareProfile;
  });

  useEffect(() => {
    if (!profile) {
      OnboardingCoordinator.probeEnvironment().then(() => {
        setProfile(OnboardingCoordinator.getState().hardwareProfile);
      });
    }
  }, [profile]);

  return (
    <div className={styles.stageStandard}>
      <div className={styles.stageHeader}>
        <span className={styles.stageCategoryTag}>STAGE 03 · HARDWARE CAPABILITY PROFILE</span>
        <h1 className={styles.stageTitle}>Computational Tier</h1>
        <p className={styles.stageSubtitle}>
          Based on your CPU, memory, and graphics subsystem, Rezel has calibrated its performance tier.
        </p>
      </div>

      <div className={styles.tierShowcaseCard}>
        <div className={styles.tierBadgeRow}>
          <div className={styles.tierPill}>
            <Award size={16} className="text-amber-400" />
            <span className={styles.tierPillText}>{profile?.tier || 'HIGH'} PERFORMANCE TIER</span>
          </div>
          <span className={styles.tierSubHeader}>{profile?.summary || 'Optimized for high-concurrency intelligence.'}</span>
        </div>

        <div className={styles.recommendationsList}>
          <span className={styles.recommendationTitle}>CALIBRATED FOR:</span>
          {(profile?.recommendations || [
            'Local 7B - 14B model execution (Ollama / GGUF)',
            'Full 60 FPS spatial visual experience & bloom',
            'Multi-provider hybrid routing enabled',
          ]).map((rec, idx) => (
            <div key={idx} className={styles.recommendationItem}>
              <Check size={13} className="text-emerald-400 shrink-0" />
              <span>{rec}</span>
            </div>
          ))}
        </div>

        <div className={styles.specsCompactRow}>
          <span>CPU: {profile?.specs.cpu || 'Multi-Core Processor'}</span>
          <span>·</span>
          <span>RAM: {profile?.specs.ram || '16 GB RAM'}</span>
          <span>·</span>
          <span>GPU: {profile?.specs.gpu || 'Hardware Accelerated'}</span>
        </div>
      </div>

      <div className={styles.stageActionDeck}>
        <span className={styles.techMeta}>CALIBRATION COMPLETE</span>

        <button type="button" onClick={onAdvance} className={styles.primaryActionButton}>
          <span>CONTINUE</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
