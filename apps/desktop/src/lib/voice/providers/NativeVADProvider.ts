import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { VADProvider, VADEventHandler, VADFrame } from '../types';
import { AudioSession } from '../AudioSession';

export interface NativeVADConfig {
  threshold?: number;
  minSpeechDuration?: number;
  silenceDebounce?: number;
}

export class NativeVADProvider implements VADProvider {
  private handlers = new Set<VADEventHandler>();
  private isListening = false;
  private currentState: 'SILENCE' | 'SPEECH' = 'SILENCE';
  private unlistenVad: UnlistenFn | null = null;

  // Local fallback/deterministic processing state
  private threshold = 0.05;
  private minSpeechDuration = 200;
  private silenceDebounce = 1000;
  private speechStartTime: number | null = null;
  private silenceStartTime: number | null = null;

  constructor(config?: NativeVADConfig) {
    if (config?.threshold !== undefined) this.threshold = config.threshold;
    if (config?.minSpeechDuration !== undefined) this.minSpeechDuration = config.minSpeechDuration;
    if (config?.silenceDebounce !== undefined) this.silenceDebounce = config.silenceDebounce;
  }

  public async start(): Promise<void> {
    if (this.isListening) return;
    this.isListening = true;
    this.currentState = 'SILENCE';
    this.speechStartTime = null;
    this.silenceStartTime = null;

    // Start shared native audio session if not already running
    await AudioSession.startSession({ enableAec: true });

    if (typeof window !== 'undefined') {
      try {
        await invoke('native_vad_set_config', {
          config: {
            threshold: this.threshold,
            min_speech_duration_ms: this.minSpeechDuration,
            silence_debounce_ms: this.silenceDebounce,
          },
        });

        this.unlistenVad = await listen<any>('audio://vad_frame', (event) => {
          if (!this.isListening) return;
          const frame: VADFrame = {
            state: event.payload.state === 'SPEECH' ? 'SPEECH' : 'SILENCE',
            confidence: event.payload.confidence,
            timestamp: event.payload.timestamp,
          };
          this.currentState = frame.state;
          this.emitFrame(frame);
        });
      } catch (err) {
        console.warn('[NativeVAD] Native event subscription failed, operating in fallback mode:', err);
      }
    }
  }

  public stop(): void {
    this.isListening = false;
    if (this.unlistenVad) {
      this.unlistenVad();
      this.unlistenVad = null;
    }
    if (this.currentState !== 'SILENCE') {
      this.currentState = 'SILENCE';
      this.emitFrame({
        state: 'SILENCE',
        confidence: 0,
        timestamp: Date.now(),
      });
    }
  }

  public on(event: 'frame', handler: VADEventHandler): void {
    if (event === 'frame') {
      this.handlers.add(handler);
    }
  }

  public off(event: 'frame', handler: VADEventHandler): void {
    if (event === 'frame') {
      this.handlers.delete(handler);
    }
  }

  public getState(): 'SILENCE' | 'SPEECH' {
    return this.currentState;
  }

  /**
   * processAudioFrame
   * Deterministic frame processing method for unit testing & offline execution.
   */
  public processAudioFrame(rms: number, now: number = performance.now()): VADFrame {
    let targetState: 'SILENCE' | 'SPEECH' = this.currentState;

    if (rms >= this.threshold) {
      this.silenceStartTime = null;
      if (this.currentState === 'SILENCE') {
        if (this.speechStartTime === null) {
          this.speechStartTime = now;
        } else if (now - this.speechStartTime >= this.minSpeechDuration) {
          targetState = 'SPEECH';
        }
      }
    } else {
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
      this.currentState = targetState;
      const frame: VADFrame = {
        state: targetState,
        confidence: Math.min(1.0, rms / (this.threshold * 2)),
        timestamp: Date.now(),
      };
      this.emitFrame(frame);
    }

    return {
      state: this.currentState,
      confidence: Math.min(1.0, rms / (this.threshold * 2)),
      timestamp: Date.now(),
    };
  }

  private emitFrame(frame: VADFrame) {
    for (const handler of this.handlers) {
      try {
        handler(frame);
      } catch (err) {
        console.error('[NativeVAD] Handler error:', err);
      }
    }
  }
}
