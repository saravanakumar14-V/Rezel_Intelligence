import { useState, useEffect, useCallback } from 'react';
import type { OrbState } from '../components/hud/CommandOrb';
import { useVoiceManager } from '../providers/VoiceContext';
import type { VoiceState } from '../lib/voice/types';

interface UseVoiceReturn {
  voiceState: OrbState;
  startListening: () => void;
  stopListening: () => void;
  cancel: () => void;
  interimTranscript: string;
  isListening: boolean;
  isSpeaking: boolean;
}

function mapVoiceState(state: VoiceState): OrbState {
  switch (state) {
    case 'LISTENING':
      return 'listening';
    case 'SPEAKING':
      return 'speaking';
    case 'THINKING':
      return 'thinking';
    case 'INTERRUPTED':
      return 'interrupted';
    case 'IDLE':
    case 'ERROR':
    default:
      return 'idle';
  }
}

export function useVoice(): UseVoiceReturn {
  const manager = useVoiceManager();
  
  const [voiceState, setVoiceState] = useState<OrbState>(mapVoiceState(manager.getState()));
  const [interimTranscript, setInterimTranscript] = useState('');
  
  useEffect(() => {
    const handler = (event: any) => {
      if (event.type === 'state_change') {
        setVoiceState(mapVoiceState(event.state));
        if (event.state !== 'LISTENING') {
          setInterimTranscript('');
        }
      } else if (event.type === 'interim_transcript') {
        setInterimTranscript(event.transcript);
      }
    };
    
    manager.subscribe(handler);
    return () => manager.unsubscribe(handler);
  }, [manager]);

  const startListening = useCallback(() => {
    manager.startListening();
  }, [manager]);

  const stopListening = useCallback(() => {
    manager.stopListening();
  }, [manager]);

  const cancel = useCallback(() => {
    manager.cancelCurrentTurn();
  }, [manager]);

  return {
    voiceState,
    startListening,
    stopListening,
    cancel,
    interimTranscript,
    isListening: voiceState === 'listening',
    isSpeaking: voiceState === 'speaking',
  };
}
