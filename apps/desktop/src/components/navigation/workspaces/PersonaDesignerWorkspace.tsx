import React, { useState, useEffect } from 'react';
import { RezelDirector } from '../../../lib/director/RezelDirector';
import { LocalMemory } from '../../../lib/memory/LocalMemory';
import type { Mode } from '../../../lib/director/types';
import { cn } from '../../../lib/cn';
import styles from '../SpatialSurface.module.css';

const THEME_OPTIONS = [
  { label: 'Soft Cosmic (Default)', mode: 'FRIENDLY' as Mode, key: 'soft' },
  { label: 'Holographic', mode: 'CREATOR' as Mode, key: 'holographic' },
  { label: 'Terminal Obsidian', mode: 'DEVELOPER' as Mode, key: 'terminal' },
];

export const PersonaDesignerWorkspace: React.FC = () => {
  // Read current canonical mode from RezelDirector
  const [selectedThemeKey, setSelectedThemeKey] = useState<string>(() => {
    try {
      const mode = RezelDirector.getCurrentMode();
      if (mode === 'CREATOR') return 'holographic';
      if (mode === 'DEVELOPER') return 'terminal';
      return 'soft';
    } catch {
      return 'soft';
    }
  });

  const [responseBrevity, setResponseBrevity] = useState<number>(() => {
    try {
      const persisted = LocalMemory.getEntry('user_brevity')?.value;
      return persisted ? parseInt(persisted, 10) : 85;
    } catch {
      return 85;
    }
  });

  const [reasoningDepth, setReasoningDepth] = useState<number>(() => {
    try {
      const persisted = LocalMemory.getEntry('user_reasoning_depth')?.value;
      return persisted ? parseInt(persisted, 10) : 100;
    } catch {
      return 100;
    }
  });

  useEffect(() => {
    // Ensure memory is loaded
    LocalMemory.load().catch(() => {});
  }, []);

  const handleSelectTheme = (opt: typeof THEME_OPTIONS[0]) => {
    setSelectedThemeKey(opt.key);
    // Update canonical RezelDirector experience mode & emit profile_changed
    RezelDirector.setMode(opt.mode);
    LocalMemory.setEntry('user_theme', opt.key, 'preference');
    LocalMemory.save().catch(() => {});
  };

  const handleBrevityChange = (val: number) => {
    setResponseBrevity(val);
    LocalMemory.setEntry('user_brevity', String(val), 'preference');
    LocalMemory.save().catch(() => {});
  };

  const handleReasoningDepthChange = (val: number) => {
    setReasoningDepth(val);
    LocalMemory.setEntry('user_reasoning_depth', String(val), 'preference');
    LocalMemory.save().catch(() => {});
  };

  return (
    <div className={styles.taskPersonaDesigner}>
      <div className={styles.themeSelectorGroup}>
        <span className={styles.themeLabel}>Visual Atmosphere Theme</span>
        <div className={styles.themeButtonsRow}>
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={cn(
                styles.themeOptionButton,
                selectedThemeKey === opt.key && styles.themeOptionButtonActive
              )}
              onClick={() => handleSelectTheme(opt)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.sliderGroup}>
        <div className={styles.sliderRow}>
          <div className={styles.sliderLabelCol}>
            <span>Response Brevity</span>
            <span className="text-cyan-300 font-mono text-xs">{responseBrevity}%</span>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            value={responseBrevity}
            onChange={(e) => handleBrevityChange(parseInt(e.target.value, 10))}
            className={styles.rangeInput}
          />
        </div>

        <div className={styles.sliderRow}>
          <div className={styles.sliderLabelCol}>
            <span>Reasoning Thought Detail</span>
            <span className="text-cyan-300 font-mono text-xs">{reasoningDepth}%</span>
          </div>
          <input
            type="range"
            min="10"
            max="100"
            value={reasoningDepth}
            onChange={(e) => handleReasoningDepthChange(parseInt(e.target.value, 10))}
            className={styles.rangeInput}
          />
        </div>
      </div>
    </div>
  );
};
