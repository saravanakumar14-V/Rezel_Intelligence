export type ModelSourceType = 'CLOUD' | 'OLLAMA' | 'HUGGINGFACE' | 'LOCAL_FILE';

export type ModelLifecycleState =
  | 'DISCOVERED'
  | 'EVALUATING'
  | 'DOWNLOADING'
  | 'VERIFYING'
  | 'INSTALLING'
  | 'REGISTERING'
  | 'READY'
  | 'ACTIVE'
  | 'FAILED'
  | 'CANCELLED'
  | 'REMOVING';

export type CompatibilityRating =
  | 'EXCELLENT'
  | 'GOOD'
  | 'LIMITED'
  | 'NOT_RECOMMENDED'
  | 'INCOMPATIBLE';

export interface HardwareCompatibilityResult {
  rating: CompatibilityRating;
  requiredVramGB: number;
  requiredRamGB: number;
  explanation: string;
  isGpuAccelerated: boolean;
  maxRecommendedContext: number;
}

export interface UniversalModelRecord {
  id: string;                          // Unique identifier, e.g. "qwen2.5-coder:7b", "gemini-1.5-pro", "TheBloke/Mistral-7B-GGUF"
  displayName: string;
  source: ModelSourceType;
  providerVendor?: 'GEMINI' | 'OPENAI' | 'ANTHROPIC' | 'OLLAMA' | 'CUSTOM';
  author?: string;
  description: string;
  parameterCount?: string;             // e.g. "7B", "14B", "70B"
  quantization?: string;               // e.g. "Q4_K_M", "Q8_0", "FP16"
  downloadSizeBytes?: number;
  installedSizeBytes?: number;
  contextLengthTokens: number;
  modality: Array<'text' | 'vision' | 'audio' | 'tools'>;
  isLocal: boolean;
  state: ModelLifecycleState;
  compatibility?: HardwareCompatibilityResult;
  sha256Checksum?: string;
  downloadProgress?: {
    bytesReceived: number;
    totalBytes: number;
    speedBytesPerSec: number;
    etaSeconds: number;
    percent: number;
  };
  license?: string;
  recommendedTasks: string[];
}
