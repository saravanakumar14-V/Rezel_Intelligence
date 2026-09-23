import { createContext, useContext } from 'react';
import type { VoiceManager } from '../lib/voice/VoiceManager';

export interface VoiceContextType {
  manager: VoiceManager;
}

export const VoiceContext = createContext<VoiceContextType | null>(null);

export function useVoiceManager(): VoiceManager {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoiceManager must be used within VoiceProvider');
  return ctx.manager;
}
