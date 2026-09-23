import React from 'react';
import { Maximize2 } from 'lucide-react';
import styles from './CompanionWindow.module.css';

export interface CompanionObservationProps {
  appId?: string;
  connectionStatus?: 'CONNECTED' | 'DISCONNECTED';
  verificationState?: 'VERIFIED' | 'NOT_VERIFIED' | 'UNKNOWN' | 'FAILED' | 'RECOVERY_REQUIRED' | null;
  mode?: string;
  onExpand?: () => void;
}

export const CompanionObservation: React.FC<CompanionObservationProps> = ({
  appId = 'blender',
  connectionStatus = 'CONNECTED',
  verificationState,
  mode = 'CREATOR',
  onExpand,
}) => {
  const appDisplayName = appId === 'blender' ? 'Blender' : appId.toUpperCase();
  const isConnected = connectionStatus === 'CONNECTED';

  return (
    <header className={styles.header} role="banner">
      <div className={styles.headerLeft}>
        <span className={styles.brandLabel}>REZEL</span>
        <div
          className={`${styles.appBadge} ${isConnected ? styles.appConnected : styles.appDisconnected}`}
          aria-label={`Application ${appDisplayName} is ${isConnected ? 'connected' : 'disconnected'}`}
        >
          <span className={isConnected ? styles.dotGreen : styles.dotMuted} aria-hidden="true" />
          <span>{appDisplayName}</span>
        </div>
        <span className={styles.modeBadge} aria-label={`Current AI mode: ${mode}`}>
          {mode}
        </span>
      </div>

      <div className={styles.headerRight}>
        {verificationState && (
          <span
            className={`${styles.verifBadge} ${
              styles[`verif-${verificationState.toLowerCase()}`] || styles['verif-verified']
            }`}
          >
            {verificationState === 'VERIFIED'
              ? '✓ VERIFIED'
              : verificationState === 'NOT_VERIFIED'
              ? '⚠ UNCONFIRMED'
              : verificationState === 'UNKNOWN'
              ? '? UNKNOWN'
              : verificationState === 'FAILED'
              ? '✕ FAILED'
              : '⟳ RECOVERY'}
          </span>
        )}

        {onExpand && (
          <button
            type="button"
            onClick={onExpand}
            className={styles.iconButton}
            aria-label="Restore Full Mode"
            title="Restore Full Mode"
          >
            <Maximize2 size={11} aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  );
};
