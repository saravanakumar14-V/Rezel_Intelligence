import React, { useState } from 'react';
import { Key, Check, CheckCircle2, ChevronRight, ShieldCheck, Sparkles } from 'lucide-react';
import { ProviderAuthManager } from '../../../lib/ai/providers/ProviderAuthManager';
import type { ProviderVendor } from '../../../lib/ai/providers/types';
import styles from '../OnboardingHost.module.css';

interface StageProps {
  onAdvance: () => void;
  onSkip: () => void;
}

interface ProviderCardConfig {
  vendor: ProviderVendor;
  name: string;
  desc: string;
  badge: string;
}

const PROVIDERS: ProviderCardConfig[] = [
  {
    vendor: 'GEMINI',
    name: 'Google Gemini',
    desc: 'Conversational reasoning, fast multimodal inference, and tool execution.',
    badge: 'RECOMMENDED / FREE TIER AVAILABLE',
  },
  {
    vendor: 'OPENAI',
    name: 'OpenAI (GPT-4o & Reasoning)',
    desc: 'Complex code synthesis, structured outputs, and DALL-E visual generation.',
    badge: 'OPTIONAL CLOUD',
  },
  {
    vendor: 'ANTHROPIC',
    name: 'Anthropic Claude',
    desc: 'Deep analytical reasoning, architectural design, and document evaluation.',
    badge: 'OPTIONAL CLOUD',
  },
];

export const ProvidersStage: React.FC<StageProps> = ({ onAdvance, onSkip }) => {
  const [activeVendorInput, setActiveVendorInput] = useState<ProviderVendor | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [authorizations, setAuthorizations] = useState(() => {
    return {
      GEMINI: ProviderAuthManager.getAuthorization('GEMINI').enabled,
      OPENAI: ProviderAuthManager.getAuthorization('OPENAI').enabled,
      ANTHROPIC: ProviderAuthManager.getAuthorization('ANTHROPIC').enabled,
    };
  });

  const handleSaveKey = async (vendor: ProviderVendor) => {
    if (!keyInput.trim()) return;
    try {
      await ProviderAuthManager.saveKey(vendor, keyInput.trim());
      setAuthorizations((prev) => ({ ...prev, [vendor]: true }));
      setSaveStatus(`Connected ${vendor} securely to OS Keyring.`);
      setActiveVendorInput(null);
      setKeyInput('');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err: any) {
      setSaveStatus(`Error: ${err?.message || 'Could not save API key'}`);
    }
  };

  return (
    <div className={styles.stageStandard}>
      <div className={styles.stageHeader}>
        <span className={styles.stageCategoryTag}>STAGE 04 · AI PROVIDER SETUP (BYOK)</span>
        <h1 className={styles.stageTitle}>Connect AI Providers</h1>
        <p className={styles.stageSubtitle}>
          Rezel is BYOK (Bring-Your-Own-Key) and Local-First. You can connect your preferred cloud providers now or use Local AI.
        </p>
      </div>

      {saveStatus && (
        <div className={styles.toastNotice}>
          <CheckCircle2 size={13} className="text-emerald-400" />
          <span>{saveStatus}</span>
        </div>
      )}

      <div className={styles.providersList}>
        {PROVIDERS.map((prov) => {
          const isConnected = authorizations[prov.vendor as keyof typeof authorizations];
          const isEditing = activeVendorInput === prov.vendor;

          return (
            <div key={prov.vendor} className={styles.providerCardBox}>
              <div className={styles.providerCardTop}>
                <div className={styles.providerMetaGroup}>
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-cyan-400" />
                    <span className={styles.providerName}>{prov.name}</span>
                  </div>
                  <span className={styles.providerBadge}>{prov.badge}</span>
                  <p className={styles.providerDesc}>{prov.desc}</p>
                </div>

                <div className={styles.providerStatusCol}>
                  {isConnected ? (
                    <div className={styles.statusConnectedPill}>
                      <Check size={12} />
                      <span>CONNECTED</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveVendorInput(isEditing ? null : prov.vendor);
                        setKeyInput('');
                      }}
                      className={styles.secondaryButton}
                    >
                      <Key size={12} />
                      <span>{isEditing ? 'CANCEL' : 'ADD KEY'}</span>
                    </button>
                  )}
                </div>
              </div>

              {isEditing && (
                <div className={styles.keyInputDeck}>
                  <input
                    type="password"
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    placeholder={`Paste ${prov.name} API Key...`}
                    className={styles.keyInputField}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => handleSaveKey(prov.vendor)}
                    className={styles.primaryActionButton}
                    disabled={!keyInput.trim()}
                  >
                    <span>SAVE KEY</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className={styles.securityNote}>
        <ShieldCheck size={13} className="text-emerald-400 shrink-0" />
        <span>Keys are stored directly in your encrypted OS Keyring / secure session memory. Zero server telemetry.</span>
      </div>

      <div className={styles.stageActionDeck}>
        <button type="button" onClick={onSkip} className={styles.textGhostButton}>
          <span>SKIP CLOUD PROVIDERS (USE LOCAL ONLY)</span>
        </button>

        <button type="button" onClick={onAdvance} className={styles.primaryActionButton}>
          <span>CONTINUE</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
