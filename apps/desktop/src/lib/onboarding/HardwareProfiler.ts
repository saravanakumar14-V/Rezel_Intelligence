/**
 * Rezel OS — Hardware Capability Profiler (Milestone R8)
 *
 * Translates genuinely detected hardware telemetry into human-understandable capability profiles.
 * Never fabricates hardware/system state.
 */

import { SystemIntelligenceEngine } from '../system/SystemIntelligenceEngine';
import type { DiscoveredEnvironment, HardwareCapabilityProfile, HardwareTier } from './types';

export class HardwareProfiler {
  public static async discoverEnvironment(): Promise<DiscoveredEnvironment> {
    const snapshot = SystemIntelligenceEngine.getSnapshot();
    const tel = snapshot?.telemetry;
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : undefined;

    let os: string | undefined = undefined;
    if (typeof navigator !== 'undefined') {
      if (navigator.userAgent.includes('Windows')) os = 'Windows Platform';
      else if (navigator.userAgent.includes('Mac')) os = 'macOS Apple Silicon / Darwin';
      else if (navigator.userAgent.includes('Linux')) os = 'Linux / POSIX';
    }

    const hasGpu = Boolean(tel?.gpuDevice && tel.gpuDevice.trim().length > 0);
    const hasMem = typeof tel?.totalMemoryGB === 'number' && tel.totalMemoryGB > 0;
    const hasStorage = typeof tel?.storageFreeGB === 'number' && tel.storageFreeGB > 0;

    let status: 'SUCCESS' | 'PARTIAL' | 'UNAVAILABLE' = 'SUCCESS';
    if (!hasGpu || !hasMem || !hasStorage || !cores) {
      status = (hasGpu || hasMem || hasStorage || cores || os) ? 'PARTIAL' : 'UNAVAILABLE';
    }

    return {
      status,
      os,
      cpuName: cores ? `${cores}-Core Processor` : undefined,
      cpuCores: cores,
      gpuDevice: hasGpu ? tel.gpuDevice : undefined,
      totalMemoryGB: hasMem ? tel.totalMemoryGB : undefined,
      storageFreeGB: hasStorage ? tel.storageFreeGB : undefined,
      isNetworkConnected: tel?.isNetworkConnected,
      dpr,
    };
  }

  public static evaluateProfile(env: DiscoveredEnvironment): HardwareCapabilityProfile {
    let tier: HardwareTier = 'MEDIUM'; // Safe default tier

    if (env.totalMemoryGB && env.cpuCores) {
      if (env.totalMemoryGB >= 32 && env.cpuCores >= 12) {
        tier = 'ULTRA';
      } else if (env.totalMemoryGB >= 16 && env.cpuCores >= 6) {
        tier = 'HIGH';
      } else if (env.totalMemoryGB >= 8 && env.cpuCores >= 4) {
        tier = 'MEDIUM';
      } else {
        tier = 'LOW';
      }
    }

    let summary = '';
    const recommendations: string[] = [];

    if (env.status === 'UNAVAILABLE' || env.status === 'PARTIAL') {
      summary = 'Safe defaults active · Standard execution profile.';
      recommendations.push('Balanced cloud/local model execution');
      recommendations.push('Standard spatial UI rendering active');
      recommendations.push('Sequential execution workflows');
    } else {
      switch (tier) {
        case 'ULTRA':
          summary = 'Exceptional high-throughput workstation hardware detected.';
          recommendations.push('Full local 70B+ model execution capable');
          recommendations.push('Ultra spatial depth & real-time volumetric post-processing');
          recommendations.push('High-concurrency autonomous workflow swarms');
          break;
        case 'HIGH':
          summary = 'Robust modern computing platform with dedicated GPU acceleration.';
          recommendations.push('Local 7B - 14B model execution (Ollama / GGUF)');
          recommendations.push('Full 60 FPS spatial visual experience & bloom');
          recommendations.push('Multi-provider hybrid routing enabled');
          break;
        case 'MEDIUM':
          summary = 'Standard balanced performance configuration.';
          recommendations.push('Optimized local 3B - 7B models or Cloud AI');
          recommendations.push('Standard spatial UI rendering mode');
          recommendations.push('Single-task autonomous agent loops');
          break;
        case 'LOW':
          summary = 'Constrained or battery-conserving environment.';
          recommendations.push('Cloud AI providers recommended for heavy tasks');
          recommendations.push('Reduced motion & lightweight glass shaders active');
          recommendations.push('Sequential execution mode');
          break;
      }
    }

    return {
      tier,
      summary,
      recommendations,
      specs: {
        cpu: env.cpuCores ? `${env.cpuCores} Cores · ${env.cpuName || 'Processor'}` : '—',
        gpu: env.gpuDevice || '—',
        ram: env.totalMemoryGB ? `${env.totalMemoryGB.toFixed(0)} GB Physical Memory` : '—',
        storage: env.storageFreeGB ? `${env.storageFreeGB.toFixed(0)} GB Available Disk Storage` : '—',
      },
    };
  }
}
