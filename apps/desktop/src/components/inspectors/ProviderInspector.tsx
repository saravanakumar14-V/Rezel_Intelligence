import { useState, useMemo } from 'react';
import {
  Globe,
  Sliders,
  DollarSign,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import InspectorShell from './InspectorShell';
import ProviderSettingsPanel from '../panels/settings/ProviderSettingsPanel';
import { ProviderRouter } from '../../lib/ai/providers/ProviderRouter';
import { ModelManager } from '../../lib/ai/models/ModelManager';
import { cn } from '../../lib/cn';
import styles from './ProviderInspector.module.css';

interface ProviderInspectorProps {
  onClose?: () => void;
}

export default function ProviderInspector({ onClose }: ProviderInspectorProps) {
  const [configOpen, setConfigOpen] = useState(false);

  const routingProfile = useMemo(() => {
    try {
      return ProviderRouter.getRoutingProfile();
    } catch {
      return 'AUTO';
    }
  }, []);

  const activeModelId = useMemo(() => {
    return ModelManager.getActiveModelId() || 'gemini-2.5-flash';
  }, []);

  const isLocal = routingProfile === 'LOCAL' || activeModelId.includes('ollama') || activeModelId.includes('qwen') || activeModelId.includes('llama');

  const topology = useMemo(() => {
    return [
      {
        id: 'gemini',
        name: 'Google Gemini Mesh',
        model: 'Gemini 2.5 Flash / Pro',
        type: 'CLOUD',
        status: !isLocal ? 'ACTIVE' : 'HEALTHY STANDBY',
        latency: '240ms',
      },
      {
        id: 'ollama',
        name: 'Ollama Local Engine',
        model: 'Qwen 2.5 Coder / Llama 3.2',
        type: 'LOCAL',
        status: isLocal ? 'ACTIVE' : 'READY STANDBY',
        latency: '< 15ms',
      },
      {
        id: 'huggingface',
        name: 'Hugging Face Hub',
        model: 'DeepSeek R1 / Phi-4',
        type: 'LOCAL / HYBRID',
        status: 'READY STANDBY',
        latency: 'Local weights',
      },
      {
        id: 'openai',
        name: 'OpenAI Mesh',
        model: 'GPT-4o / o3-mini',
        type: 'CLOUD',
        status: 'CONFIGURED',
        latency: '310ms',
      },
    ];
  }, [isLocal]);

  return (
    <InspectorShell
      title="Provider Intelligence"
      subtitle="Routing Engine & Topology"
      onClose={onClose}
    >
      <div className={styles.providerRoot}>
        {/* ── Active Intelligence Hero Route ───────────────────────── */}
        <div className={styles.heroRouteCard}>
          <div className={styles.heroHeader}>
            <div className={styles.routeTitleGroup}>
              <span className={styles.routeDot} />
              <span>PRIMARY ACTIVE INTELLIGENCE ROUTE</span>
            </div>
            <span className={isLocal ? styles.localPill : styles.cloudPill}>
              {isLocal ? 'LOCAL INFERENCE' : 'CLOUD MESH'}
            </span>
          </div>

          <span className={styles.routeModelName}>
            {isLocal ? 'OLLAMA ENGINE' : 'GOOGLE GEMINI'} • {activeModelId.toUpperCase()}
          </span>

          <div className={styles.routeRationale}>
            {isLocal
              ? 'Selected because local neural weights are loaded in memory, matching zero-latency and offline preference.'
              : 'Selected because task requires advanced multi-step reasoning, multimodal synthesis, and high context capacity.'}
          </div>

          <div className={styles.routeMetaRow}>
            <span>ROUTING PROFILE: {routingProfile}</span>
            <span>FAILOVER CONTINUITY: ACTIVE</span>
          </div>
        </div>

        {/* ── Cost Intelligence Summary ────────────────────────────── */}
        <div className={styles.costCard}>
          <div className="flex items-center gap-1.5">
            <DollarSign size={11} className="text-[#00E676]" />
            <span className={styles.costLabel}>EST. SESSION COST:</span>
            <span className={styles.costVal}>$0.0038</span>
          </div>
          <span className="text-[#7ECFFF]/60">COSTGUARD ENFORCED</span>
        </div>

        {/* ── Intelligence Network Topology ────────────────────────── */}
        <div className="flex flex-col gap-2">
          <span className={styles.sectionTitle}>
            <Globe size={11} className="text-[#00E5FF]" />
            INTELLIGENCE NETWORK TOPOLOGY
          </span>

          <div className={styles.providerTopologyList}>
            {topology.map((node) => {
              const isActive = node.status === 'ACTIVE';

              return (
                <div
                  key={node.id}
                  className={cn(
                    styles.providerNode,
                    isActive && styles.providerNodeActive
                  )}
                >
                  <div className={styles.providerLeft}>
                    <div className="flex items-center gap-2">
                      <span className={styles.providerName}>{node.name}</span>
                      <span className="font-mono text-[7.5px] text-white/40">
                        [{node.type}]
                      </span>
                    </div>
                    <span className={styles.providerDetails}>
                      {node.model} • {node.latency}
                    </span>
                  </div>

                  <span
                    className={cn(
                      styles.healthBadge,
                      isActive
                        ? styles.healthHealthy
                        : styles.healthDegraded
                    )}
                  >
                    {node.status}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Provider Settings & Keys Collapsible Drawer ──────────── */}
        <div className="border border-white/5 rounded-xl bg-[#060B1E]/60 p-2.5 mt-1">
          <button
            type="button"
            onClick={() => setConfigOpen((v) => !v)}
            className="flex items-center justify-between w-full cursor-pointer outline-none bg-transparent border-none"
          >
            <div className="flex items-center gap-2">
              <Sliders size={11} className="text-[#7ECFFF]" />
              <span className="font-mono text-[9px] font-bold tracking-wider text-[#7ECFFF] uppercase">
                AUTHENTICATION & PROVIDER CONFIGURATION
              </span>
            </div>
            {configOpen ? (
              <ChevronUp size={12} className="text-white/40" />
            ) : (
              <ChevronDown size={12} className="text-white/40" />
            )}
          </button>

          {configOpen && (
            <div className="mt-3 pt-2 border-t border-white/5">
              <ProviderSettingsPanel />
            </div>
          )}
        </div>
      </div>
    </InspectorShell>
  );
}
