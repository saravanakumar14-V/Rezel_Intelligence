import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Check, X, Cpu } from 'lucide-react';
import type { UniversalModelRecord } from '../../../lib/ai/models/types';
import { ModelManager } from '../../../lib/ai/models/ModelManager';
import { HardwareCompatibilityEngine } from '../../../lib/ai/models/HardwareCompatibilityEngine';
import { useSystemMetrics } from '../../../hooks/useSystemMetrics';
import ModelInspector from './ModelInspector';
import { cn } from '../../../lib/cn';
import styles from './ModelIntelligenceSpace.module.css';

export default function ModelIntelligenceSpace() {
  const containerRef = useRef<HTMLDivElement>(null);
  const metrics = useSystemMetrics();

  const [models, setModels] = useState<UniversalModelRecord[]>([]);
  const [activeModelId, setActiveModelId] = useState<string>(() => ModelManager.getActiveModelId());
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'LOCAL' | 'CLOUD' | 'CODING' | 'REASONING'>('ALL');
  const [selectedModel, setSelectedModel] = useState<UniversalModelRecord | null>(null);

  useEffect(() => {
    const unsub = ModelManager.subscribe((list) => {
      setModels(list);
      setActiveModelId(ModelManager.getActiveModelId());
      if (selectedModel) {
        const updated = list.find((m) => m.id === selectedModel.id);
        if (updated) setSelectedModel(updated);
      }
    });
    return () => unsub();
  }, [selectedModel]);

  const activeModel = useMemo(() => {
    return models.find((m) => m.id === activeModelId || m.state === 'ACTIVE') || models[0];
  }, [models, activeModelId]);

  // System Hardware Specs for real evaluation
  const specs = useMemo(() => {
    const totalRamGB = metrics && metrics.total_memory > 0
      ? Math.round((metrics.total_memory / (1024 ** 3)) * 10) / 10
      : 16;
    const availableRamGB = metrics && metrics.total_memory > 0
      ? Math.round(((metrics.total_memory - metrics.used_memory) / (1024 ** 3)) * 10) / 10
      : 8;
    return {
      totalRamGB,
      availableRamGB,
      vramGB: totalRamGB >= 32 ? 12 : totalRamGB >= 16 ? 6 : 4,
      cpuCores: typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 8 : 8,
    };
  }, [metrics]);

  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      const matchSearch =
        m.displayName.toLowerCase().includes(search.toLowerCase()) ||
        m.id.toLowerCase().includes(search.toLowerCase()) ||
        (m.description && m.description.toLowerCase().includes(search.toLowerCase())) ||
        (m.author && m.author.toLowerCase().includes(search.toLowerCase()));

      if (!matchSearch) return false;

      if (activeFilter === 'LOCAL') return m.isLocal;
      if (activeFilter === 'CLOUD') return !m.isLocal;
      if (activeFilter === 'CODING') return m.recommendedTasks?.includes('CODING');
      if (activeFilter === 'REASONING') return m.recommendedTasks?.includes('REASONING');
      return true;
    });
  }, [models, search, activeFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      ModelManager.searchHuggingFace(search.trim());
    }
  };

  const getCompatClass = (rating: string) => {
    switch (rating) {
      case 'EXCELLENT': return styles.compatExcellent;
      case 'GOOD': return styles.compatGood;
      case 'LIMITED': return styles.compatLimited;
      case 'INCOMPATIBLE': return styles.compatIncompatible;
      default: return styles.compatGood;
    }
  };

  return (
    <div ref={containerRef} className={styles.spaceRoot}>
      {/* ── Deep Focus Model View (if selected) ───────────────────── */}
      {selectedModel ? (
        <ModelInspector
          model={selectedModel}
          onClose={() => setSelectedModel(null)}
          onSelect={() => setSelectedModel(null)}
        />
      ) : (
        <>
          {/* ── Active Intelligence Hero Beacon ─────────────────────── */}
          {activeModel && (
            <div
              className={styles.activeBeaconCard}
              onClick={() => setSelectedModel(activeModel)}
              title="Currently deployed primary reasoning intelligence. Click to inspect."
              style={{ cursor: 'pointer' }}
            >
              <div className={styles.beaconLeft}>
                <span className={styles.beaconDot} />
                <div className="flex flex-col gap-0.5">
                  <span className={styles.beaconLabel}>PRIMARY ACTIVE INTELLIGENCE</span>
                  <span className={styles.beaconModelName}>{activeModel.displayName}</span>
                </div>
              </div>

              <div className={styles.beaconRight}>
                <span className={styles.activeTag}>
                  {activeModel.isLocal ? 'LOCAL' : 'CLOUD MESH'}
                </span>
              </div>
            </div>
          )}

          {/* ── Search & Discovery Bar ──────────────────────────────── */}
          <form onSubmit={handleSearchSubmit} className={styles.searchBar}>
            <Search size={13} className="text-[#00E5FF]/60" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search local catalog & Hugging Face models..."
              className={styles.searchInput}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-white/40 hover:text-white"
              >
                <X size={12} />
              </button>
            )}
            <span className={styles.hfBadge}>HUGGING FACE</span>
          </form>

          {/* ── Capability Filter Pills ─────────────────────────────── */}
          <div className={styles.filterRow}>
            {(['ALL', 'LOCAL', 'CLOUD', 'CODING', 'REASONING'] as const).map((filter) => {
              const count =
                filter === 'ALL'
                  ? models.length
                  : filter === 'LOCAL'
                  ? models.filter((m) => m.isLocal).length
                  : filter === 'CLOUD'
                  ? models.filter((m) => !m.isLocal).length
                  : undefined;

              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setActiveFilter(filter)}
                  className={cn(
                    styles.filterPill,
                    activeFilter === filter && styles.filterPillActive
                  )}
                >
                  <span>{filter}</span>
                  {count !== undefined && <span className="opacity-60 text-[8px]">({count})</span>}
                </button>
              );
            })}
          </div>

          {/* ── Model Mesh List ─────────────────────────────────────── */}
          <div className={styles.modelList}>
            {filteredModels.length === 0 ? (
              <div className={styles.emptyCatalog}>
                <Cpu size={22} className="text-[#7ECFFF]/30" />
                <span className="font-mono text-xs text-[#7ECFFF]/60">NO MODELS MATCH SEARCH</span>
                <span className="text-[11px] text-white/30">
                  Press Enter to query Hugging Face repository for "{search}"
                </span>
              </div>
            ) : (
              filteredModels.map((model) => {
                const isActive = model.state === 'ACTIVE' || model.id === activeModelId;
                const isDownloading = model.state === 'DOWNLOADING';
                const isVerifying = model.state === 'VERIFYING';
                const isRegistering = model.state === 'REGISTERING';
                const isAcquiring = isDownloading || isVerifying || isRegistering;

                const compatibility = HardwareCompatibilityEngine.evaluate(
                  model.parameterCount,
                  model.quantization,
                  specs
                );

                return (
                  <div
                    key={model.id}
                    onClick={() => setSelectedModel(model)}
                    className={cn(
                      styles.modelCard,
                      isActive && styles.modelCardActive
                    )}
                  >
                    <div className={styles.cardMainRow}>
                      <div className={styles.cardLeft}>
                        <div className={styles.cardTitleGroup}>
                          <span className={styles.cardName}>{model.displayName}</span>
                          {isActive && (
                            <span className="flex items-center gap-1 font-mono text-[7.5px] font-bold text-[#00E676] bg-[#00E676]/12 px-1.5 py-0.5 rounded border border-[#00E676]/30">
                              <Check size={8} /> ACTIVE
                            </span>
                          )}
                        </div>
                        <div className={styles.cardMeta}>
                          <span>{model.parameterCount || 'Cloud Mesh'}</span>
                          <span>•</span>
                          <span>{model.quantization || 'FP16'}</span>
                          <span>•</span>
                          <span>{model.isLocal ? 'Local Weights' : 'Cloud Hosted'}</span>
                        </div>
                      </div>

                      <div className={styles.cardRight}>
                        <span className={cn(styles.compatBadge, getCompatClass(compatibility.rating))}>
                          {compatibility.rating}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar if Downloading */}
                    {isAcquiring && (
                      <div className={styles.progressWrapper}>
                        <div className={styles.progressBarTrack}>
                          <div
                            className={styles.progressBarFill}
                            style={{ width: `${model.downloadProgress?.percent ?? 45}%` }}
                          />
                        </div>
                        <div className={styles.progressInfo}>
                          <span>
                            {isVerifying ? 'Verifying checksum...' : isRegistering ? 'Registering runtime...' : `Acquiring: ${model.downloadProgress?.percent ?? 45}%`}
                          </span>
                          <span>
                            {model.downloadProgress?.etaSeconds ? `ETA ${model.downloadProgress.etaSeconds}s` : 'Active'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
