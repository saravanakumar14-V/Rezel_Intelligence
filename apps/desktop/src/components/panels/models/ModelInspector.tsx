import { useState, useRef, useEffect, useMemo } from 'react';
import { Sparkles, Download, Check, ArrowLeft, Cpu } from 'lucide-react';
import type { UniversalModelRecord } from '../../../lib/ai/models/types';
import { ModelManager } from '../../../lib/ai/models/ModelManager';
import { HardwareCompatibilityEngine } from '../../../lib/ai/models/HardwareCompatibilityEngine';
import { useSystemMetrics } from '../../../hooks/useSystemMetrics';
import { AdaptiveWorkspaceManager } from '../../../lib/workspace/multi-context/AdaptiveWorkspaceManager';
import { MotionEngine } from '../../../lib/motion/MotionEngine';
import { cn } from '../../../lib/cn';
import styles from './ModelInspector.module.css';

export interface ModelInspectorProps {
  model: UniversalModelRecord;
  onClose?: () => void;
  onSelect?: () => void;
}

export default function ModelInspector({
  model,
  onClose,
  onSelect,
}: ModelInspectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const metrics = useSystemMetrics();
  const [isAcquiringLocal, setIsAcquiringLocal] = useState(false);

  useEffect(() => {
    if (containerRef.current) {
      MotionEngine.animateEntrance(containerRef.current, {
        fromY: 12,
        durationToken: 'standard',
        easeToken: 'out',
      });
    }
  }, [model.id]);

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

  const compatibility = useMemo(() => {
    return HardwareCompatibilityEngine.evaluate(
      model.parameterCount,
      model.quantization,
      specs
    );
  }, [model.parameterCount, model.quantization, specs]);

  const isDownloading = model.state === 'DOWNLOADING';
  const isVerifying = model.state === 'VERIFYING';
  const isRegistering = model.state === 'REGISTERING';
  const isAcquiring = isDownloading || isVerifying || isRegistering || isAcquiringLocal;
  const isReady = model.state === 'READY';
  const isActive = model.state === 'ACTIVE';

  const handleAcquire = async () => {
    setIsAcquiringLocal(true);
    // Register background acquisition context in AdaptiveWorkspaceManager
    AdaptiveWorkspaceManager.registerContext({
      type: 'MODEL_DOWNLOAD',
      title: `Acquiring ${model.displayName}`,
      summary: `Acquiring ${model.parameterCount || ''} weights from ${model.source}`,
      progress: 0,
      relatedId: model.id,
      targetSpace: 'MODELS',
    });

    try {
      await ModelManager.acquireModel(model.id);
    } catch (err) {
      console.error('Model acquisition error:', err);
    } finally {
      setIsAcquiringLocal(false);
    }
  };

  const handleActivate = () => {
    ModelManager.setActiveModel(model.id);
    onSelect?.();
  };

  const handleCancel = () => {
    ModelManager.cancelAcquisition(model.id);
    setIsAcquiringLocal(false);
  };

  const compatColor =
    compatibility.rating === 'EXCELLENT'
      ? '#00E676'
      : compatibility.rating === 'GOOD'
      ? '#00E5FF'
      : compatibility.rating === 'LIMITED'
      ? '#FFD54F'
      : '#FF5252';

  return (
    <div ref={containerRef} className={styles.inspectorRoot}>
      {/* ── Breadcrumb Back Navigation ────────────────────────────── */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className={styles.backBtn}
          aria-label="Return to Model Catalog"
        >
          <ArrowLeft size={11} />
          <span>BACK TO MODEL CATALOG</span>
        </button>
      )}

      {/* ── Hero Header ───────────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <span className={styles.modelTitle}>{model.displayName}</span>
          <span className={styles.authorText}>
            {model.author ? `Organization: ${model.author}` : model.source} • {model.isLocal ? 'Local Machine' : 'Cloud Mesh'}
          </span>
        </div>

        <span
          className={styles.hwRatingPill}
          style={{
            color: compatColor,
            borderColor: `${compatColor}55`,
            background: `${compatColor}18`,
          }}
        >
          {compatibility.rating} FIT
        </span>
      </div>

      {/* ── Description ───────────────────────────────────────────── */}
      <p className={styles.description}>
        {model.description || 'Specialized neural weights optimized for reasoning, generation, and multi-modal task execution.'}
      </p>

      {/* ── Hardware Fit Evaluation Matrix ─────────────────────────── */}
      <div className={styles.hardwareCard}>
        <div className={styles.hwHeader}>
          <div className={styles.hwTitleGroup}>
            <Cpu size={12} className="text-[#00E5FF]" />
            <span className={styles.hwTitle}>LOCAL HARDWARE FIT EVALUATION</span>
          </div>
          <span className="font-mono text-[8px] text-[#7ECFFF]/60">
            {specs.totalRamGB} GB SYSTEM RAM
          </span>
        </div>

        <span className={styles.hwReason}>
          {compatibility.explanation}
        </span>

        <div className={styles.hwMetricsRow}>
          <div className={styles.hwMetricCell}>
            <span className={styles.hwMetricLabel}>RAM REQUIRED</span>
            <span className={styles.hwMetricVal}>
              {compatibility.requiredRamGB > 0 ? `~${compatibility.requiredRamGB} GB` : '< 1 GB'}
            </span>
          </div>
          <div className={styles.hwMetricCell}>
            <span className={styles.hwMetricLabel}>ACCELERATION</span>
            <span className={styles.hwMetricVal} style={{ color: compatibility.isGpuAccelerated ? '#00E676' : '#7ECFFF' }}>
              {compatibility.isGpuAccelerated ? 'GPU ACCELERATED' : 'CPU HYBRID'}
            </span>
          </div>
          <div className={styles.hwMetricCell}>
            <span className={styles.hwMetricLabel}>RECOMMENDED CTX</span>
            <span className={styles.hwMetricVal}>
              {compatibility.maxRecommendedContext >= 1000
                ? `${Math.round(compatibility.maxRecommendedContext / 1000)}k tokens`
                : `${compatibility.maxRecommendedContext} tokens`}
            </span>
          </div>
        </div>
      </div>

      {/* ── Specifications Grid ───────────────────────────────────── */}
      <div className={styles.specGrid}>
        <div className={styles.specItem}>
          <span className={styles.specLabel}>PARAMETERS</span>
          <span className={styles.specValue}>{model.parameterCount || 'Cloud Mesh'}</span>
        </div>
        <div className={styles.specItem}>
          <span className={styles.specLabel}>QUANTIZATION</span>
          <span className={styles.specValue}>{model.quantization || 'FP16'}</span>
        </div>
        <div className={styles.specItem}>
          <span className={styles.specLabel}>CONTEXT CAPACITY</span>
          <span className={styles.specValue}>
            {model.contextLengthTokens
              ? `${Math.round(model.contextLengthTokens / 1000)}k tokens`
              : '32k tokens'}
          </span>
        </div>
        <div className={styles.specItem}>
          <span className={styles.specLabel}>WEIGHTS FOOTPRINT</span>
          <span className={styles.specValue}>
            {model.downloadSizeBytes
              ? `${(model.downloadSizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
              : 'Zero local storage'}
          </span>
        </div>
        <div className={styles.specItem}>
          <span className={styles.specLabel}>MODALITIES</span>
          <span className={styles.specValue}>
            {model.modality && model.modality.length > 0
              ? model.modality.join(', ').toUpperCase()
              : 'TEXT, CODE'}
          </span>
        </div>
        <div className={styles.specItem}>
          <span className={styles.specLabel}>LICENSE</span>
          <span className={styles.specValue}>{model.license || 'Open Weights / Commercial'}</span>
        </div>
      </div>

      {/* ── Active Acquisition Progress Bar if In Flight ───────────── */}
      {isAcquiring && (
        <div className={styles.focusProgressArea}>
          <div className="flex items-center justify-between font-mono text-[9px] text-[#00E5FF]">
            <span className="font-bold uppercase">
              {isVerifying ? 'VERIFYING INTEGRITY...' : isRegistering ? 'REGISTERING RUNTIME...' : 'ACQUIRING NEURAL WEIGHTS...'}
            </span>
            <span>{model.downloadProgress?.percent ?? 45}%</span>
          </div>

          <div className={styles.focusProgressBar}>
            <div
              className={styles.focusProgressFill}
              style={{ width: `${model.downloadProgress?.percent ?? 45}%` }}
            />
          </div>

          <div className={styles.focusProgressMeta}>
            <span>
              {model.downloadProgress?.bytesReceived
                ? `${(model.downloadProgress.bytesReceived / (1024 * 1024)).toFixed(0)} MB / ${(model.downloadProgress.totalBytes / (1024 * 1024)).toFixed(0)} MB`
                : 'Streaming chunks...'}
            </span>
            <span>
              {model.downloadProgress?.etaSeconds ? `ETA ${model.downloadProgress.etaSeconds}s` : 'Processing'}
            </span>
          </div>
        </div>
      )}

      {/* ── Primary Action Pedestal ────────────────────────────────── */}
      <div className={styles.actionRow}>
        {isActive ? (
          <button type="button" disabled className={cn(styles.btnPrimary, styles.btnActive)}>
            <Check size={13} />
            <span>ACTIVE RUNTIME INTELLIGENCE</span>
          </button>
        ) : isReady ? (
          <button
            type="button"
            onClick={handleActivate}
            className={styles.btnPrimary}
          >
            <Sparkles size={13} />
            <span>SET AS ACTIVE INTELLIGENCE</span>
          </button>
        ) : isAcquiring ? (
          <button
            type="button"
            onClick={handleCancel}
            className={styles.btnCancel}
          >
            CANCEL ACQUISITION
          </button>
        ) : (
          <button
            type="button"
            onClick={handleAcquire}
            className={styles.btnPrimary}
          >
            <Download size={13} />
            <span>ACQUIRE MODEL (DOWNLOAD)</span>
          </button>
        )}
      </div>
    </div>
  );
}
