import React from 'react';
import CommandOrb, { type OrbState } from '../hud/CommandOrb';
import styles from './CompanionWindow.module.css';

export interface CompanionControlsProps {
  onCancel: () => void;
  onRestore: () => void;
  onPause?: () => void;
  onResume?: () => void;
  isPaused?: boolean;
  isPauseSupported?: boolean;
  orbState?: OrbState;
  onOrbClick?: () => void;
  transcriptSnippet?: string;
}

export const CompanionControls: React.FC<CompanionControlsProps> = ({
  onCancel,
  onRestore,
  onPause,
  onResume,
  isPaused = false,
  isPauseSupported = false,
  orbState = 'idle',
  onOrbClick,
  transcriptSnippet,
}) => {
  const voiceStateText =
    transcriptSnippet ||
    (orbState === 'listening'
      ? 'Listening...'
      : orbState === 'speaking'
      ? 'Speaking...'
      : orbState === 'thinking'
      ? 'Processing...'
      : orbState === 'interrupted'
      ? 'Interrupted'
      : 'Ready');

  return (
    <footer className={styles.footer} role="contentinfo">
      {/* Left: Mini Orb & Voice Status */}
      <div className={styles.footerLeft}>
        <div className={styles.orbWrapper} onClick={onOrbClick} role="button" aria-label="Toggle voice input">
          <CommandOrb state={orbState} />
        </div>
        <div className={styles.voiceInfo}>
          <span className={styles.voiceLabel}>VOICE</span>
          <span className={styles.voiceSnippet} title={voiceStateText}>
            {voiceStateText}
          </span>
        </div>
      </div>

      {/* Right: Actions */}
      <div className={styles.footerRight}>
        {isPauseSupported && (
          <button
            type="button"
            onClick={isPaused ? onResume : onPause}
            className={styles.cancelButton}
            aria-label={isPaused ? 'Resume workflow' : 'Pause workflow'}
          >
            {isPaused ? 'Resume' : 'Pause'}
          </button>
        )}

        <button
          type="button"
          onClick={onCancel}
          className={styles.cancelButton}
          aria-label="Cancel active workflow"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={onRestore}
          className={styles.restoreButton}
          aria-label="Restore to full screen"
        >
          Restore
        </button>
      </div>
    </footer>
  );
};
