/**
 * Rezel OS — ActiveProviderBadge (Milestone 11.2A)
 *
 * Compact HUD / Companion status pill displaying active model, source, and health state.
 */

import { useState, useEffect } from 'react';
import { ProviderHealthManager } from '../../lib/ai/providers/ProviderHealthManager';
import { ProviderRouter } from '../../lib/ai/providers/ProviderRouter';
import type { ProviderVendor, HealthState } from '../../lib/ai/providers/types';
import styles from './ActiveProviderBadge.module.css';

export interface ActiveProviderBadgeProps {
  vendor?: ProviderVendor;
  modelDisplayName?: string;
  isFailoverActive?: boolean;
  failoverSourceVendor?: ProviderVendor;
  className?: string;
}

export default function ActiveProviderBadge({
  vendor: initialVendor = 'GEMINI',
  modelDisplayName: initialModelDisplayName = '2.0 Flash',
  isFailoverActive: initialIsFailoverActive = false,
  failoverSourceVendor: initialFailoverSourceVendor,
  className,
}: ActiveProviderBadgeProps) {
  const [currentVendor, setCurrentVendor] = useState<ProviderVendor>(initialVendor);
  const [currentModel, setCurrentModel] = useState<string>(initialModelDisplayName);
  const [isFailover, setIsFailover] = useState<boolean>(initialIsFailoverActive);
  const [fallbackFrom, setFallbackFrom] = useState<ProviderVendor | undefined>(initialFailoverSourceVendor);
  const [healthState, setHealthState] = useState<HealthState>('HEALTHY');

  useEffect(() => {
    const updateHealth = () => {
      const h = ProviderHealthManager.getProviderHealth(currentVendor);
      setHealthState(h.state);
    };

    updateHealth();
    const unsubHealth = ProviderHealthManager.subscribe(updateHealth);

    const unsubRouter = ProviderRouter.subscribe((evt) => {
      if (evt.type === 'provider_selected') {
        setCurrentVendor(evt.vendor);
        if (evt.modelId) setCurrentModel(evt.modelId);
        setIsFailover(false);
        setFallbackFrom(undefined);
      } else if (evt.type === 'provider_fallback') {
        setFallbackFrom(currentVendor);
        setCurrentVendor(evt.vendor);
        if (evt.modelId) setCurrentModel(evt.modelId);
        setIsFailover(true);
      }
    });

    return () => {
      unsubHealth();
      unsubRouter();
    };
  }, [currentVendor]);

  const getDotClass = () => {
    if (healthState === 'HEALTHY' || healthState === 'PROBING') return styles.dotHealthy;
    if (healthState === 'RATE_LIMITED' || healthState === 'QUOTA_EXHAUSTED' || healthState === 'DEGRADED') {
      return styles.dotWarning;
    }
    if (healthState === 'AUTH_FAILED') return styles.dotError;
    return styles.dot;
  };

  return (
    <div className={`${styles.badge} ${className || ''}`} title={`Active AI: ${currentVendor} (${currentModel}) - State: ${healthState}`}>
      <span className={`${styles.dot} ${getDotClass()}`} />
      {isFailover && fallbackFrom ? (
        <>
          <span className={styles.model}>↻ {fallbackFrom} →</span>
          <span className={styles.vendor}>{currentVendor}</span>
        </>
      ) : (
        <>
          <span className={styles.vendor}>{currentVendor}</span>
          <span className={styles.divider}>·</span>
          <span className={styles.model}>{currentModel}</span>
        </>
      )}
    </div>
  );
}
