import { invoke } from "@tauri-apps/api/core";
import { WorkflowRuntime } from "../ai/WorkflowRuntime";
import { ApplicationRegistry } from "../applications/ApplicationRegistry";
import { KnowledgeIngestionManager } from "../ai/knowledge/KnowledgeIngestionManager";

export type SystemHealthState =
  | 'OPTIMAL'
  | 'NORMAL'
  | 'ELEVATED_LOAD'
  | 'MEMORY_PRESSURE'
  | 'GPU_PRESSURE'
  | 'STORAGE_PRESSURE'
  | 'LOCAL_MODEL_LOADING'
  | 'BACKGROUND_PROCESSING'
  | 'POWER_CONSTRAINED';

export interface HardwareTelemetry {
  cpuUsage: number;         // 0 - 100%
  totalMemoryGB: number;
  usedMemoryGB: number;
  availableMemoryGB: number;
  memoryUsagePercent: number;
  gpuUsage: number;         // 0 - 100%
  vramUsedGB?: number;
  vramTotalGB?: number;
  gpuDevice: string;
  storageFreeGB: number;
  storageTotalGB: number;
  isBatteryPowered: boolean;
  batteryPercent?: number;
  isNetworkConnected: boolean;
  networkLatencyMs: number;
}

export interface ActiveWorkloadContext {
  activeApp?: string;
  isRendering?: boolean;
  isModelLoading?: boolean;
  isIndexing?: boolean;
  activeWorkflowCount: number;
  activeWorkloadDescription?: string;
}

export interface SystemIntelligenceSnapshot {
  timestamp: number;
  state: SystemHealthState;
  insight: string;
  telemetry: HardwareTelemetry;
  workload: ActiveWorkloadContext;
  adaptiveBudget: {
    particleScale: number; // 0.2 - 1.0
    enableBloom: boolean;
    tier: 'LOW' | 'MEDIUM' | 'HIGH';
  };
}

export type SystemTelemetryListener = (snapshot: SystemIntelligenceSnapshot) => void;

class SystemIntelligenceEngineImpl {
  private listeners = new Set<SystemTelemetryListener>();
  private currentSnapshot: SystemIntelligenceSnapshot;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.currentSnapshot = this.generateBaselineSnapshot();
    this.startPolling();
  }

  private generateBaselineSnapshot(): SystemIntelligenceSnapshot {
    return {
      timestamp: Date.now(),
      state: 'NORMAL',
      insight: 'System resources are balanced and operating normally.',
      telemetry: {
        cpuUsage: 18,
        totalMemoryGB: 16,
        usedMemoryGB: 5.8,
        availableMemoryGB: 10.2,
        memoryUsagePercent: 36,
        gpuUsage: 12,
        vramUsedGB: 1.4,
        vramTotalGB: 8.0,
        gpuDevice: 'Dedicated High-Performance GPU',
        storageFreeGB: 240,
        storageTotalGB: 512,
        isBatteryPowered: false,
        batteryPercent: 100,
        isNetworkConnected: true,
        networkLatencyMs: 24,
      },
      workload: {
        activeWorkflowCount: 0,
        isIndexing: false,
      },
      adaptiveBudget: {
        particleScale: 1.0,
        enableBloom: true,
        tier: 'HIGH',
      },
    };
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.updateTelemetry(), 3000);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  public async updateTelemetry(): Promise<void> {
    try {
      const raw = await invoke<{ cpu_usage: number; total_memory: number; used_memory: number }>('get_system_info');
      const totalGB = raw.total_memory / (1024 * 1024 * 1024);
      const usedGB = raw.used_memory / (1024 * 1024 * 1024);
      const memPercent = Math.round((usedGB / totalGB) * 100);

      this.currentSnapshot.telemetry.cpuUsage = Math.round(raw.cpu_usage);
      this.currentSnapshot.telemetry.totalMemoryGB = Number(totalGB.toFixed(1));
      this.currentSnapshot.telemetry.usedMemoryGB = Number(usedGB.toFixed(1));
      this.currentSnapshot.telemetry.availableMemoryGB = Number((totalGB - usedGB).toFixed(1));
      this.currentSnapshot.telemetry.memoryUsagePercent = memPercent;
    } catch {
      // In web dev context
    }

    // Inspect active workloads
    const activeWorkflows = WorkflowRuntime.listActive ? WorkflowRuntime.listActive() : [];
    const registeredApps = ApplicationRegistry.list ? ApplicationRegistry.list() : [];
    const activeApp = registeredApps.length > 0 ? registeredApps[0].applicationId : undefined;
    const isIndexing = KnowledgeIngestionManager.listDocuments
      ? KnowledgeIngestionManager.listDocuments().some((d) => d.state === 'PARSING' || d.state === 'INDEXING')
      : false;

    this.currentSnapshot.workload = {
      activeApp,
      activeWorkflowCount: activeWorkflows.length,
      isIndexing,
    };

    // Synthesize interpretation & insight
    this.evaluateSystemState();
    this.notify();
  }

  private evaluateSystemState(): void {
    const { telemetry, workload } = this.currentSnapshot;

    if (telemetry.gpuUsage > 80 && workload.activeApp === 'BLENDER') {
      this.currentSnapshot.state = 'GPU_PRESSURE';
      this.currentSnapshot.insight = 'GPU load is elevated because Blender is actively computing or rendering.';
      this.currentSnapshot.adaptiveBudget = { particleScale: 0.4, enableBloom: false, tier: 'LOW' };
    } else if (telemetry.memoryUsagePercent > 85) {
      this.currentSnapshot.state = 'MEMORY_PRESSURE';
      this.currentSnapshot.insight = 'Available RAM is constrained. Large model loading may experience latency.';
      this.currentSnapshot.adaptiveBudget = { particleScale: 0.5, enableBloom: true, tier: 'MEDIUM' };
    } else if (workload.isIndexing) {
      this.currentSnapshot.state = 'BACKGROUND_PROCESSING';
      this.currentSnapshot.insight = 'Knowledge base indexing is active in the background.';
      this.currentSnapshot.adaptiveBudget = { particleScale: 0.8, enableBloom: true, tier: 'MEDIUM' };
    } else if (telemetry.cpuUsage > 75) {
      this.currentSnapshot.state = 'ELEVATED_LOAD';
      this.currentSnapshot.insight = 'CPU utilization is elevated by background tasks. Core responsiveness maintained.';
      this.currentSnapshot.adaptiveBudget = { particleScale: 0.7, enableBloom: true, tier: 'MEDIUM' };
    } else {
      this.currentSnapshot.state = 'NORMAL';
      this.currentSnapshot.insight = 'System resources are balanced and operating smoothly.';
      this.currentSnapshot.adaptiveBudget = { particleScale: 1.0, enableBloom: true, tier: 'HIGH' };
    }
  }

  subscribe(listener: SystemTelemetryListener): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.startPolling();
    }
    try {
      listener(this.currentSnapshot);
    } catch (err) {
      console.error('[SystemIntelligenceEngine] Initial listener error:', err);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stopPolling();
      }
    };
  }

  getSnapshot(): SystemIntelligenceSnapshot {
    return this.currentSnapshot;
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.currentSnapshot);
      } catch (err) {
        console.error('[SystemIntelligenceEngine] Listener error:', err);
      }
    }
  }
}

export const SystemIntelligenceEngine = new SystemIntelligenceEngineImpl();
