import React from 'react';
import {
  Sparkles,
  Award,
  Cpu,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  Compass,
} from 'lucide-react';
import { OnboardingCoordinator } from '../../../lib/onboarding/OnboardingCoordinator';
import { ProviderAuthManager } from '../../../lib/ai/providers/ProviderAuthManager';
import { accessFieldBus } from '../../navigation/accessFieldState';
import styles from '../OnboardingHost.module.css';

interface StageProps {
  onComplete: () => void;
}

export const ReadyStage: React.FC<StageProps> = ({ onComplete }) => {
  const state = OnboardingCoordinator.getState();
  const env = state.environment;
  const hw = state.hardwareProfile;
  const localAI = state.localAI;

  const enabledVendors = ['GEMINI', 'OPENAI', 'ANTHROPIC', 'OLLAMA'].filter((v) => {
    return ProviderAuthManager.getAuthorization(v as any).enabled;
  });

  const handleStartApp = () => {
    onComplete();
  };

  const handleExploreCapabilities = () => {
    onComplete();
    setTimeout(() => {
      accessFieldBus.open();
    }, 400);
  };

  return (
    <div className={styles.stageStandard}>
      <div className={styles.readyHeroRow}>
        <div className={styles.readyIconOrb}>
          <Sparkles size={28} className="text-amber-400 animate-pulse" />
        </div>
        <div className="flex flex-col">
          <span className={styles.stageCategoryTag}>STAGE 09 · SYSTEM READY</span>
          <h1 className={styles.readyTitle}>Rezel is Initialized</h1>
          <p className={styles.stageSubtitle}>
            Your quantum workspace has been calibrated to your machine. All execution boundaries and runtime channels are nominal.
          </p>
        </div>
      </div>

      <div className={styles.readySummaryDeck}>
        <div className={styles.summaryItem}>
          <div className={styles.summaryItemHeader}>
            <Cpu size={14} className="text-cyan-400" />
            <span className={styles.summaryKey}>AI ROUTING MATRIX</span>
          </div>
          <span className={styles.summaryVal}>
            {enabledVendors.length > 0
              ? `${enabledVendors.length} Providers Active (${enabledVendors.join(', ')})`
              : 'Local-First Architecture Active'}
          </span>
        </div>

        <div className={styles.summaryItem}>
          <div className={styles.summaryItemHeader}>
            <Award size={14} className="text-amber-400" />
            <span className={styles.summaryKey}>HARDWARE CALIBRATION</span>
          </div>
          <span className={styles.summaryVal}>
            {hw?.tier || 'MEDIUM'} Tier · {env?.cpuCores ? `${env.cpuCores} Cores` : 'Safe Defaults'}{env?.totalMemoryGB ? ` · ${env.totalMemoryGB.toFixed(0)} GB RAM` : ''}
          </span>
        </div>

        <div className={styles.summaryItem}>
          <div className={styles.summaryItemHeader}>
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span className={styles.summaryKey}>LOCAL NEURAL RUNTIME</span>
          </div>
          <span className={styles.summaryVal}>
            {localAI?.status === 'CONNECTED'
              ? `Ollama Connected (${localAI.modelCount} Models)`
              : 'Ollama Standby / Cloud Hybrid'}
          </span>
        </div>

        <div className={styles.summaryItem}>
          <div className={styles.summaryItemHeader}>
            <ShieldCheck size={14} className="text-purple-400" />
            <span className={styles.summaryKey}>SECURITY ENFORCEMENT</span>
          </div>
          <span className={styles.summaryVal}>
            Safe Defaults Active · Granular Human Confirmation Enabled
          </span>
        </div>
      </div>

      <div className={styles.readyActionRow}>
        <button
          type="button"
          onClick={handleExploreCapabilities}
          className={styles.secondaryButton}
          title="Open Cognitive Field to explore capabilities"
        >
          <Compass size={14} />
          <span>EXPLORE CAPABILITIES</span>
        </button>

        <button
          type="button"
          onClick={handleStartApp}
          className={styles.primaryActionButton}
          title="Launch Rezel Workspace"
        >
          <span>START REZEL</span>
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};
