import React, { useState } from 'react';
import { Sliders, Check, ChevronRight } from 'lucide-react';
import { OnboardingCoordinator } from '../../../lib/onboarding/OnboardingCoordinator';
import type { InitialPreferences } from '../../../lib/onboarding/types';
import { cn } from '../../../lib/cn';
import styles from '../OnboardingHost.module.css';

interface StageProps {
  onAdvance: () => void;
}

export const PersonalizationStage: React.FC<StageProps> = ({ onAdvance }) => {
  const [preferences, setPreferences] = useState<InitialPreferences>(() => {
    return OnboardingCoordinator.getState().preferences;
  });

  const handleUpdate = (partial: Partial<InitialPreferences>) => {
    const updated = { ...preferences, ...partial };
    setPreferences(updated);
    OnboardingCoordinator.applyPreferences(partial);
  };

  return (
    <div className={styles.stageStandard}>
      <div className={styles.stageHeader}>
        <span className={styles.stageCategoryTag}>STAGE 08 · PERSONALIZATION & DEFAULTS</span>
        <h1 className={styles.stageTitle}>Your Rezel Experience</h1>
        <p className={styles.stageSubtitle}>
          Choose your initial atmosphere and communication defaults. These can be adjusted anytime.
        </p>
      </div>

      <div className={styles.personalizationGrid}>
        {/* 1. Experience Style */}
        <div className={styles.preferenceGroup}>
          <div className="flex items-center gap-2 mb-2">
            <Sliders size={14} className="text-cyan-400" />
            <span className={styles.prefGroupTitle}>Experience Atmosphere</span>
          </div>
          <div className={styles.prefButtonsRow}>
            {(['Calm', 'Balanced', 'Technical'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                className={cn(styles.prefOptionBtn, preferences.experienceStyle === opt && styles.prefOptionBtnActive)}
                onClick={() => handleUpdate({ experienceStyle: opt })}
              >
                {preferences.experienceStyle === opt && <Check size={11} className="text-cyan-400" />}
                <span>{opt}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 2. Voice Intelligence */}
        <div className={styles.preferenceGroup}>
          <span className={styles.prefGroupTitle}>Voice Audio Responses</span>
          <div className={styles.prefButtonsRow}>
            {[
              { label: 'Voice Active (Warm Speech)', val: true },
              { label: 'Visual Chat Only', val: false },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                className={cn(styles.prefOptionBtn, preferences.voiceEnabled === opt.val && styles.prefOptionBtnActive)}
                onClick={() => handleUpdate({ voiceEnabled: opt.val })}
              >
                {preferences.voiceEnabled === opt.val && <Check size={11} className="text-cyan-400" />}
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 3. Workspace Density */}
        <div className={styles.preferenceGroup}>
          <span className={styles.prefGroupTitle}>Interface Density</span>
          <div className={styles.prefButtonsRow}>
            {(['Spacious', 'Balanced', 'Dense'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                className={cn(styles.prefOptionBtn, preferences.workspaceDensity === opt && styles.prefOptionBtnActive)}
                onClick={() => handleUpdate({ workspaceDensity: opt })}
              >
                {preferences.workspaceDensity === opt && <Check size={11} className="text-cyan-400" />}
                <span>{opt}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 4. AI Routing Bias */}
        <div className={styles.preferenceGroup}>
          <span className={styles.prefGroupTitle}>AI Engine Routing Bias</span>
          <div className={styles.prefButtonsRow}>
            {(['Local-first', 'Balanced', 'Cloud-first'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                className={cn(styles.prefOptionBtn, preferences.aiPreference === opt && styles.prefOptionBtnActive)}
                onClick={() => handleUpdate({ aiPreference: opt })}
              >
                {preferences.aiPreference === opt && <Check size={11} className="text-cyan-400" />}
                <span>{opt}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.stageActionDeck}>
        <span className={styles.techMeta}>PREFERENCES INITIALIZED</span>

        <button type="button" onClick={onAdvance} className={styles.primaryActionButton}>
          <span>COMPLETE SETUP</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
