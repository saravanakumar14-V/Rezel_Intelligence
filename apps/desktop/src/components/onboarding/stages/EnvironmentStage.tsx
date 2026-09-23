import React, { useEffect, useState, useCallback } from 'react';
import {
  Cpu,
  HardDrive,
  Monitor,
  Wifi,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ChevronRight,
} from 'lucide-react';
import { OnboardingCoordinator } from '../../../lib/onboarding/OnboardingCoordinator';
import type { DiscoveredEnvironment } from '../../../lib/onboarding/types';
import styles from '../OnboardingHost.module.css';

interface StageProps {
  onAdvance: () => void;
}

type DiscoveryStatus = 'LOADING' | 'SUCCESS' | 'PARTIAL' | 'UNAVAILABLE';

export const EnvironmentStage: React.FC<StageProps> = ({ onAdvance }) => {
  const [status, setStatus] = useState<DiscoveryStatus>('LOADING');
  const [env, setEnv] = useState<DiscoveredEnvironment | undefined>(() => {
    return OnboardingCoordinator.getState().environment;
  });

  const runDiscovery = useCallback(async () => {
    setStatus('LOADING');
    try {
      await OnboardingCoordinator.probeEnvironment();
      const discovered = OnboardingCoordinator.getState().environment;
      if (discovered) {
        setEnv(discovered);
        setStatus('SUCCESS');
      } else {
        setStatus('PARTIAL');
      }
    } catch {
      setStatus('PARTIAL');
    }
  }, []);

  useEffect(() => {
    if (!env) {
      runDiscovery();
    } else {
      setStatus('SUCCESS');
    }
  }, [env, runDiscovery]);

  const handleContinue = () => {
    onAdvance();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleContinue();
    }
  };

  return (
    <div className={styles.stageStandard} tabIndex={0} onKeyDown={handleKeyDown}>
      <div className={styles.stageHeader}>
        <span className={styles.stageCategoryTag}>STAGE 01 · ENVIRONMENT DISCOVERY</span>
        <h1 className={styles.stageTitle}>Your System Environment</h1>
        <p className={styles.stageSubtitle}>
          Rezel has probed your local hardware characteristics to configure optimal execution parameters.
        </p>
      </div>

      <div className={styles.specsGrid}>
        <div className={styles.specCard}>
          <div className={styles.specCardHeader}>
            <Cpu size={16} className="text-cyan-400" />
            <span className={styles.specLabel}>PROCESSOR</span>
          </div>
          <span className={styles.specValue}>
            {status === 'LOADING' ? 'Detecting CPU architecture...' : env?.cpuName || '—'}
          </span>
          <span className={styles.specSub}>
            {env?.cpuCores ? `${env.cpuCores} Physical/Logical Compute Threads` : 'Threads not detected'}
          </span>
        </div>

        <div className={styles.specCard}>
          <div className={styles.specCardHeader}>
            <Monitor size={16} className="text-amber-400" />
            <span className={styles.specLabel}>GRAPHICS ADAPTER</span>
          </div>
          <span className={styles.specValue}>
            {status === 'LOADING' ? 'Probing GPU subsystem...' : env?.gpuDevice || '—'}
          </span>
          <span className={styles.specSub}>
            {env?.gpuDevice ? 'Hardware Acceleration Active' : 'GPU telemetry unavailable'}
          </span>
        </div>

        <div className={styles.specCard}>
          <div className={styles.specCardHeader}>
            <HardDrive size={16} className="text-purple-400" />
            <span className={styles.specLabel}>MEMORY & STORAGE</span>
          </div>
          <span className={styles.specValue}>
            {status === 'LOADING'
              ? 'Probing memory...'
              : env?.totalMemoryGB
              ? `${env.totalMemoryGB.toFixed(0)} GB System RAM`
              : '—'}
          </span>
          <span className={styles.specSub}>
            {env?.storageFreeGB
              ? `${env.storageFreeGB.toFixed(0)} GB Storage Available`
              : 'Storage telemetry unavailable'}
          </span>
        </div>

        <div className={styles.specCard}>
          <div className={styles.specCardHeader}>
            <Wifi size={16} className="text-emerald-400" />
            <span className={styles.specLabel}>PLATFORM & NETWORK</span>
          </div>
          <span className={styles.specValue}>
            {env?.os || 'Platform not detected'}
          </span>
          <span className={styles.specSub}>
            {env?.isNetworkConnected !== undefined
              ? env.isNetworkConnected
                ? 'Network Connected'
                : 'Offline / Local Only'
              : 'Network status unavailable'}
          </span>
        </div>
      </div>

      <div className={styles.stageActionDeck}>
        <div className="flex items-center gap-3">
          {status === 'SUCCESS' ? (
            <div className={styles.statusVerifiedRow}>
              <CheckCircle2 size={13} className="text-emerald-400" />
              <span>ENVIRONMENT CHARACTERISTICS VERIFIED</span>
            </div>
          ) : status === 'LOADING' ? (
            <div className="flex items-center gap-2 font-mono text-[10px] text-cyan-400">
              <RefreshCw size={12} className="animate-spin" />
              <span>PROBING SYSTEM TOPOLOGY...</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 font-mono text-[10px] text-amber-400">
              <AlertCircle size={12} />
              <span>PARTIAL TELEMETRY (SAFE DEFAULTS LOADED)</span>
            </div>
          )}

          {status !== 'LOADING' && status !== 'SUCCESS' && (
            <button
              type="button"
              onClick={runDiscovery}
              className={styles.toolIconBtn}
              title="Retry system discovery"
            >
              <RefreshCw size={11} />
              <span>RETRY</span>
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleContinue}
          className={styles.primaryActionButton}
          autoFocus
          aria-label="Continue to next stage"
        >
          <span>CONTINUE</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
