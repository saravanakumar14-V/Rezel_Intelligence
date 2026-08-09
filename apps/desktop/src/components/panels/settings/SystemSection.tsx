import { Cpu, HardDrive } from 'lucide-react';
import { useSystemMetrics } from '../../../hooks/useSystemMetrics';
import type { SystemMetrics } from '../../../hooks/useSystemMetrics';

/**
 * Format byte count to fixed 1 decimal place GB representation (e.g., "16.0 GB").
 */
function formatBytes(bytes: number): string {
  return (bytes / (1024 ** 3)).toFixed(1) + ' GB';
}

/**
 * SystemSection
 *
 * Read-only section component for the Rezel Settings panel displaying
 * real-time CPU usage and RAM memory metrics from `useSystemMetrics`.
 */
export default function SystemSection() {
  const metrics: SystemMetrics | null = useSystemMetrics();

  const cpuPercent = metrics ? Math.min(100, Math.max(0, metrics.cpu_usage)) : 0;
  const memPercent =
    metrics && metrics.total_memory > 0
      ? Math.min(100, Math.max(0, (metrics.used_memory / metrics.total_memory) * 100))
      : 0;

  return (
    <div className="flex flex-col gap-3 py-2">
      {/* Section Label */}
      <span
        className="uppercase"
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: '9px',
          letterSpacing: '0.14em',
          color: '#7ECFFF',
        }}
      >
        SYSTEM INFORMATION
      </span>

      {!metrics ? (
        /* Dim loading state placeholder */
        <div className="flex items-center py-2 opacity-50">
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '10px',
              color: '#4BB8F0',
            }}
          >
            Loading...
          </span>
        </div>
      ) : (
        /* Metrics display */
        <div className="flex flex-col gap-3.5">
          {/* CPU Usage Row */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Cpu size={13} style={{ color: '#4BB8F0' }} />
                <span style={{ fontSize: '10px', color: '#4BB8F0' }}>CPU Usage</span>
              </div>
              <span
                style={{
                  fontSize: '10px',
                  color: '#E0F0FF',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {cpuPercent.toFixed(1)}%
              </span>
            </div>
            <div
              className="h-[3px] rounded full-width mt-1 w-full overflow-hidden"
              style={{ background: 'rgba(0,229,255,0.08)' }}
            >
              <div
                className="h-full rounded transition-all duration-300"
                style={{ width: `${cpuPercent}%`, backgroundColor: '#00E5FF' }}
              />
            </div>
          </div>

          {/* Memory Usage Row */}
          <div className="flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <HardDrive size={13} style={{ color: '#4BB8F0' }} />
                <span style={{ fontSize: '10px', color: '#4BB8F0' }}>Memory</span>
              </div>
              <span
                style={{
                  fontSize: '10px',
                  color: '#E0F0FF',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {formatBytes(metrics.used_memory)} / {formatBytes(metrics.total_memory)} ({memPercent.toFixed(1)}%)
              </span>
            </div>
            <div
              className="h-[3px] rounded full-width mt-1 w-full overflow-hidden"
              style={{ background: 'rgba(0,229,255,0.08)' }}
            >
              <div
                className="h-full rounded transition-all duration-300"
                style={{ width: `${memPercent}%`, backgroundColor: '#00E5FF' }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

