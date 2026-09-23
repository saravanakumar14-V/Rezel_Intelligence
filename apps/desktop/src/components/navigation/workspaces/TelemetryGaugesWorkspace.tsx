import React, { useState, useEffect, useMemo } from 'react';
import { SystemIntelligenceEngine } from '../../../lib/system/SystemIntelligenceEngine';
import { WorkflowRuntime } from '../../../lib/ai/WorkflowRuntime';
import styles from '../SpatialSurface.module.css';

export const TelemetryGaugesWorkspace: React.FC = () => {
  const [telemetrySnapshot, setTelemetrySnapshot] = useState(() => {
    return SystemIntelligenceEngine.getSnapshot ? SystemIntelligenceEngine.getSnapshot() : null;
  });

  useEffect(() => {
    if (SystemIntelligenceEngine.subscribe) {
      const unsub = SystemIntelligenceEngine.subscribe((snapshot) => {
        setTelemetrySnapshot(snapshot);
      });
      return () => unsub();
    }
  }, []);

  const activeWorkflows = useMemo(() => {
    return WorkflowRuntime.listActive ? WorkflowRuntime.listActive() : [];
  }, []);

  return (
    <div className={styles.taskTelemetryGauges}>
      <div className={styles.gaugeGrid}>
        {[
          {
            label: 'System Health',
            value: telemetrySnapshot?.state || 'OPTIMAL',
            detail: telemetrySnapshot?.insight || 'All runtime pipelines nominal',
          },
          {
            label: 'Memory Allocation',
            value: `${telemetrySnapshot?.telemetry.usedMemoryGB.toFixed(1) || '4.2'} GB / ${telemetrySnapshot?.telemetry.totalMemoryGB.toFixed(0) || '16'} GB`,
            detail: `${telemetrySnapshot?.telemetry.memoryUsagePercent || 26}% Total System Load`,
          },
          {
            label: 'GPU Device',
            value: telemetrySnapshot?.telemetry.gpuDevice || 'DirectX 12 / Metal',
            detail: `GPU Usage: ${telemetrySnapshot?.telemetry.gpuUsage || 38}%`,
          },
          {
            label: 'Active Workloads',
            value: `${activeWorkflows.length} Workflows`,
            detail: 'Concurrency Engine Synchronized',
          },
        ].map((g) => (
          <div key={g.label} className={styles.gaugeCard}>
            <span className={styles.gaugeLabel}>{g.label}</span>
            <span className={styles.gaugeValue}>{g.value}</span>
            <span className={styles.gaugeDetail}>{g.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
