import React, { useEffect, useState } from 'react';
import { VoiceManager } from '../lib/voice/VoiceManager';
import { WebSpeechSTTProvider } from '../lib/voice/providers/WebSpeechSTTProvider';
import { WebSpeechTTSProvider } from '../lib/voice/providers/WebSpeechTTSProvider';
import { WebAudioVADProvider } from '../lib/voice/providers/WebAudioVADProvider';
import type { STTProvider, TTSProvider, VADProvider } from '../lib/voice/types';
import { VoiceContext } from './VoiceContext';

export { useVoiceManager } from './VoiceContext';

interface VoiceProviderProps {
  children: React.ReactNode;
  sttProvider?: STTProvider;
  ttsProvider?: TTSProvider;
  vadProvider?: VADProvider;
}

export function VoiceProvider({ children, sttProvider, ttsProvider, vadProvider }: VoiceProviderProps) {
  const [manager] = useState(() => {
    const stt = sttProvider ?? new WebSpeechSTTProvider();
    const tts = ttsProvider ?? new WebSpeechTTSProvider();
    const vad = vadProvider ?? new WebAudioVADProvider();
    return new VoiceManager(stt, tts, vad);
  });

  useEffect(() => {
    return () => {
      manager.dispose();
    };
  }, [manager]);

  return (
    <VoiceContext.Provider value={{ manager }}>
      {children}
    </VoiceContext.Provider>
  );
}
