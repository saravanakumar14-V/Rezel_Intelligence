/**
 * Rezel OS — ProviderSettingsPanel (Milestone 11.2A)
 *
 * Glassmorphic multi-provider orchestration interface.
 * Implements Routing Profile selection, Frontier Cloud keys, Local AI discovery,
 * paid-failover authorization switches, and CostGuard budget limits.
 */

import { useState, useEffect } from 'react';
import {
  Cpu,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  Shield,
  Cloud,
  HardDrive,
} from 'lucide-react';
import { ModelCatalog } from '../../../lib/ai/providers/ModelCatalog';
import { ProviderHealthManager } from '../../../lib/ai/providers/ProviderHealthManager';
import { ProviderAuthManager } from '../../../lib/ai/providers/ProviderAuthManager';
import { ProviderRouter } from '../../../lib/ai/providers/ProviderRouter';
import type {
  ProviderVendor,
  RoutingProfile,
  HealthState,
  ModelMetadata,
} from '../../../lib/ai/providers/types';
import styles from './ProviderSettingsPanel.module.css';

const PROFILES: Array<{ id: RoutingProfile; label: string; desc: string }> = [
  { id: 'AUTO', label: 'AUTO', desc: 'Best eligible model' },
  { id: 'SMART', label: 'SMART', desc: 'Maximum capability' },
  { id: 'BALANCED', label: 'BALANCED', desc: 'Quality & speed' },
  { id: 'FAST', label: 'FAST', desc: 'Lowest latency' },
  { id: 'LOCAL', label: 'LOCAL', desc: '100% offline AI' },
  { id: 'MANUAL', label: 'MANUAL', desc: 'Exact model lock' },
];

export default function ProviderSettingsPanel() {
  const [activeProfile, setActiveProfile] = useState<RoutingProfile>('AUTO');
  const [geminiKey, setGeminiKey] = useState<string>('');
  const [openAiKey, setOpenAiKey] = useState<string>('');
  const [anthropicKey, setAnthropicKey] = useState<string>('');
  
  const [hasGeminiKey, setHasGeminiKey] = useState<boolean>(false);
  const [hasOpenAiKey, setHasOpenAiKey] = useState<boolean>(false);
  const [hasAnthropicKey, setHasAnthropicKey] = useState<boolean>(false);

  const [selectedGeminiModel, setSelectedGeminiModel] = useState<string>('gemini-3.6-flash');
  const [selectedOpenAiModel, setSelectedOpenAiModel] = useState<string>('gpt-4o');
  const [selectedAnthropicModel, setSelectedAnthropicModel] = useState<string>('claude-3-7-sonnet-20250219');
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>('llama3.2:3b');

  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [allowPaidFailover, setAllowPaidFailover] = useState<boolean>(false);
  const [allowLocalFallback, setAllowLocalFallback] = useState<boolean>(true);
  const [dailyLimit, setDailyLimit] = useState<number>(5.00);
  const [requestLimit, setRequestLimit] = useState<number>(0.50);
  const [dailySpent, setDailySpent] = useState<number>(0);

  const [healthMap, setHealthMap] = useState<Record<ProviderVendor, HealthState>>({
    GEMINI: 'HEALTHY',
    OPENAI: 'HEALTHY',
    ANTHROPIC: 'HEALTHY',
    OLLAMA: 'HEALTHY',
    LOCAL: 'HEALTHY',
  });

  useEffect(() => {
    setActiveProfile(ProviderRouter.getRoutingProfile());
    loadCredentials();
    loadAuthPolicies();
    syncHealth();

    const unsub = ProviderHealthManager.subscribe(() => {
      syncHealth();
    });
    return () => unsub();
  }, []);

  const loadCredentials = async () => {
    const hasG = await ProviderAuthManager.hasKey('GEMINI');
    const hasO = await ProviderAuthManager.hasKey('OPENAI');
    const hasA = await ProviderAuthManager.hasKey('ANTHROPIC');
    setHasGeminiKey(hasG);
    setHasOpenAiKey(hasO);
    setHasAnthropicKey(hasA);
  };

  const loadAuthPolicies = () => {
    const geminiAuth = ProviderAuthManager.getAuthorization('GEMINI');
    setAllowPaidFailover(geminiAuth.allowPaidFailover);
    setDailyLimit(geminiAuth.maxDailyCostUSD);
    setRequestLimit(geminiAuth.maxCostPerRequestUSD);
    setDailySpent(geminiAuth.currentDailySpentUSD);
  };

  const syncHealth = () => {
    setHealthMap({
      GEMINI: ProviderHealthManager.getProviderHealth('GEMINI').state,
      OPENAI: ProviderHealthManager.getProviderHealth('OPENAI').state,
      ANTHROPIC: ProviderHealthManager.getProviderHealth('ANTHROPIC').state,
      OLLAMA: ProviderHealthManager.getProviderHealth('OLLAMA').state,
      LOCAL: ProviderHealthManager.getProviderHealth('LOCAL').state,
    });
  };

  const handleSaveKey = async (vendor: ProviderVendor, key: string) => {
    if (!key.trim()) return;
    await ProviderAuthManager.saveKey(vendor, key.trim());
    await loadCredentials();
    if (vendor === 'GEMINI') setGeminiKey('');
    if (vendor === 'OPENAI') setOpenAiKey('');
    if (vendor === 'ANTHROPIC') setAnthropicKey('');
  };

  const handleDeleteKey = async (vendor: ProviderVendor) => {
    await ProviderAuthManager.deleteKey(vendor);
    await loadCredentials();
  };

  const togglePaidFailover = (val: boolean) => {
    setAllowPaidFailover(val);
    const vendors: ProviderVendor[] = ['GEMINI', 'OPENAI', 'ANTHROPIC'];
    for (const v of vendors) {
      ProviderAuthManager.updateAuthorization(v, { allowPaidFailover: val });
    }
  };

  const renderHealthBadge = (state: HealthState, isConfigured: boolean) => {
    if (!isConfigured) {
      return <span className={`${styles.healthBadge} ${styles.healthMuted}`}>NOT CONFIGURED</span>;
    }
    if (state === 'HEALTHY' || state === 'PROBING') {
      return <span className={`${styles.healthBadge} ${styles.healthHealthy}`}>● HEALTHY</span>;
    }
    if (state === 'RATE_LIMITED' || state === 'DEGRADED') {
      return <span className={`${styles.healthBadge} ${styles.healthWarning}`}>▲ {state}</span>;
    }
    if (state === 'QUOTA_EXHAUSTED') {
      return <span className={`${styles.healthBadge} ${styles.healthWarning}`}>⚠ QUOTA EXHAUSTED</span>;
    }
    if (state === 'AUTH_FAILED') {
      return <span className={`${styles.healthBadge} ${styles.healthError}`}>✖ AUTH FAILED</span>;
    }
    return <span className={`${styles.healthBadge} ${styles.healthMuted}`}>{state}</span>;
  };

  const renderCapabilityChips = (model?: ModelMetadata) => {
    if (!model) return null;
    const caps = model.capabilities;
    return (
      <div className={styles.chipGroup}>
        {caps.text && <span className={styles.chip}>TEXT</span>}
        {caps.toolCalling && <span className={styles.chip}>TOOLS</span>}
        {caps.vision && <span className={styles.chip}>VISION</span>}
        {caps.extendedThinking && <span className={styles.chip}>REASONING</span>}
        {caps.streaming && <span className={styles.chip}>STREAM</span>}
      </div>
    );
  };

  const geminiModels = ModelCatalog.getModelsByVendor('GEMINI');
  const openAiModels = ModelCatalog.getModelsByVendor('OPENAI');
  const anthropicModels = ModelCatalog.getModelsByVendor('ANTHROPIC');
  const ollamaModels = ModelCatalog.getModelsByVendor('OLLAMA');

  return (
    <div className={styles.container}>
      {/* ── 1. Routing Profile Selector ─────────────────────────────────────── */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            <Cpu size={13} />
            Routing Profile
          </span>
        </div>
        <div className={styles.profilePillGroup}>
          {PROFILES.map((p) => (
            <button
              key={p.id}
              className={`${styles.profilePill} ${activeProfile === p.id ? styles.profilePillActive : ''}`}
              onClick={() => {
                setActiveProfile(p.id);
                ProviderRouter.setRoutingProfile(p.id);
              }}
            >
              <span className={styles.profilePillLabel}>{p.label}</span>
              <span className={styles.profilePillDesc}>{p.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── 2. Frontier Cloud Providers ─────────────────────────────────────── */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            <Cloud size={13} />
            Frontier Cloud Providers
          </span>
        </div>
        <div className={styles.cardsList}>
          {/* Google Gemini Card */}
          <div className={`${styles.card} ${hasGeminiKey ? styles.cardActive : ''}`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleGroup}>
                <span className={styles.vendorName}>Google Gemini</span>
                <span className={styles.sourceBadge}>CLOUD</span>
              </div>
              {renderHealthBadge(healthMap.GEMINI, hasGeminiKey)}
            </div>

            <div className={styles.modelSelectRow}>
              <select
                className={styles.modelSelect}
                value={selectedGeminiModel}
                onChange={(e) => setSelectedGeminiModel(e.target.value)}
              >
                {geminiModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
              {renderCapabilityChips(ModelCatalog.getModel(selectedGeminiModel))}
            </div>

            <div className={styles.keyRow}>
              <input
                type={showKeys['GEMINI'] ? 'text' : 'password'}
                className={styles.input}
                placeholder={hasGeminiKey ? '••••••••••••••••••••••••' : 'Enter Gemini API Key (AI Studio)'}
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
              />
              <button
                className={styles.btnAction}
                onClick={() => setShowKeys({ ...showKeys, GEMINI: !showKeys['GEMINI'] })}
                title="Toggle Visibility"
              >
                {showKeys['GEMINI'] ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              <button
                className={styles.btnAction}
                onClick={() => handleSaveKey('GEMINI', geminiKey)}
                disabled={!geminiKey.trim()}
              >
                Save
              </button>
              {hasGeminiKey && (
                <button
                  className={`${styles.btnAction} ${styles.btnDanger}`}
                  onClick={() => handleDeleteKey('GEMINI')}
                  title="Remove Key"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          {/* OpenAI Card */}
          <div className={`${styles.card} ${hasOpenAiKey ? styles.cardActive : ''}`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleGroup}>
                <span className={styles.vendorName}>OpenAI</span>
                <span className={styles.sourceBadge}>CLOUD</span>
              </div>
              {renderHealthBadge(healthMap.OPENAI, hasOpenAiKey)}
            </div>

            <div className={styles.modelSelectRow}>
              <select
                className={styles.modelSelect}
                value={selectedOpenAiModel}
                onChange={(e) => setSelectedOpenAiModel(e.target.value)}
              >
                {openAiModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
              {renderCapabilityChips(ModelCatalog.getModel(selectedOpenAiModel))}
            </div>

            <div className={styles.keyRow}>
              <input
                type={showKeys['OPENAI'] ? 'text' : 'password'}
                className={styles.input}
                placeholder={hasOpenAiKey ? '••••••••••••••••••••••••' : 'Enter OpenAI API Key (sk-...)'}
                value={openAiKey}
                onChange={(e) => setOpenAiKey(e.target.value)}
              />
              <button
                className={styles.btnAction}
                onClick={() => setShowKeys({ ...showKeys, OPENAI: !showKeys['OPENAI'] })}
              >
                {showKeys['OPENAI'] ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              <button
                className={styles.btnAction}
                onClick={() => handleSaveKey('OPENAI', openAiKey)}
                disabled={!openAiKey.trim()}
              >
                Save
              </button>
              {hasOpenAiKey && (
                <button
                  className={`${styles.btnAction} ${styles.btnDanger}`}
                  onClick={() => handleDeleteKey('OPENAI')}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>

          {/* Anthropic Claude Card */}
          <div className={`${styles.card} ${hasAnthropicKey ? styles.cardActive : ''}`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleGroup}>
                <span className={styles.vendorName}>Anthropic Claude</span>
                <span className={styles.sourceBadge}>CLOUD</span>
              </div>
              {renderHealthBadge(healthMap.ANTHROPIC, hasAnthropicKey)}
            </div>

            <div className={styles.modelSelectRow}>
              <select
                className={styles.modelSelect}
                value={selectedAnthropicModel}
                onChange={(e) => setSelectedAnthropicModel(e.target.value)}
              >
                {anthropicModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
              {renderCapabilityChips(ModelCatalog.getModel(selectedAnthropicModel))}
            </div>

            <div className={styles.keyRow}>
              <input
                type={showKeys['ANTHROPIC'] ? 'text' : 'password'}
                className={styles.input}
                placeholder={hasAnthropicKey ? '••••••••••••••••••••••••' : 'Enter Anthropic API Key (sk-ant-...)'}
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
              />
              <button
                className={styles.btnAction}
                onClick={() => setShowKeys({ ...showKeys, ANTHROPIC: !showKeys['ANTHROPIC'] })}
              >
                {showKeys['ANTHROPIC'] ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
              <button
                className={styles.btnAction}
                onClick={() => handleSaveKey('ANTHROPIC', anthropicKey)}
                disabled={!anthropicKey.trim()}
              >
                Save
              </button>
              {hasAnthropicKey && (
                <button
                  className={`${styles.btnAction} ${styles.btnDanger}`}
                  onClick={() => handleDeleteKey('ANTHROPIC')}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Local / Free Providers ───────────────────────────────────────── */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            <HardDrive size={13} />
            Local / Free AI
          </span>
        </div>
        <div className={styles.cardsList}>
          <div className={`${styles.card} ${styles.cardActive}`}>
            <div className={styles.cardHeader}>
              <div className={styles.cardTitleGroup}>
                <span className={styles.vendorName}>Ollama (Local Engine)</span>
                <span className={`${styles.sourceBadge} ${styles.sourceLocal}`}>LOCAL</span>
              </div>
              <span className={`${styles.healthBadge} ${styles.healthHealthy}`}>● ONLINE</span>
            </div>

            <div className={styles.modelSelectRow}>
              <select
                className={styles.modelSelect}
                value={selectedOllamaModel}
                onChange={(e) => setSelectedOllamaModel(e.target.value)}
              >
                {ollamaModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
              {renderCapabilityChips(ModelCatalog.getModel(selectedOllamaModel))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '9px', color: 'rgba(234, 251, 255, 0.45)' }}>
                Endpoint: http://127.0.0.1:11434 (Zero Cloud Cost)
              </span>
              <button className={styles.btnAction}>
                <RefreshCw size={10} /> Scan Models
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. Failover & Cost Governance ───────────────────────────────────── */}
      <div>
        <div className={styles.sectionHeader}>
          <span className={styles.sectionTitle}>
            <Shield size={13} />
            Failover & Cost Controls
          </span>
        </div>
        <div className={styles.failoverBox}>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={allowPaidFailover}
              onChange={(e) => togglePaidFailover(e.target.checked)}
            />
            <span className={styles.checkboxLabel}>
              Allow automatic paid provider failover (e.g. Gemini → OpenAI)
            </span>
          </label>

          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={allowLocalFallback}
              onChange={(e) => setAllowLocalFallback(e.target.checked)}
            />
            <span className={styles.checkboxLabel}>
              Allow local/free fallback when all cloud quotas are exhausted
            </span>
          </label>

          <div className={styles.costRow}>
            <span className={styles.costLabel}>Today's Estimated Spend</span>
            <span className={styles.costValue}>${dailySpent.toFixed(2)} / ${dailyLimit.toFixed(2)} (Cap: ${requestLimit.toFixed(2)}/req)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
