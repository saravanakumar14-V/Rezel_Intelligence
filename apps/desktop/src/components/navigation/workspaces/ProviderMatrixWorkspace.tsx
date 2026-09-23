import React, { useState } from 'react';
import { ProviderRouter } from '../../../lib/ai/providers/ProviderRouter';
import { ProviderHealthManager } from '../../../lib/ai/providers/ProviderHealthManager';
import { ProviderAuthManager } from '../../../lib/ai/providers/ProviderAuthManager';
import type { RoutingProfile, ProviderVendor } from '../../../lib/ai/providers/types';
import { cn } from '../../../lib/cn';
import styles from '../SpatialSurface.module.css';

export const ProviderMatrixWorkspace: React.FC = () => {
  const [activeRoutingProfile, setActiveRoutingProfile] = useState<RoutingProfile>(() => {
    return ProviderRouter.getRoutingProfile ? ProviderRouter.getRoutingProfile() : 'AUTO';
  });

  const handleSetRoutingProfile = (profile: RoutingProfile) => {
    setActiveRoutingProfile(profile);
    if (ProviderRouter.setRoutingProfile) {
      ProviderRouter.setRoutingProfile(profile);
    }
  };

  return (
    <div className={styles.taskProviderMatrix}>
      <div className={styles.routingProfileSelector}>
        <span className={styles.settingMiniLabel}>ACTIVE ROUTING PROFILE:</span>
        <div className={styles.profileButtonGroup}>
          {(['AUTO', 'SPEED', 'COST_SAVER', 'QUALITY', 'LOCAL'] as RoutingProfile[]).map((prof) => (
            <button
              key={prof}
              type="button"
              className={cn(
                styles.profileOptionBtn,
                activeRoutingProfile === prof && styles.profileOptionBtnActive
              )}
              onClick={() => handleSetRoutingProfile(prof)}
            >
              {prof}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.providerCardList}>
        {(['GEMINI', 'OPENAI', 'ANTHROPIC', 'OLLAMA', 'LOCAL'] as ProviderVendor[]).map((vendor) => {
          const health = ProviderHealthManager.getProviderHealth(vendor);
          const auth = ProviderAuthManager.getAuthorization(vendor);
          const isHealthy = health.state === 'HEALTHY';

          return (
            <div key={vendor} className={styles.providerCard}>
              <div className={styles.providerCardHeader}>
                <span className={styles.providerName}>{vendor}</span>
                <span
                  className={cn(
                    styles.providerStatusBadge,
                    isHealthy ? styles.statusHealthy : styles.statusDegraded
                  )}
                >
                  {health.state}
                </span>
              </div>
              <div className={styles.providerMetrics}>
                <span>Status: {auth.enabled ? 'Enabled' : 'Disabled'}</span>
                <span>Daily Cap: ${auth.maxDailyCostUSD.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
