import type { HardwareCompatibilityResult, CompatibilityRating } from './types';

export interface SystemSpecs {
  totalRamGB: number;
  availableRamGB: number;
  vramGB?: number;
  cpuCores: number;
}

export class HardwareCompatibilityEngine {
  /**
   * Evaluates compatibility of a model based on parameter count, quantization, and system specs.
   */
  static evaluate(
    paramCountStr: string | undefined,
    quantization: string | undefined,
    specs: SystemSpecs
  ): HardwareCompatibilityResult {
    const paramsInBillions = this.parseParamCount(paramCountStr);
    const quantBits = this.parseQuantBits(quantization);

    // Heuristic base memory requirement: (Params * QuantBits / 8) + 20% KV cache overhead
    const baseModelMemoryGB = (paramsInBillions * (quantBits / 8)) * 1.2;
    const requiredRamGB = Math.max(2, Math.round(baseModelMemoryGB * 1.3 * 10) / 10);
    const requiredVramGB = Math.max(0, Math.round(baseModelMemoryGB * 1.1 * 10) / 10);

    const systemRam = specs.totalRamGB || 16;
    const systemVram = specs.vramGB ?? (specs.totalRamGB >= 32 ? 8 : 4);

    let rating: CompatibilityRating = 'GOOD';
    let explanation = '';
    let isGpuAccelerated = false;
    let maxRecommendedContext = 4096;

    if (paramsInBillions === 0) {
      // Cloud model or unknown
      return {
        rating: 'EXCELLENT',
        requiredRamGB: 0.5,
        requiredVramGB: 0,
        explanation: 'Cloud model hosted externally. Minimal local hardware impact.',
        isGpuAccelerated: true,
        maxRecommendedContext: 128_000,
      };
    }

    if (systemVram >= requiredVramGB) {
      rating = 'EXCELLENT';
      isGpuAccelerated = true;
      maxRecommendedContext = 32_768;
      explanation = `Full GPU acceleration possible. Fits comfortably in ${systemVram} GB VRAM.`;
    } else if (systemRam >= requiredRamGB + 4) {
      rating = 'GOOD';
      isGpuAccelerated = systemVram >= 2;
      maxRecommendedContext = 8192;
      explanation = `Runs smoothly with CPU/RAM and partial GPU offloading (${systemRam} GB RAM).`;
    } else if (systemRam >= requiredRamGB) {
      rating = 'LIMITED';
      isGpuAccelerated = false;
      maxRecommendedContext = 4096;
      explanation = `Fits in RAM but may cause memory pressure under high context or heavy multitasking.`;
    } else if (systemRam >= requiredRamGB * 0.75) {
      rating = 'NOT_RECOMMENDED';
      isGpuAccelerated = false;
      maxRecommendedContext = 2048;
      explanation = `Exceeds available RAM. Will rely on heavy disk swapping resulting in high latency.`;
    } else {
      rating = 'INCOMPATIBLE';
      isGpuAccelerated = false;
      maxRecommendedContext = 1024;
      explanation = `Model size (${requiredRamGB} GB) exceeds total system capacity (${systemRam} GB).`;
    }

    return {
      rating,
      requiredRamGB,
      requiredVramGB,
      explanation,
      isGpuAccelerated,
      maxRecommendedContext,
    };
  }

  private static parseParamCount(str?: string): number {
    if (!str) return 0;
    const match = str.match(/([0-9.]+)\s*B/i);
    if (match) return parseFloat(match[1]);
    const matchM = str.match(/([0-9.]+)\s*M/i);
    if (matchM) return parseFloat(matchM[1]) / 1000;
    return 0;
  }

  private static parseQuantBits(quant?: string): number {
    if (!quant) return 4.5; // Default assumption is Q4_K_M (~4.5 bits)
    const upper = quant.toUpperCase();
    if (upper.includes('Q4')) return 4.5;
    if (upper.includes('Q5')) return 5.5;
    if (upper.includes('Q8')) return 8.5;
    if (upper.includes('FP16')) return 16;
    if (upper.includes('FP32')) return 32;
    return 4.5;
  }
}
