/**
 * useVoice
 *
 * React hook for the Rezel voice engine.
 *
 * Features:
 *  - Speech-to-Text (STT) via Web Speech API SpeechRecognition
 *  - Text-to-Speech (TTS) via Web Speech API SpeechSynthesis
 *  - Voice state management mapped to CommandOrb states
 *  - Proper lifecycle: start, stop, cancel, cleanup on unmount
 *  - Error handling and browser capability detection
 *
 * Voice flow:
 *  1. User clicks CommandOrb → startListening()
 *  2. STT captures speech → onResult callback fires with transcript
 *  3. Caller sends transcript to AgentCore.send()
 *  4. AgentCore streams response → caller calls speak(responseText)
 *  5. TTS reads the response aloud → state returns to 'idle'
 *
 * Browser support:
 *  - SpeechRecognition: Chrome, Edge (webkit-prefixed)
 *  - SpeechSynthesis: Chrome, Edge, Firefox, Safari
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { OrbState } from '../components/hud/CommandOrb';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UseVoiceOptions {
  /** Language for STT recognition (BCP-47). Default: 'en-US'. */
  lang?: string;
  /** Called when STT produces a final transcript. */
  onResult?: (transcript: string) => void;
  /** Called when TTS finishes speaking. */
  onSpeakEnd?: () => void;
  /** Called on any voice engine error. */
  onError?: (error: string) => void;
}

interface UseVoiceReturn {
  /** Current voice state for CommandOrb. */
  voiceState: OrbState;
  /** True if the browser supports SpeechRecognition. */
  sttSupported: boolean;
  /** True if the browser supports SpeechSynthesis. */
  ttsSupported: boolean;
  /** Start listening for speech input. */
  startListening: () => void;
  /** Stop listening gracefully (waits for final result). */
  stopListening: () => void;
  /** Speak text aloud via TTS. */
  speak: (text: string) => void;
  /** Cancel all active voice activity (STT + TTS). */
  cancel: () => void;
  /** The latest interim transcript while listening. */
  interimTranscript: string;
  /** True if currently listening for speech. */
  isListening: boolean;
  /** True if currently speaking via TTS. */
  isSpeaking: boolean;
}

// ─── Browser API detection ────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onstart: ((this: any, ev: any) => void) | null;
  onresult: ((this: any, ev: any) => void) | null;
  onerror: ((this: any, ev: any) => void) | null;
  onend: ((this: any, ev: any) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  // Standard + webkit-prefixed (Chrome/Edge)
  const SR =
    (window as unknown as Record<string, unknown>).SpeechRecognition ??
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  return (SR as SpeechRecognitionCtor) ?? null;
}

function isTTSSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useVoice(options: UseVoiceOptions = {}): UseVoiceReturn {
  const {
    lang = 'en-US',
    onResult,
    onSpeakEnd,
    onError,
  } = options;

  const [voiceState, setVoiceState] = useState<OrbState>('idle');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Stable refs for callbacks to avoid recreating recognition instance
  const onResultRef = useRef(onResult);
  const onSpeakEndRef = useRef(onSpeakEnd);
  const onErrorRef = useRef(onError);
  onResultRef.current = onResult;
  onSpeakEndRef.current = onSpeakEnd;
  onErrorRef.current = onError;

  const SRCtor = getSpeechRecognitionCtor();
  const sttSupported = SRCtor !== null;
  const ttsSupported = isTTSSupported();

  // ── STT: Start listening ────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (!SRCtor) {
      onErrorRef.current?.('Speech recognition is not supported in this browser.');
      return;
    }

    // Cancel any active TTS
    if (ttsSupported) {
      window.speechSynthesis.cancel();
    }

    // Tear down previous instance
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }

    const recognition = new SRCtor();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setIsSpeaking(false);
      setVoiceState('listening');
      setInterimTranscript('');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (interim) setInterimTranscript(interim);

      if (final) {
        setInterimTranscript('');
        onResultRef.current?.(final.trim());
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' and 'aborted' are non-fatal — just return to idle
      if (event.error === 'no-speech' || event.error === 'aborted') {
        setVoiceState('idle');
        setIsListening(false);
        return;
      }
      onErrorRef.current?.(`Speech recognition error: ${event.error}`);
      setVoiceState('idle');
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      // Only return to idle if we're not transitioning to thinking/speaking
      setVoiceState((prev) => (prev === 'listening' ? 'idle' : prev));
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [SRCtor, lang, ttsSupported]);

  // ── STT: Stop listening ─────────────────────────────────────────────────

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop(); // Triggers onend + final result
    }
  }, []);

  // ── TTS: Speak text ─────────────────────────────────────────────────────

  const speak = useCallback((text: string) => {
    if (!ttsSupported || !text.trim()) return;

    // Cancel any active STT + TTS
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setIsListening(false);
      setVoiceState('speaking');
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setVoiceState('idle');
      synthRef.current = null;
      onSpeakEndRef.current?.();
    };

    utterance.onerror = (event) => {
      // 'interrupted' and 'canceled' are expected when user cancels
      if (event.error === 'interrupted' || event.error === 'canceled') {
        setIsSpeaking(false);
        setVoiceState('idle');
        synthRef.current = null;
        return;
      }
      onErrorRef.current?.(`TTS error: ${event.error}`);
      setIsSpeaking(false);
      setVoiceState('idle');
      synthRef.current = null;
    };

    synthRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [lang, ttsSupported]);

  // ── Cancel all ──────────────────────────────────────────────────────────

  const cancel = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.abort();
      recognitionRef.current = null;
    }
    if (ttsSupported) {
      window.speechSynthesis.cancel();
    }
    synthRef.current = null;
    setIsListening(false);
    setIsSpeaking(false);
    setVoiceState('idle');
    setInterimTranscript('');
  }, [ttsSupported]);

  // ── Cleanup on unmount ──────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return {
    voiceState,
    sttSupported,
    ttsSupported,
    startListening,
    stopListening,
    speak,
    cancel,
    interimTranscript,
    isListening,
    isSpeaking,
  };
}
