import type { STTProvider } from '../types.js';

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
  const SR =
    (window as unknown as Record<string, unknown>).SpeechRecognition ??
    (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  return (SR as SpeechRecognitionCtor) ?? null;
}

export class WebSpeechSTTProvider implements STTProvider {
  private recognition: SpeechRecognitionInstance | null = null;
  private isListening = false;
  private shouldRestart = false;
  private consecutiveErrors = 0;
  private restartTimeout: number | null = null;
  
  private onResultCb?: (interim: string, final: string) => void;
  private onErrorCb?: (error: string, fatal: boolean) => void;
  private onEndCb?: () => void;

  setCallbacks(
    onResult: (interim: string, final: string) => void,
    onError: (error: string, fatal: boolean) => void,
    onEnd: () => void
  ): void {
    this.onResultCb = onResult;
    this.onErrorCb = onError;
    this.onEndCb = onEnd;
  }

  start(): void {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.onErrorCb?.('Speech recognition not supported', true);
      return;
    }

    if (this.isListening) return;

    this.shouldRestart = true;
    this.consecutiveErrors = 0;
    this.initRecognition(Ctor);
  }

  stop(): void {
    this.shouldRestart = false;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.recognition) {
      this.recognition.stop();
    }
    this.isListening = false;
  }

  abort(): void {
    this.shouldRestart = false;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.recognition) {
      this.recognition.abort();
    }
    this.isListening = false;
  }

  private initRecognition(Ctor: SpeechRecognitionCtor) {
    if (this.recognition) {
      this.recognition.abort();
    }
    
    this.recognition = new Ctor();
    this.recognition.lang = 'en-US';
    this.recognition.interimResults = true;
    this.recognition.continuous = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.consecutiveErrors = 0;
    };

    this.recognition.onresult = (event: any) => {
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

      this.onResultCb?.(interim, final.trim());
    };

    this.recognition.onerror = (event: any) => {
      const err = event.error;
      const fatal = err === 'not-allowed' || err === 'service-not-allowed';
      
      this.onErrorCb?.(err, fatal);

      if (fatal) {
        this.shouldRestart = false;
      } else {
        this.consecutiveErrors++;
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      
      if (this.shouldRestart) {
        // Backoff to prevent tight loops on persistent errors (e.g., no-speech repeatedly)
        const delay = Math.min(1000 * Math.pow(2, this.consecutiveErrors), 5000);
        this.restartTimeout = window.setTimeout(() => {
          if (this.shouldRestart) {
            this.initRecognition(Ctor);
          }
        }, delay) as unknown as number;
      } else {
        this.onEndCb?.();
      }
    };

    try {
      this.recognition.start();
    } catch (err) {
      this.onErrorCb?.(String(err), true);
      this.shouldRestart = false;
    }
  }
}
