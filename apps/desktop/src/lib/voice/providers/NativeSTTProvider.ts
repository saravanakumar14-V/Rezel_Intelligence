import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { STTProvider } from '../types';
import { AudioSession } from '../AudioSession';

export interface NativeSTTConfig {
  language?: string;
  sampleRate?: number;
  modelId?: string;
}

export class NativeSTTProvider implements STTProvider {
  public isListening = false;
  private onResultCb?: (interim: string, final: string) => void;
  private onErrorCb?: (error: string, fatal: boolean) => void;
  private onEndCb?: () => void;
  private unlistenStt: UnlistenFn | null = null;
  private config: NativeSTTConfig;

  constructor(config?: NativeSTTConfig) {
    this.config = config ?? { language: 'en', sampleRate: 16000 };
  }

  public setCallbacks(
    onResult: (interim: string, final: string) => void,
    onError: (error: string, fatal: boolean) => void,
    onEnd: () => void
  ): void {
    this.onResultCb = onResult;
    this.onErrorCb = onError;
    this.onEndCb = onEnd;
  }

  public async start(): Promise<void> {
    if (this.isListening) return;
    this.isListening = true;

    // Start shared native audio session if not already running
    await AudioSession.startSession({ sampleRate: this.config.sampleRate ?? 16000, enableAec: true });

    if (typeof window !== 'undefined') {
      try {
        await invoke('native_stt_start');

        if (!this.unlistenStt) {
          this.unlistenStt = await listen<any>('audio://stt_transcript', (event) => {
            if (!this.isListening) return;
            const { transcript_type, transcript } = event.payload;
            if (transcript_type === 'final') {
              this.onResultCb?.('', transcript);
            } else {
              this.onResultCb?.(transcript, '');
            }
          });
        }
      } catch (err: any) {
        console.warn('[NativeSTT] Native start invoke failed:', err);
        this.onErrorCb?.(err?.message ?? 'Native STT initialization failed', false);
      }
    }
  }

  public stop(): void {
    this.isListening = false;
    if (typeof window !== 'undefined') {
      invoke('native_stt_stop').catch(() => {});
    }
    this.onEndCb?.();
  }

  public abort(): void {
    this.isListening = false;
    if (typeof window !== 'undefined') {
      invoke('native_stt_abort').catch(() => {});
    }
  }

  /**
   * feedTranscript
   * Deterministic method for testing and simulated transcription.
   */
  public feedTranscript(text: string, isFinal: boolean): void {
    if (!this.isListening) return;
    if (isFinal) {
      this.onResultCb?.('', text);
    } else {
      this.onResultCb?.(text, '');
    }
  }

  public dispose(): void {
    this.abort();
    if (this.unlistenStt) {
      this.unlistenStt();
      this.unlistenStt = null;
    }
  }
}
