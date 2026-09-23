import type { UniversalModelRecord } from './types';
import { HardwareCompatibilityEngine, type SystemSpecs } from './HardwareCompatibilityEngine';

export class HuggingFaceService {
  private static readonly API_BASE = 'https://huggingface.co/api';

  /**
   * Search models on Hugging Face Hub.
   */
  static async searchModels(query: string, specs?: SystemSpecs): Promise<UniversalModelRecord[]> {
    try {
      const url = `${this.API_BASE}/models?search=${encodeURIComponent(query)}&filter=gguf&sort=downloads&direction=-1&limit=12`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HuggingFace API error: ${res.status}`);
      const data = await res.json();

      return data.map((item: any) => this.mapHfItemToRecord(item, specs));
    } catch (err) {
      console.warn('[HuggingFaceService] Search failed, falling back to curated registry:', err);
      return this.getCuratedModels(specs);
    }
  }

  /**
   * Returns a curated list of top popular local models (Qwen, Llama, Mistral, DeepSeek, Phi).
   */
  static getCuratedModels(specs?: SystemSpecs): UniversalModelRecord[] {
    const sysSpecs = specs || { totalRamGB: 16, availableRamGB: 10, cpuCores: 8, vramGB: 4 };

    const list: Omit<UniversalModelRecord, 'compatibility'>[] = [
      {
        id: 'qwen2.5-coder:7b',
        displayName: 'Qwen 2.5 Coder 7B',
        source: 'OLLAMA',
        providerVendor: 'OLLAMA',
        author: 'Qwen',
        description: 'Exceptional code generation, refactoring, and reasoning model tuned for software development.',
        parameterCount: '7B',
        quantization: 'Q4_K_M',
        downloadSizeBytes: 4_700_000_000,
        installedSizeBytes: 4_700_000_000,
        contextLengthTokens: 32_768,
        modality: ['text', 'tools'],
        isLocal: true,
        state: 'READY',
        recommendedTasks: ['CODING', 'AUTOMATION', 'REASONING'],
        license: 'Apache-2.0',
      },
      {
        id: 'llama3.2:3b',
        displayName: 'Llama 3.2 3B Instruct',
        source: 'OLLAMA',
        providerVendor: 'OLLAMA',
        author: 'Meta',
        description: 'Ultra-fast, lightweight on-device assistant ideal for integrated GPUs and mobile hardware.',
        parameterCount: '3B',
        quantization: 'Q4_K_M',
        downloadSizeBytes: 2_000_000_000,
        installedSizeBytes: 2_000_000_000,
        contextLengthTokens: 128_000,
        modality: ['text', 'tools'],
        isLocal: true,
        state: 'READY',
        recommendedTasks: ['CONVERSATION', 'FAST', 'SYSTEM'],
        license: 'Llama-3.2-Community',
      },
      {
        id: 'deepseek-r1:8b',
        displayName: 'DeepSeek R1 Distill 8B',
        source: 'HUGGINGFACE',
        providerVendor: 'OLLAMA',
        author: 'DeepSeek',
        description: 'High-power chain-of-thought reasoning model optimized for mathematical and logical planning.',
        parameterCount: '8B',
        quantization: 'Q4_K_M',
        downloadSizeBytes: 4_900_000_000,
        installedSizeBytes: 4_900_000_000,
        contextLengthTokens: 64_000,
        modality: ['text', 'tools'],
        isLocal: true,
        state: 'DISCOVERED',
        recommendedTasks: ['REASONING', 'PLANNING'],
        license: 'MIT',
      },
      {
        id: 'phi4:14b',
        displayName: 'Phi-4 14B',
        source: 'HUGGINGFACE',
        author: 'Microsoft',
        description: 'Synthetic data pre-trained reasoning model offering enterprise-grade quality at compact size.',
        parameterCount: '14B',
        quantization: 'Q4_K_M',
        downloadSizeBytes: 9_100_000_000,
        installedSizeBytes: 9_100_000_000,
        contextLengthTokens: 16_384,
        modality: ['text', 'tools'],
        isLocal: true,
        state: 'DISCOVERED',
        recommendedTasks: ['REASONING', 'CODING'],
        license: 'MIT',
      },
      {
        id: 'gemini-1.5-pro',
        displayName: 'Gemini 1.5 Pro',
        source: 'CLOUD',
        providerVendor: 'GEMINI',
        author: 'Google DeepMind',
        description: 'Flagship multi-modal model with 2M token context, high-precision tool calling, and deep reasoning.',
        parameterCount: 'Cloud',
        contextLengthTokens: 2_097_152,
        modality: ['text', 'vision', 'audio', 'tools'],
        isLocal: false,
        state: 'ACTIVE',
        recommendedTasks: ['CONVERSATION', 'REASONING', 'CODING', 'VISION', 'AUTOMATION'],
      },
    ];

    return list.map((item) => ({
      ...item,
      compatibility: HardwareCompatibilityEngine.evaluate(item.parameterCount, item.quantization, sysSpecs),
    }));
  }

  private static mapHfItemToRecord(item: any, specs?: SystemSpecs): UniversalModelRecord {
    const sysSpecs = specs || { totalRamGB: 16, availableRamGB: 10, cpuCores: 8, vramGB: 4 };
    const id = item.id || item._id;
    const author = id.split('/')[0] || 'Community';
    const name = id.split('/')[1] || id;

    // Detect param count heuristics from name
    let paramCount = '7B';
    const match = name.match(/([0-9.]+[BbMm])/);
    if (match) paramCount = match[1].toUpperCase();

    return {
      id,
      displayName: name.replace(/-gguf/i, '').replace(/_/g, ' '),
      source: 'HUGGINGFACE',
      author,
      description: item.description || `Hugging Face GGUF model repository by ${author}.`,
      parameterCount: paramCount,
      quantization: 'Q4_K_M',
      downloadSizeBytes: 4_500_000_000,
      contextLengthTokens: 32_768,
      modality: ['text', 'tools'],
      isLocal: true,
      state: 'DISCOVERED',
      license: item.license || 'Open Source',
      recommendedTasks: ['REASONING', 'CODING'],
      compatibility: HardwareCompatibilityEngine.evaluate(paramCount, 'Q4_K_M', sysSpecs),
    };
  }
}
