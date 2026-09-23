import type { STTProvider, TTSProvider, VADProvider, VoiceProviderMode } from './types';
import { WebSpeechSTTProvider } from './providers/WebSpeechSTTProvider';
import { WebSpeechTTSProvider } from './providers/WebSpeechTTSProvider';
import { WebAudioVADProvider } from './providers/WebAudioVADProvider';
import { NativeSTTProvider } from './providers/NativeSTTProvider';
import { NativeTTSProvider } from './providers/NativeTTSProvider';
import { NativeVADProvider } from './providers/NativeVADProvider';
import { AudioSession } from './AudioSession';
import { LocalMemory } from '../memory/LocalMemory';

export interface ResolvedProviders {
  mode: VoiceProviderMode;
  resolvedBackend: 'NATIVE' | 'BROWSER';
  stt: STTProvider;
  tts: TTSProvider;
  vad: VADProvider;
}

const PREF_KEY = 'voice_provider_mode';

export class ProviderResolver {
  public static getSavedMode(): VoiceProviderMode {
    try {
      const entry = LocalMemory.getEntry(PREF_KEY);
      const saved = entry?.value;
      if (saved === 'NATIVE' || saved === 'BROWSER' || saved === 'AUTO') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'AUTO';
  }

  public static setSavedMode(mode: VoiceProviderMode): void {
    try {
      LocalMemory.setEntry(PREF_KEY, mode, 'preference');
    } catch {
      // ignore
    }
  }

  public static async resolve(requestedMode?: VoiceProviderMode): Promise<ResolvedProviders> {
    const mode = requestedMode ?? ProviderResolver.getSavedMode();

    if (mode === 'BROWSER') {
      return {
        mode: 'BROWSER',
        resolvedBackend: 'BROWSER',
        stt: new WebSpeechSTTProvider(),
        tts: new WebSpeechTTSProvider(),
        vad: new WebAudioVADProvider(),
      };
    }

    if (mode === 'NATIVE') {
      const isNativeAvailable = await AudioSession.isAvailable();
      if (!isNativeAvailable) {
        throw new Error('Native audio provider requested but native audio backend is unavailable');
      }
      return {
        mode: 'NATIVE',
        resolvedBackend: 'NATIVE',
        stt: new NativeSTTProvider(),
        tts: new NativeTTSProvider(),
        vad: new NativeVADProvider(),
      };
    }

    // AUTO mode:
    try {
      const isNativeAvailable = await AudioSession.isAvailable();
      if (isNativeAvailable) {
        return {
          mode: 'AUTO',
          resolvedBackend: 'NATIVE',
          stt: new NativeSTTProvider(),
          tts: new NativeTTSProvider(),
          vad: new NativeVADProvider(),
        };
      }
    } catch (err) {
      console.warn('[ProviderResolver] Failed checking native audio availability in AUTO mode:', err);
    }

    // Fallback to browser providers in AUTO mode
    return {
      mode: 'AUTO',
      resolvedBackend: 'BROWSER',
      stt: new WebSpeechSTTProvider(),
      tts: new WebSpeechTTSProvider(),
      vad: new WebAudioVADProvider(),
    };
  }
}
