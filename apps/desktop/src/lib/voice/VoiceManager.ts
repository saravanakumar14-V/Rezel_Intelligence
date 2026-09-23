import { RezelDirector, type DirectorEvent } from '../director/RezelDirector.js';
import type { VoiceState, VoiceEventHandler, VoiceEvent, STTProvider, TTSProvider, TTSProfile, VADProvider, VADFrame } from './types.js';
import { SentenceChunker } from './SentenceChunker.js';
import { VoiceMultimodalCoordinator } from './VoiceMultimodalCoordinator.js';

export class VoiceManager {
  private state: VoiceState = 'IDLE';
  private listeners = new Set<VoiceEventHandler>();
  
  private stt: STTProvider;
  private tts: TTSProvider;
  private vad: VADProvider | null;
  
  private chunker = new SentenceChunker();
  private ttsQueue: string[] = [];
  private isSpeakingQueue = false;
  
  private profile: TTSProfile;

  // Track the Director subscription so we can remove it on dispose
  private directorHandler: (e: DirectorEvent) => void;
  private vadHandler: ((frame: VADFrame) => void) | null = null;

  constructor(stt: STTProvider, tts: TTSProvider, vad?: VADProvider | null) {
    this.stt = stt;
    this.tts = tts;
    this.vad = vad ?? null;
    this.profile = this.extractProfile();

    this.directorHandler = this.handleDirectorEvent.bind(this);
    RezelDirector.subscribe(this.directorHandler);

    // Wire VAD if provided
    if (this.vad) {
      this.vadHandler = this.handleVADFrame.bind(this);
      this.vad.on('frame', this.vadHandler);
    }

    this.stt.setCallbacks(
      (interim, final) => {
        if (interim) {
          this.emit({ type: 'interim_transcript', transcript: interim });
        }
        if (final) {
          this.emit({ type: 'final_transcript', transcript: final });
          this.handleFinalTranscript(final);
        }
      },
      (error, fatal) => {
        this.emit({ type: 'error', error });
        if (fatal) {
          this.setState('ERROR');
        }
      },
      () => {
        if (this.state === 'LISTENING') {
          this.setState('IDLE');
        }
      }
    );
  }

  dispose() {
    RezelDirector.unsubscribe(this.directorHandler);
    if (this.vad && this.vadHandler) {
      this.vad.off('frame', this.vadHandler);
      this.vad.stop();
      this.vadHandler = null;
    }
    this.stt.abort();
    this.tts.cancel();
  }

  subscribe(handler: VoiceEventHandler) {
    this.listeners.add(handler);
    // Emit current state immediately
    handler({ type: 'state_change', state: this.state });
  }

  unsubscribe(handler: VoiceEventHandler) {
    this.listeners.delete(handler);
  }

  private emit(event: VoiceEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private setState(newState: VoiceState) {
    if (this.state !== newState) {
      this.state = newState;
      this.emit({ type: 'state_change', state: this.state });
    }
  }

  public getState(): VoiceState {
    return this.state;
  }

  // --- Public API ---

  startListening() {
    this.stt.start();
    this.vad?.start();
    this.tts.cancel();
    this.ttsQueue = [];
    this.chunker = new SentenceChunker();
    this.isSpeakingQueue = false;
    this.setState('LISTENING');
  }

  stopListening() {
    this.stt.stop();
    this.vad?.stop();
    this.setState('IDLE');
  }

  interruptSpeech() {
    this.ttsQueue = [];
    this.chunker = new SentenceChunker();
    this.tts.cancel();
    this.isSpeakingQueue = false;
    this.setState('INTERRUPTED');
  }

  cancelCurrentTurn() {
    this.interruptSpeech();
    this.stt.abort();
    RezelDirector.interrupt();
    this.setState('IDLE');
  }

  /**
   * triggerBargeIn
   * 
   * True barge-in flow:
   * 1. Cancel ongoing TTS immediately
   * 2. Clear queued TTS fragments and reset chunker
   * 3. Transition to INTERRUPTED state
   * 4. Call RezelDirector.interrupt() to abort LLM generation and any running workflow
   * 5. Transition to LISTENING state to receive new user utterance
   */
  public triggerBargeIn() {
    this.ttsQueue = [];
    this.chunker = new SentenceChunker();
    this.tts.cancel();
    this.isSpeakingQueue = false;
    this.setState('INTERRUPTED');
    RezelDirector.interrupt();
    this.setState('LISTENING');
    this.stt.start();
  }

  /** Expose VAD provider for testing/future use */
  getVADProvider(): VADProvider | null {
    return this.vad;
  }

  // --- VAD Frame Handler ---

  private handleVADFrame(frame: VADFrame) {
    this.emit({ type: 'vad_frame' as any, state: frame.state, confidence: frame.confidence } as any);

    // If Rezel is currently speaking and sustained user speech is detected -> Barge-in!
    if (frame.state === 'SPEECH' && this.state === 'SPEAKING') {
      this.triggerBargeIn();
    }
  }

  // --- Internal ---

  private extractProfile(): TTSProfile {
    const vp = RezelDirector.getExperienceProfile().voiceProfile;
    return {
      pace: vp.pace,
      pitch: vp.pitch,
      tone: vp.tone
    };
  }

  private handleFinalTranscript(transcript: string) {
    if (!transcript.trim()) return;
    this.setState('THINKING');
    this.stt.abort();
    VoiceMultimodalCoordinator.processVoiceIntent(transcript)
      .then((res) => {
        if (res.response) {
          this.ttsQueue.push(res.response);
          this.processTTSQueue();
        } else if (this.state === 'THINKING' && !this.isSpeakingQueue) {
          this.setState('IDLE');
        }
      })
      .catch((err) => {
        this.emit({ type: 'error', error: String(err) });
        this.setState('ERROR');
      });
  }

  private handleDirectorEvent(event: DirectorEvent) {
    switch (event.type) {
      case 'profile_changed':
        if (event.payload?.profile?.voiceProfile) {
          const vp = event.payload.profile.voiceProfile;
          this.profile = { pace: vp.pace, pitch: vp.pitch, tone: vp.tone };
        }
        break;

      case 'stream_start':
        this.chunker = new SentenceChunker();
        this.ttsQueue = [];
        this.isSpeakingQueue = false;
        break;

      case 'stream_text':
        if (event.payload?.text) {
          const sentences = this.chunker.push(event.payload.text);
          if (sentences.length > 0) {
            this.ttsQueue.push(...sentences);
            this.processTTSQueue();
          }
        }
        break;

      case 'stream_end':
        const finalSentences = this.chunker.flush();
        if (finalSentences.length > 0) {
          this.ttsQueue.push(...finalSentences);
          this.processTTSQueue();
        }
        break;

      case 'error':
        this.setState('ERROR');
        break;
        
      case 'turn_completed':
        // Only return to IDLE if we aren't still speaking
        if (this.state === 'THINKING' && !this.isSpeakingQueue) {
          this.setState('IDLE');
        }
        break;
    }
  }

  private processTTSQueue() {
    if (this.isSpeakingQueue) return;
    if (this.ttsQueue.length === 0) {
      // Done speaking
      if (this.state === 'SPEAKING') {
        this.setState('IDLE');
      }
      return;
    }

    this.isSpeakingQueue = true;
    const text = this.ttsQueue.shift()!;
    this.setState('SPEAKING');

    this.tts.speak(
      text,
      this.profile,
      () => {
        // onStart
      },
      () => {
        // onEnd
        this.isSpeakingQueue = false;
        this.processTTSQueue();
      },
      (err) => {
        // onError
        this.emit({ type: 'error', error: err });
        this.isSpeakingQueue = false;
        this.setState('ERROR');
      }
    );
  }
}
