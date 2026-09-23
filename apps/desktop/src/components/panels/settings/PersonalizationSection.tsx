import { useState, useEffect } from 'react';
import { Sparkles, RotateCcw } from 'lucide-react';
import {
  PersonalizationManager,
} from '../../../lib/personalization/PersonalizationManager';
import type {
  PersonalizationProfile,
  VisualPreset,
  UIDensity,
} from '../../../lib/personalization/types';
import { cn } from '../../../lib/cn';
import styles from './PersonalizationSection.module.css';

const PRESETS: VisualPreset[] = ['CALM', 'FOCUS', 'DYNAMIC', 'MINIMAL'];

export default function PersonalizationSection() {
  const [profile, setProfile] = useState<PersonalizationProfile>(() =>
    PersonalizationManager.getProfile()
  );

  useEffect(() => {
    const unsub = PersonalizationManager.subscribe((p) => {
      setProfile(p);
    });
    return () => unsub();
  }, []);

  const handlePresetSelect = (preset: VisualPreset) => {
    PersonalizationManager.updateVisual({ preset });
  };

  const handleDensityToggle = () => {
    const next: UIDensity = profile.visual.density === 'COMFORTABLE' ? 'COMPACT' : 'COMFORTABLE';
    PersonalizationManager.updateVisual({ density: next });
  };

  const handleLocalFirstToggle = () => {
    PersonalizationManager.updateAI({ localFirst: !profile.ai.localFirst });
  };

  const handleResetAll = () => {
    PersonalizationManager.resetAll();
  };

  return (
    <div className={styles.sectionRoot} role="region" aria-label="Personalization & Preferences">
      <div className={styles.titleRow}>
        <div className="flex items-center gap-1.5">
          <Sparkles size={12} className="text-[#00E5FF]" />
          <span className={styles.sectionHeading}>PERSONALIZATION</span>
        </div>
        <button
          type="button"
          onClick={handleResetAll}
          className={styles.resetBtn}
          title="Reset personalization to defaults"
        >
          <RotateCcw size={10} className="inline mr-1" />
          Reset
        </button>
      </div>

      {/* Preset Selector */}
      <div className="flex flex-col gap-1.5">
        <span className={styles.controlLabel}>ENVIRONMENT PRESET</span>
        <div className={styles.presetGrid}>
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => handlePresetSelect(preset)}
              className={cn(
                styles.presetBtn,
                profile.visual.preset === preset && styles.presetBtnActive
              )}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {/* Density & Routing Toggles */}
      <div className="flex flex-col gap-1">
        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>UI Density</span>
          <button
            type="button"
            onClick={handleDensityToggle}
            className={styles.toggleBtn}
          >
            {profile.visual.density}
          </button>
        </div>

        <div className={styles.controlRow}>
          <span className={styles.controlLabel}>Local-First AI Routing</span>
          <button
            type="button"
            onClick={handleLocalFirstToggle}
            className={styles.toggleBtn}
          >
            {profile.ai.localFirst ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>
      </div>
    </div>
  );
}
