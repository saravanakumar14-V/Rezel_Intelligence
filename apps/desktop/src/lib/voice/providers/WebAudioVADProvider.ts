import type { VADProvider, VADEventHandler, VADFrame } from '../types';

export interface VADConfig {
  volumeThreshold?: number; // 0.0 to 1.0 range, default 0.05
  minSpeechDuration?: number; // ms required above threshold to trigger SPEECH, default 200ms
  silenceDebounce?: number; // ms required below threshold to trigger SILENCE, default 1000ms
}

/**
 * WebAudioVADProvider
 * 
 * Implements Voice Activity Detection using the Web Audio API AnalyserNode.
 * Evaluates amplitude threshold over time to determine speech state.
 * Emits 'SPEECH' when sustained volume is detected, and 'SILENCE' after a debounce.
 * 
 * Architecture:
 *  - getUserMedia({ audio: true }) acquires microphone stream
 *  - AudioContext + AnalyserNode calculates RMS energy
 *  - minSpeechDuration prevents false positives from momentary volume spikes / clicks
 *  - silenceDebounce prevents rapid toggling between words during normal pauses
 *  - processAudioFrame() allows deterministic offline testing without live hardware
 * 
 * Note on Browser Echo Cancellation:
 *  Browser-based getUserMedia({ audio: true }) requests platform Acoustic Echo Cancellation (AEC)
 *  if supported by the OS and browser. However, when audio is playing through speakers at high
 *  volume, acoustic leakage into the microphone may still cause false-positive VAD triggers.
 *  For production environments, headphones or hardware AEC is recommended.
 */
export class WebAudioVADProvider implements VADProvider {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private animationFrameId: number | null = null;
  
  private handlers = new Set<VADEventHandler>();
  
  private isListening = false;
  private currentState: 'SILENCE' | 'SPEECH' = 'SILENCE';
  
  // VAD Configuration
  private volumeThreshold = 0.05; // 0.0 to 1.0 range
  private minSpeechDuration = 200; // ms required above threshold to trigger SPEECH
  private silenceDebounce = 1000; // ms required below threshold to trigger SILENCE
  
  private speechStartTime: number | null = null;
  private silenceStartTime: number | null = null;

  constructor(config?: VADConfig) {
    if (config?.volumeThreshold !== undefined) this.volumeThreshold = config.volumeThreshold;
    if (config?.minSpeechDuration !== undefined) this.minSpeechDuration = config.minSpeechDuration;
    if (config?.silenceDebounce !== undefined) this.silenceDebounce = config.silenceDebounce;
  }

  public setConfig(config: VADConfig): void {
    if (config.volumeThreshold !== undefined) this.volumeThreshold = config.volumeThreshold;
    if (config.minSpeechDuration !== undefined) this.minSpeechDuration = config.minSpeechDuration;
    if (config.silenceDebounce !== undefined) this.silenceDebounce = config.silenceDebounce;
  }

  public getState(): 'SILENCE' | 'SPEECH' {
    return this.currentState;
  }

  async start(): Promise<void> {
    if (this.isListening) return;

    if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
      console.warn('[VAD] MediaDevices API not available in this environment');
      return;
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }, 
        video: false 
      });
      
      const AudioCtx = window.AudioContext || (window as unknown as Record<string, unknown>).webkitAudioContext as typeof AudioContext;
      if (!AudioCtx) {
        console.warn('[VAD] AudioContext not available');
        return;
      }

      this.audioContext = new AudioCtx();
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      
      // Configure analyser
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.4;
      
      this.source.connect(this.analyser);
      
      this.isListening = true;
      this.speechStartTime = null;
      this.silenceStartTime = null;
      this.currentState = 'SILENCE';
      
      this.processAudio();
    } catch (err) {
      console.error('[VAD] Failed to initialize microphone for VAD:', err);
    }
  }

  stop(): void {
    this.isListening = false;
    
    if (this.animationFrameId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    
    if (this.analyser) {
      this.analyser.disconnect();
      this.analyser = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    
    this.speechStartTime = null;
    this.silenceStartTime = null;

    if (this.currentState !== 'SILENCE') {
      this.updateState('SILENCE', 0);
    }
  }

  on(event: 'frame', handler: VADEventHandler): void {
    if (event === 'frame') {
      this.handlers.add(handler);
    }
  }

  off(event: 'frame', handler: VADEventHandler): void {
    if (event === 'frame') {
      this.handlers.delete(handler);
    }
  }

  /**
   * processAudioFrame
   * Deterministic audio frame processor.
   * Can be called directly by unit tests with arbitrary RMS energy and timestamps.
   */
  public processAudioFrame(rms: number, now: number = performance.now()): VADFrame {
    let targetState: 'SILENCE' | 'SPEECH' = this.currentState;

    if (rms >= this.volumeThreshold) {
      // Potential speech detected
      this.silenceStartTime = null;
      
      if (this.currentState === 'SILENCE') {
        if (this.speechStartTime === null) {
          this.speechStartTime = now;
        } else if (now - this.speechStartTime >= this.minSpeechDuration) {
          targetState = 'SPEECH';
        }
      }
    } else {
      // Potential silence detected
      this.speechStartTime = null;
      
      if (this.currentState === 'SPEECH') {
        if (this.silenceStartTime === null) {
          this.silenceStartTime = now;
        } else if (now - this.silenceStartTime >= this.silenceDebounce) {
          targetState = 'SILENCE';
        }
      }
    }

    if (targetState !== this.currentState) {
      this.updateState(targetState, rms);
    }

    return {
      state: this.currentState,
      confidence: Math.min(1.0, rms / (this.volumeThreshold * 2)),
      timestamp: Date.now()
    };
  }

  private processAudio = () => {
    if (!this.isListening || !this.analyser) return;

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    // Calculate RMS amplitude approximation
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const normalized = dataArray[i] / 255;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / bufferLength);

    this.processAudioFrame(rms, performance.now());

    if (typeof requestAnimationFrame !== 'undefined') {
      this.animationFrameId = requestAnimationFrame(this.processAudio);
    }
  };

  private updateState(state: 'SILENCE' | 'SPEECH', confidence: number) {
    this.currentState = state;
    const frame: VADFrame = {
      state,
      confidence,
      timestamp: Date.now()
    };
    
    for (const handler of this.handlers) {
      try {
        handler(frame);
      } catch (err) {
        console.error('[VAD] Error in VAD frame handler:', err);
      }
    }
  }
}
