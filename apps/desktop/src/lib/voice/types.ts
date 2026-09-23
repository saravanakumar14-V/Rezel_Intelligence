export type VoiceState = 'IDLE' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'INTERRUPTED' | 'ERROR';

export interface VoiceEvent {
  type: 'state_change' | 'interim_transcript' | 'final_transcript' | 'error';
  state?: VoiceState;
  transcript?: string;
  error?: string;
}

export type VoiceEventHandler = (event: VoiceEvent) => void;

export interface TTSProfile {
  pace: number;
  pitch: number;
  tone: string;
  voiceId?: string;
  modelId?: string;
  sampleRate?: number;
}

export interface STTProvider {
  /** Start listening continuously */
  start(): void;
  /** Stop listening and flush final results */
  stop(): void;
  /** Abort listening immediately */
  abort(): void;
  /** Set callbacks */
  setCallbacks(
    onResult: (interim: string, final: string) => void,
    onError: (error: string, fatal: boolean) => void,
    onEnd: () => void
  ): void;
}

export interface TTSProvider {
  /** Speak a given text */
  speak(text: string, profile: TTSProfile, onStart: () => void, onEnd: () => void, onError: (err: string) => void): void;
  /** Cancel any ongoing speech */
  cancel(): void;
}

export interface VADFrame {
  state: 'SILENCE' | 'SPEECH';
  confidence: number;
  timestamp: number;
}

export type VADEventHandler = (frame: VADFrame) => void;

export interface VADProvider {
  start(): void;
  stop(): void;
  on(event: 'frame', handler: VADEventHandler): void;
  off(event: 'frame', handler: VADEventHandler): void;
}

export type BargeInMode = 'BROWSER_BARGE_IN' | 'NATIVE_BARGE_IN' | 'OFF';

export type VoiceProviderMode = 'AUTO' | 'NATIVE' | 'BROWSER';

export interface AudioDevice {
  id: string;
  name: string;
  isDefault: boolean;
  isInput: boolean;
  channels: number;
  sampleRates: number[];
}

export interface AudioSessionStatus {
  isRunning: boolean;
  activeInputDevice: string | null;
  activeOutputDevice: string | null;
  sampleRate: number;
  aecEnabled: boolean;
  inputLevel: number;
  outputLevel: number;
}

export interface AudioProcessingMetadata {
  processingMode: 'LOCAL' | 'REMOTE' | 'HYBRID';
  sttModel: string;
  ttsModel: string;
  vadModel: string;
  aecEnabled: boolean;
  zeroRawAudioPersistence: boolean;
}
