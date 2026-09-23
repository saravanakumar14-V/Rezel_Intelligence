import { useState, useEffect } from 'react';
import { Cpu, HardDrive, Zap, Activity, Wifi } from 'lucide-react';
import {
  SystemIntelligenceEngine,
  type SystemIntelligenceSnapshot,
} from '../../../lib/system/SystemIntelligenceEngine';

export default function SystemSection() {
  const [snapshot, setSnapshot] = useState<SystemIntelligenceSnapshot>(() =>
    SystemIntelligenceEngine.getSnapshot()
  );

  useEffect(() => {
    const unsub = SystemIntelligenceEngine.subscribe((snap) => {
      setSnapshot(snap);
    });
    return () => unsub();
  }, []);

  const { telemetry, state, insight, adaptiveBudget } = snapshot;

  return (
    <div className="flex flex-col gap-3 py-2">
      {/* Section Header & Status Pill */}
      <div className="flex items-center justify-between">
        <span
          className="uppercase"
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '9px',
            letterSpacing: '0.14em',
            color: '#7ECFFF',
          }}
        >
          SYSTEM INTELLIGENCE & TELEMETRY
        </span>

        <span
          className="font-mono text-[8px] font-bold px-2 py-0.5 rounded border"
          style={{
            backgroundColor: state === 'NORMAL' || state === 'OPTIMAL' ? 'rgba(0, 230, 118, 0.12)' : 'rgba(255, 159, 28, 0.15)',
            borderColor: state === 'NORMAL' || state === 'OPTIMAL' ? 'rgba(0, 230, 118, 0.3)' : 'rgba(255, 159, 28, 0.35)',
            color: state === 'NORMAL' || state === 'OPTIMAL' ? '#00E676' : '#FF9F1C',
          }}
        >
          {state}
        </span>
      </div>

      {/* Contextual System Insight Card */}
      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-[rgba(0,229,255,0.04)] border border-[rgba(0,229,255,0.15)] font-mono text-[9px] text-[#EAFBFF]">
        <Activity size={12} className="text-[#00E5FF] shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5">
          <span className="text-[#00E5FF] font-bold">CONTEXTUAL INSIGHT</span>
          <span className="text-white/80 font-sans text-xs">{insight}</span>
        </div>
      </div>

      {/* Metrics display */}
      <div className="flex flex-col gap-3">
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
              {telemetry.cpuUsage}%
            </span>
          </div>
          <div
            className="h-[3px] rounded full-width mt-1 w-full overflow-hidden"
            style={{ background: 'rgba(0,229,255,0.08)' }}
          >
            <div
              className="h-full rounded transition-all duration-300"
              style={{ width: `${Math.min(100, telemetry.cpuUsage)}%`, backgroundColor: '#00E5FF' }}
            />
          </div>
        </div>

        {/* Memory Usage Row */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <HardDrive size={13} style={{ color: '#4BB8F0' }} />
              <span style={{ fontSize: '10px', color: '#4BB8F0' }}>Memory (RAM)</span>
            </div>
            <span
              style={{
                fontSize: '10px',
                color: '#E0F0FF',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {telemetry.usedMemoryGB} GB / {telemetry.totalMemoryGB} GB ({telemetry.memoryUsagePercent}%)
            </span>
          </div>
          <div
            className="h-[3px] rounded full-width mt-1 w-full overflow-hidden"
            style={{ background: 'rgba(0,229,255,0.08)' }}
          >
            <div
              className="h-full rounded transition-all duration-300"
              style={{ width: `${Math.min(100, telemetry.memoryUsagePercent)}%`, backgroundColor: '#00FFAE' }}
            />
          </div>
        </div>

        {/* GPU & Storage Gauges Grid */}
        <div className="grid grid-cols-2 gap-2 font-mono text-[9px] pt-1">
          <div className="p-2 rounded bg-black/30 border border-white/5 flex flex-col gap-1">
            <div className="flex items-center gap-1 text-white/50">
              <Zap size={10} className="text-[#FFD54F]" />
              <span>GPU UTILIZATION</span>
            </div>
            <span className="text-[#EAFBFF] font-bold text-xs">{telemetry.gpuUsage}%</span>
            <span className="text-white/40 text-[8px]">VRAM: {telemetry.vramUsedGB} / {telemetry.vramTotalGB} GB</span>
          </div>

          <div className="p-2 rounded bg-black/30 border border-white/5 flex flex-col gap-1">
            <div className="flex items-center gap-1 text-white/50">
              <Wifi size={10} className="text-[#00E5FF]" />
              <span>NETWORK LATENCY</span>
            </div>
            <span className="text-[#EAFBFF] font-bold text-xs">{telemetry.networkLatencyMs} ms</span>
            <span className="text-[#00E676] text-[8px]">Adaptive Tier: {adaptiveBudget.tier}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

