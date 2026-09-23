import { useMemo } from 'react';
import InspectorShell from './InspectorShell';
import SystemSection from '../panels/settings/SystemSection';
import { useSystemMetrics } from '../../hooks/useSystemMetrics';
import styles from './SystemInspector.module.css';

interface SystemInspectorProps {
  onClose?: () => void;
}

export default function SystemInspector({ onClose }: SystemInspectorProps) {
  const metrics = useSystemMetrics();

  const interpretation = useMemo(() => {
    if (!metrics) {
      return {
        status: 'MEASURING TELEMETRY',
        text: 'Establishing baseline performance telemetry across CPU, memory, and rendering buffers.',
        isOptimal: true,
      };
    }

    const cpuHigh = metrics.cpu_usage > 85;
    const memPercent = metrics.total_memory > 0 ? (metrics.used_memory / metrics.total_memory) * 100 : 0;
    const memHigh = memPercent > 85;

    if (cpuHigh || memHigh) {
      return {
        status: 'RESOURCE PRESSURE ELEVATED',
        text: 'Rezel has adapted by throttling non-critical background polling and preserving memory headroom for foreground reasoning.',
        isOptimal: false,
      };
    }

    return {
      status: 'SYSTEM STATE: OPTIMAL',
      text: 'Telemetry nominal. GPU acceleration, 3D QuantumCore physics, and neural inference operating at full 60 FPS fidelity.',
      isOptimal: true,
    };
  }, [metrics]);

  return (
    <InspectorShell
      title="Machine Intelligence"
      subtitle="Telemetry & Adaptive Runtime Awareness"
      onClose={onClose}
    >
      <div className={styles.systemRoot}>
        {/* ── Hero Machine Awareness Card ─────────────────────────── */}
        <div className={styles.heroMachineCard}>
          <div className={styles.heroHeader}>
            <div className={styles.heroTitleGroup}>
              <span className={styles.machineDot} />
              <span>MACHINE AWARENESS & ADAPTIVE RUNTIME</span>
            </div>
            <span className={styles.tierPill}>
              TIER 1 HIGH (60 FPS)
            </span>
          </div>

          <span className={styles.machineStatusTitle}>
            {interpretation.status}
          </span>

          <div className={styles.machineInterpretation}>
            {interpretation.text}
          </div>

          <div className={styles.heroMetaRow}>
            <span>CORRELATION: ZERO BACKGROUND RENDERING LOCK</span>
            <span>ADAPTATION: AUTONOMOUS</span>
          </div>
        </div>

        {/* ── Detailed Telemetry Gauges ────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">
          <SystemSection />
        </div>
      </div>
    </InspectorShell>
  );
}
