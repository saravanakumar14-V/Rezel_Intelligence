import React, { useEffect, useState } from 'react';
import { HardDrive, RefreshCw, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react';
import { OnboardingCoordinator } from '../../../lib/onboarding/OnboardingCoordinator';
import type { LocalAIDiscoveryResult } from '../../../lib/onboarding/types';
import styles from '../OnboardingHost.module.css';

interface StageProps {
  onAdvance: () => void;
  onSkip: () => void;
}

export const LocalAIStage: React.FC<StageProps> = ({ onAdvance, onSkip }) => {
  const [localAI, setLocalAI] = useState<LocalAIDiscoveryResult | undefined>(() => {
    return OnboardingCoordinator.getState().localAI;
  });
  const [probing, setProbing] = useState(false);

  const runProbe = async () => {
    setProbing(true);
    const res = await OnboardingCoordinator.probeLocalAI();
    setLocalAI(res);
    setProbing(false);
  };

  useEffect(() => {
    if (!localAI) {
      runProbe();
    }
  }, [localAI]);

  const isConnected = localAI?.status === 'CONNECTED';

  return (
    <div className={styles.stageStandard}>
      <div className={styles.stageHeader}>
        <span className={styles.stageCategoryTag}>STAGE 05 · LOCAL AI (OLLAMA)</span>
        <h1 className={styles.stageTitle}>Local Model Discovery</h1>
        <p className={styles.stageSubtitle}>
          Rezel integrates natively with Ollama on <span className="font-mono text-cyan-300">http://127.0.0.1:11434</span> for private, zero-cost, offline neural inference.
        </p>
      </div>

      <div className={styles.localAICard}>
        <div className={styles.localAICardHeader}>
          <div className="flex items-center gap-2">
            <HardDrive size={16} className={isConnected ? 'text-emerald-400' : 'text-amber-400'} />
            <span className={styles.localAITitle}>Ollama Local Runtime</span>
          </div>

          <button
            type="button"
            onClick={runProbe}
            className={styles.toolIconBtn}
            disabled={probing}
            title="Re-probe Ollama endpoint"
          >
            <RefreshCw size={12} className={probing ? 'animate-spin' : ''} />
            <span>{probing ? 'PROBING...' : 'REFRESH'}</span>
          </button>
        </div>

        <div className={styles.localAIStatusBox}>
          {isConnected ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs">
                <CheckCircle2 size={14} />
                <span>OLLAMA ACTIVE & REACHABLE · PORT 11434 NOMINAL</span>
              </div>
              <p className={styles.localAIDesc}>
                {localAI?.modelCount && localAI.modelCount > 0
                  ? `Discovered ${localAI.modelCount} installed models: ${localAI.models.slice(0, 3).join(', ')}${localAI.modelCount > 3 ? '...' : ''}`
                  : 'Ollama daemon is running. You can pull models anytime (e.g. ollama run llama3.2).'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-amber-400 font-mono text-xs">
                <AlertCircle size={14} />
                <span>OLLAMA NOT DETECTED ON PORT 11434</span>
              </div>
              <p className={styles.localAIDesc}>
                If you have Ollama installed, ensure the daemon is running in the background. You can start it at any time or continue with cloud providers.
              </p>
            </div>
          )}
        </div>
      </div>

      <div className={styles.stageActionDeck}>
        <button type="button" onClick={onSkip} className={styles.textGhostButton}>
          <span>SKIP LOCAL AI SETUP</span>
        </button>

        <button type="button" onClick={onAdvance} className={styles.primaryActionButton}>
          <span>CONTINUE</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
