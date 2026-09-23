import './mock_tauri_core.js';
function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}
import { VoiceManager } from './src/lib/voice/VoiceManager.js';
import type { STTProvider, TTSProvider, TTSProfile, VoiceState, VoiceEventHandler } from './src/lib/voice/types.js';
import { SentenceChunker } from './src/lib/voice/SentenceChunker.js';
import { RezelDirector } from './src/lib/director/RezelDirector.js';

// --- Mocks ---

class MockSTT implements STTProvider {
  public isListening = false;
  public onResultCb?: (interim: string, final: string) => void;
  public onErrorCb?: (error: string, fatal: boolean) => void;
  public onEndCb?: () => void;

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
    this.isListening = true;
  }

  stop(): void {
    this.isListening = false;
    this.onEndCb?.();
  }

  abort(): void {
    this.isListening = false;
  }
}

class MockTTS implements TTSProvider {
  public spokenTexts: string[] = [];
  public activeText: string | null = null;
  public onEndCb: (() => void) | null = null;
  public profileUsed: TTSProfile | null = null;

  speak(text: string, profile: TTSProfile, onStart: () => void, onEnd: () => void, onError: (err: string) => void): void {
    this.spokenTexts.push(text);
    this.activeText = text;
    this.onEndCb = onEnd;
    this.profileUsed = profile;
    onStart();
  }

  cancel(): void {
    this.activeText = null;
    if (this.onEndCb) {
      this.onEndCb();
      this.onEndCb = null;
    }
  }

  finishCurrent() {
    if (this.onEndCb) {
      const cb = this.onEndCb;
      this.onEndCb = null;
      this.activeText = null;
      cb();
    }
  }
}

// --- Tests ---

async function runTests() {
  console.log('--- RUNNING MILESTONE 10.6 B TESTS ---');

  const stt = new MockSTT();
  const tts = new MockTTS();
  const manager = new VoiceManager(stt, tts);

  let currentState: VoiceState = 'IDLE';
  const listener: VoiceEventHandler = (e) => {
    if (e.type === 'state_change' && e.state) {
      currentState = e.state;
    }
  };
  manager.subscribe(listener);

  // A. Initial state
  assert(currentState === 'IDLE', 'Initial state should be IDLE');

  // B. Start listening
  manager.startListening();
  assert(stt.isListening === true, 'STT should be listening');
  assert(currentState === 'LISTENING', 'State should be LISTENING');

  // C & D. Transcript routing
  let directorReceived = '';
  // Mock Director send
  const originalSend = RezelDirector.send;
  (RezelDirector as any).send = async (text: string) => {
    directorReceived = text;
    return Promise.resolve();
  };

  stt.onResultCb?.('hello', ''); // interim
  assert(directorReceived === '', 'Interim transcript should not reach Director');
  
  stt.onResultCb?.('', 'hello world'); // final
  assert(directorReceived === 'hello world', 'Final transcript should reach Director');
  assert(currentState === 'THINKING', 'State should change to THINKING after final');
  assert(stt.isListening === false, 'STT should abort on final transcript to wait for processing');

  // Restore send
  RezelDirector.send = originalSend;

  // I. Sentence chunking
  const chunker = new SentenceChunker();
  assert(chunker.push('Hello ').length === 0, 'No sentence yet');
  assert(chunker.push('world.').join('') === 'Hello world.', 'Should chunk on period');
  assert(chunker.push(' Mr. Smith is ').length === 0, 'Should ignore Mr. abbreviation');
  assert(chunker.push('here!').join('') === 'Mr. Smith is here!', 'Should finish sentence');
  assert(chunker.push(' Pi is 3.14').length === 0, 'Should handle decimals');
  assert(chunker.flush().join('') === 'Pi is 3.14', 'Flush should yield remainder');

  // J & K. Incremental TTS and stream_end flush
  // Emit stream events from director
  const directorSubscribers = (RezelDirector as any).listeners as Set<any>;
  const emitDirector = (event: any) => {
    for (const sub of directorSubscribers) sub(event);
  };

  emitDirector({ type: 'stream_start' });
  emitDirector({ type: 'stream_text', payload: { text: 'This is the first. And the ' } });
  
  // The manager should have picked up the first sentence
  assert(tts.activeText === 'This is the first.', 'Should speak first sentence immediately');
  assert(currentState === 'SPEAKING', 'State should be SPEAKING');
  
  // Finish speaking first sentence
  tts.finishCurrent();
  
  // Queue should be empty, still speaking nothing, state SPEAKING because we might get more stream
  // Wait, if queue is empty, state goes to IDLE
  assert(currentState === 'IDLE', 'State goes to IDLE when queue drains (if stream not sending anything)');

  emitDirector({ type: 'stream_text', payload: { text: 'second.' } });
  assert(tts.activeText === 'And the second.', 'Should speak second sentence');
  assert(currentState === 'SPEAKING', 'State should be SPEAKING again');
  tts.finishCurrent();

  emitDirector({ type: 'stream_end' }); // Nothing left to flush

  // M & N. Mode-specific voice profile
  emitDirector({
    type: 'profile_changed',
    payload: {
      profile: {
        id: 'CREATOR',
        voiceProfile: { pace: 1.2, pitch: 1.5, tone: 'energetic' }
      }
    }
  });

  emitDirector({ type: 'stream_start' });
  emitDirector({ type: 'stream_text', payload: { text: 'Testing.' } });
  
  assert(tts.profileUsed?.pace === 1.2, 'Pace should update');
  assert(tts.profileUsed?.pitch === 1.5, 'Pitch should update');

  // O. Interrupt speech
  manager.interruptSpeech();
  assert(tts.activeText === null, 'TTS should be cancelled');
  assert(currentState === 'INTERRUPTED', 'State should be INTERRUPTED');

  // P. Cancel current turn -> Director
  let interruptCalled = false;
  const originalInterrupt = RezelDirector.interrupt;
  (RezelDirector as any).interrupt = () => { interruptCalled = true; };

  manager.cancelCurrentTurn();
  assert(interruptCalled, 'cancelCurrentTurn should call Director.interrupt');
  assert(currentState === 'IDLE', 'State should return to IDLE');

  RezelDirector.interrupt = originalInterrupt;

  manager.dispose();

  console.log('ALL TESTS PASSED!');
}

runTests().catch(console.error);
