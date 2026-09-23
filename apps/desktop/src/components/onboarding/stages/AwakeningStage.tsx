import React, { useEffect } from 'react';
import { Sparkles, Activity } from 'lucide-react';
import styles from '../OnboardingHost.module.css';

interface StageProps {
  onAdvance: () => void;
}

export const AwakeningStage: React.FC<StageProps> = ({ onAdvance }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onAdvance();
    }, 1800);
    return () => clearTimeout(timer);
  }, [onAdvance]);

  return (
    <div className={styles.stageAwakening}>
      <div className={styles.awakeningPulse}>
        <Sparkles size={36} className="text-cyan-400 animate-pulse" />
      </div>

      <h1 className={styles.stageTitle}>INITIALIZING REZEL</h1>
      <p className={styles.stageSubtitle}>
        Awakening quantum computational core & probing local environment...
      </p>

      <div className={styles.awakeningStatusRow}>
        <Activity size={13} className="text-cyan-400 animate-spin" />
        <span className={styles.techMeta}>DISCOVERING SYSTEM TOPOLOGY</span>
      </div>

      <button
        type="button"
        onClick={onAdvance}
        className={styles.primaryActionButton}
        style={{ marginTop: '24px' }}
      >
        <span>CONTINUE</span>
      </button>
    </div>
  );
};
