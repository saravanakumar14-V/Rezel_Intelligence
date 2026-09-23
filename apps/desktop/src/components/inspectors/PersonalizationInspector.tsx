import { useState, useEffect } from 'react';
import { Palette, Mic, Info } from 'lucide-react';
import InspectorShell from './InspectorShell';
import PersonalizationSection from '../panels/settings/PersonalizationSection';
import VoiceSection from '../panels/settings/VoiceSection';
import AboutSection from '../panels/settings/AboutSection';
import { RezelDirector, type DirectorEvent } from '../../lib/director/RezelDirector';
import type { Mode } from '../../lib/director/types';
import { cn } from '../../lib/cn';
import styles from './PersonalizationInspector.module.css';

interface PersonalizationInspectorProps {
  onClose?: () => void;
}

export default function PersonalizationInspector({ onClose }: PersonalizationInspectorProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'voice' | 'about'>('profile');
  const [currentMode, setCurrentMode] = useState<Mode>(() => RezelDirector.getCurrentMode());

  useEffect(() => {
    const handler = (event: DirectorEvent) => {
      if (event.type === 'mode_changed' && event.payload?.mode) {
        setCurrentMode(event.payload.mode);
      }
    };
    RezelDirector.subscribe(handler);
    return () => RezelDirector.unsubscribe(handler);
  }, []);

  const handleModeSelect = (mode: Mode | 'AUTO') => {
    if (mode === 'AUTO') {
      RezelDirector.clearPersistentMode();
    } else {
      RezelDirector.setMode(mode);
    }
  };

  return (
    <InspectorShell
      title="Personalization & Identity"
      subtitle="Visual Themes, Voice & Agent Behavior"
      onClose={onClose}
    >
      <div className={styles.personalizationRoot}>
        {/* ── Hero Agent Identity Card ─────────────────────────────── */}
        <div className={styles.heroIdentityCard}>
          <div className={styles.heroHeader}>
            <div className={styles.heroTitleGroup}>
              <span className={styles.identityDot} />
              <span>AGENT PERSONALIZATION & BIAS</span>
            </div>
            <span className="font-mono text-[8px] text-[#B388FF] bg-[#B388FF]/15 px-2 py-0.5 rounded border border-[#B388FF]/30">
              MODE: {currentMode}
            </span>
          </div>

          <span className={styles.heroStatusText}>
            HOW REZEL ADAPTS FOR YOU
          </span>

          <p className={styles.heroDescription}>
            Personalization governs visual density, voice response cadence, and local-first AI preferences. Preferences are non-destructive and persist across system sessions.
          </p>

          <div className={styles.heroMetaRow}>
            <span>PERSISTENCE: ENCRYPTED LOCAL CONFIG</span>
            <span>HARDWARE OVERRIDE: NON-DESTRUCTIVE</span>
          </div>
        </div>

        {/* ── Mode Override Quick Selector Strip ───────────────────── */}
        <div className="flex flex-col gap-1.5 p-2.5 rounded-xl bg-[#060B1E]/60 border border-white/5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[8.5px] uppercase tracking-wider text-[#7ECFFF] font-semibold">
              Operating Mode Override
            </span>
            <span className="font-mono text-[8px] text-[#B388FF]">
              ACTIVE: {currentMode}
            </span>
          </div>
          <div className="grid grid-cols-4 gap-1 mt-1">
            {(['AUTO', 'FRIENDLY', 'CREATOR', 'DEVELOPER'] as const).map((m) => {
              const isSelected = m === 'AUTO' ? false : currentMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleModeSelect(m)}
                  className={cn(
                    'py-1.5 rounded-lg font-mono text-[8.5px] font-bold tracking-wider uppercase border transition-all cursor-pointer text-center',
                    isSelected
                      ? 'bg-[#B388FF]/20 text-[#B388FF] border-[#B388FF]/40 shadow-[0_0_8px_rgba(179,136,255,0.2)]'
                      : 'bg-white/5 text-white/50 border-white/10 hover:text-white/80 hover:bg-white/10'
                  )}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Mode Switcher Tabs ───────────────────────────────────── */}
        <div className={styles.modeTabs}>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={cn(
              styles.modeTab,
              activeTab === 'profile' && styles.modeTabActive
            )}
          >
            <Palette size={11} />
            <span>VISUAL & PRESETS</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('voice')}
            className={cn(
              styles.modeTab,
              activeTab === 'voice' && styles.modeTabActive
            )}
          >
            <Mic size={11} />
            <span>VOICE & MULTIMODAL</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('about')}
            className={cn(
              styles.modeTab,
              activeTab === 'about' && styles.modeTabActive
            )}
          >
            <Info size={11} />
            <span>SYSTEM & ABOUT</span>
          </button>
        </div>

        {/* ── Tab Content ─────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          {activeTab === 'profile' && <PersonalizationSection />}
          {activeTab === 'voice' && <VoiceSection />}
          {activeTab === 'about' && <AboutSection />}
        </div>
      </div>
    </InspectorShell>
  );
}
