import ContextSpatialIndicator from '../hud/navigation/ContextSpatialIndicator';
import WorkspaceContextPill from '../hud/workspace/WorkspaceContextPill';
import { useSystemMetrics } from '../../hooks/useSystemMetrics';
import type { InspectorId } from '../../types/navigation';
import { cn } from '../../lib/cn';
import styles from './EnvironmentIndicators.module.css';

export interface EnvironmentIndicatorsProps {
  onOpenInspector?: (id: InspectorId) => void;
  className?: string;
}

export default function EnvironmentIndicators({
  onOpenInspector,
  className,
}: EnvironmentIndicatorsProps) {
  const metrics = useSystemMetrics();

  // Determine if high resource pressure is present (>80% CPU or >85% RAM)
  const ramPct =
    metrics && metrics.total_memory > 0
      ? (metrics.used_memory / metrics.total_memory) * 100
      : 0;
  const cpuPct = metrics?.cpu_usage ?? 0;
  const isHighPressure = cpuPct > 80 || ramPct > 85;

  return (
    <aside
      className={cn(styles.indicatorsDeck, className)}
      role="region"
      aria-label="Environmental Context Indicators"
    >
      {/* Navigation Context Trail */}
      <ContextSpatialIndicator />

      {/* Background Task Contexts */}
      <WorkspaceContextPill />

      {/* Ambient Resource Pressure Indicator (surfaces only when pressure is high) */}
      {isHighPressure && (
        <button
          type="button"
          onClick={() => onOpenInspector?.('system')}
          className={styles.pressurePill}
          title={`Resource pressure: CPU ${cpuPct.toFixed(0)}%, RAM ${ramPct.toFixed(0)}%. Click for System Inspector.`}
        >
          <span className={styles.pressureDot} />
          <span>RESOURCE PRESSURE ({cpuPct > 80 ? `CPU ${cpuPct.toFixed(0)}%` : `RAM ${ramPct.toFixed(0)}%`})</span>
        </button>
      )}
    </aside>
  );
}
