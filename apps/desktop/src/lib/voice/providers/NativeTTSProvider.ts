import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { TTSProvider, TTSProfile } from '../types';

export class NativeTTSProvider implements TTSProvider {
  private activeUtteranceId: string | null = null;
  private onEndCallbacks = new Map<string, () => void>();
  private onErrorCallbacks = new Map<string, (err: string) => void>();
  private unlistenTts: UnlistenFn | null = null;
  private isInitialized = false;

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    if (typeof window !== 'undefined') {
      try {
        this.unlistenTts = await listen<any>('audio://tts_event', (event) => {
          const { utterance_id, event_type, error } = event.payload;
          if (event_type === 'end') {
            const cb = this.onEndCallbacks.get(utterance_id);
            if (cb) {
              this.onEndCallbacks.delete(utterance_id);
              this.onErrorCallbacks.delete(utterance_id);
              cb();
            }
          } else if (event_type === 'error') {
            const cb = this.onErrorCallbacks.get(utterance_id);
            if (cb) {
              this.onEndCallbacks.delete(utterance_id);
              this.onErrorCallbacks.delete(utterance_id);
              cb(error ?? 'Native TTS error');
            }
          }
        });
        this.isInitialized = true;
      } catch (err) {
        console.warn('[NativeTTS] Failed to subscribe to tts events:', err);
      }
    }
  }

  public speak(
    text: string,
    profile: TTSProfile,
    onStart: () => void,
    onEnd: () => void,
    onError: (err: string) => void
  ): void {
    const utteranceId = `native_utt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.activeUtteranceId = utteranceId;
    this.onEndCallbacks.set(utteranceId, onEnd);
    this.onErrorCallbacks.set(utteranceId, onError);

    onStart();

    if (typeof window !== 'undefined') {
      this.init().then(() => {
        invoke('native_tts_speak', {
          request: {
            utterance_id: utteranceId,
            text,
            pace: profile.pace,
            pitch: profile.pitch,
            tone: profile.tone,
            voice_id: profile.voiceId ?? null,
          },
        }).catch((err) => {
          console.warn('[NativeTTS] speak invoke failed, falling back to instant end:', err);
          const endCb = this.onEndCallbacks.get(utteranceId);
          if (endCb) {
            this.onEndCallbacks.delete(utteranceId);
            this.onErrorCallbacks.delete(utteranceId);
            endCb();
          }
        });
      });
    } else {
      // In headless test environments without Tauri IPC
      setTimeout(() => {
        const endCb = this.onEndCallbacks.get(utteranceId);
        if (endCb) {
          this.onEndCallbacks.delete(utteranceId);
          this.onErrorCallbacks.delete(utteranceId);
          endCb();
        }
      }, 10);
    }
  }

  public cancel(): void {
    const id = this.activeUtteranceId;
    this.activeUtteranceId = null;

    if (id) {
      const cb = this.onEndCallbacks.get(id);
      this.onEndCallbacks.delete(id);
      this.onErrorCallbacks.delete(id);
      if (cb) cb();
    }

    if (typeof window !== 'undefined') {
      invoke('native_tts_cancel', { utterance_id: id }).catch(() => {});
    }
  }

  public dispose(): void {
    if (this.unlistenTts) {
      this.unlistenTts();
      this.unlistenTts = null;
    }
    this.onEndCallbacks.clear();
    this.onErrorCallbacks.clear();
    this.isInitialized = false;
  }
}
