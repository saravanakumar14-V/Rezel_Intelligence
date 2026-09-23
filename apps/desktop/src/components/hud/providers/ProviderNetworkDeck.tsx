import { useState, useEffect } from 'react';
import { Network, Sparkles, AlertTriangle, ShieldCheck, X, Activity } from 'lucide-react';
import {
  ProviderIntelligenceBridge,
  type RuntimeTelemetrySnapshot,
} from '../../../lib/ai/providers/ProviderIntelligenceBridge';
import { cn } from '../../../lib/cn';
import styles from './ProviderNetworkDeck.module.css';

export interface ProviderNetworkDeckProps {
  onDismiss?: () => void;
  className?: string;
}

export default function ProviderNetworkDeck({
  onDismiss,
  className,
}: ProviderNetworkDeckProps) {
  const [telemetry, setTelemetry] = useState<RuntimeTelemetrySnapshot>(() =>
    ProviderIntelligenceBridge.getTelemetrySnapshot()
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const unsub = ProviderIntelligenceBridge.subscribe((snap) => {
      setTelemetry(snap);
    });
    return () => unsub();
  }, []);

  const activeRoute = telemetry.activeRoute;
  const recentFailover = telemetry.recentFailovers[0];

  return (
    <aside
      className={cn(styles.deckRoot, className)}
      role="region"
      aria-label="Provider Network & Runtime Intelligence"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className={styles.header}>
        <div className={styles.titleGroup}>
          <Network size={14} className="text-[#00E5FF]" />
          <span className={styles.title}>Provider & Runtime Routing</span>
        </div>

        <div className="flex items-center gap-2">
          {activeRoute && (
            <span className={styles.profilePill}>{activeRoute.routingProfile} ROUTING</span>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="text-white/40 hover:text-white p-1 rounded transition-colors"
              title="Close deck"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Constellation Grid ───────────────────────────────────── */}
      <div className={styles.constellationGrid}>
        {telemetry.providerNodes.map((node) => (
          <div
            key={node.vendor}
            className={cn(styles.nodeCard, node.isActive && styles.nodeCardActive)}
          >
            <span className={cn(styles.nodeDot, node.isActive && styles.nodeDotActive)} />
            <span className={styles.nodeName}>{node.displayName}</span>
            <span className={styles.nodeState}>
              {node.isActive ? 'ACTIVE' : node.health}
            </span>
          </div>
        ))}
      </div>

      {/* ── Active Routing Decision ──────────────────────────────── */}
      {activeRoute && (
        <div className={styles.routingCard}>
          <div className={styles.routingHeader}>
            <div className="flex items-center gap-1.5">
              <Sparkles size={12} className="text-[#00E5FF]" />
              <span className={styles.activeModelTitle}>{activeRoute.selectedModel}</span>
            </div>
            <span
              className={cn(
                styles.localityBadge,
                !activeRoute.isLocal && styles.localityBadgeCloud
              )}
            >
              {activeRoute.isLocal ? 'LOCAL INFERENCE' : 'FRONTIER CLOUD'}
            </span>
          </div>

          <span className="font-sans text-xs text-[#EAFBFF]/80">
            {activeRoute.selectionReason}
          </span>

          <div className={styles.factorsList}>
            {activeRoute.decisionFactors.map((factor, idx) => (
              <span key={idx} className={styles.factorItem}>
                {factor}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Failover Strip if recent failover occurred ───────────── */}
      {recentFailover && (
        <div className={styles.failoverStrip}>
          <AlertTriangle size={12} />
          <span>
            Failover adapted: {recentFailover.fromVendor} → {recentFailover.toVendor} (
            {recentFailover.reason})
          </span>
        </div>
      )}

      {/* ── Footer Telemetry Toggle ──────────────────────────────── */}
      <div className="flex items-center justify-between pt-1 border-t border-white/5 font-mono text-[8.5px] text-white/50">
        <div className="flex items-center gap-1.5 text-[#00FFAE]">
          <ShieldCheck size={11} />
          <span>COSTGUARD: ${telemetry.costGuard.dailySpentUSD.toFixed(2)} / ${telemetry.costGuard.dailyBudgetUSD.toFixed(2)}</span>
        </div>

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-[#7ECFFF] hover:underline cursor-pointer flex items-center gap-1"
        >
          <Activity size={10} />
          <span>{showAdvanced ? 'HIDE TELEMETRY' : 'DIAGNOSTICS'}</span>
        </button>
      </div>

      {showAdvanced && (
        <div className="grid grid-cols-3 gap-2 p-2 rounded-lg bg-black/40 border border-white/5 font-mono text-[8px] text-white/70">
          <div>
            <span className="opacity-50 block">LATENCY</span>
            <span className="text-[#00E5FF] font-bold">{telemetry.averageLatencyMs} ms</span>
          </div>
          <div>
            <span className="opacity-50 block">REQUESTS</span>
            <span className="text-white font-bold">{telemetry.totalRequests}</span>
          </div>
          <div>
            <span className="opacity-50 block">FAILOVERS</span>
            <span className="text-[#FF9F1C] font-bold">{telemetry.recentFailovers.length}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
