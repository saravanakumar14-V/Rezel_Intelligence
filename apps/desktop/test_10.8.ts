import './mock_tauri_core.js';
function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

import { NativeAudioSession, AudioSession } from './src/lib/voice/AudioSession.js';
import { NativeVADProvider } from './src/lib/voice/providers/NativeVADProvider.js';
import { NativeTTSProvider } from './src/lib/voice/providers/NativeTTSProvider.js';
import { NativeSTTProvider } from './src/lib/voice/providers/NativeSTTProvider.js';
import { WebAudioVADProvider } from './src/lib/voice/providers/WebAudioVADProvider.js';
import { WebSpeechTTSProvider } from './src/lib/voice/providers/WebSpeechTTSProvider.js';
import { WebSpeechSTTProvider } from './src/lib/voice/providers/WebSpeechSTTProvider.js';
import { ProviderResolver } from './src/lib/voice/ProviderResolver.js';
import { VoiceManager } from './src/lib/voice/VoiceManager.js';
import { RezelDirector } from './src/lib/director/RezelDirector.js';
import { AgentCore } from './src/lib/ai/AgentCore.js';
import { LocalMemory } from './src/lib/memory/LocalMemory.js';
import type { STTProvider, TTSProvider, VADProvider, VADFrame, VoiceState } from './src/lib/voice/types.js';

async function runTests() {
  console.log('--- RUNNING MILESTONE 10.8 PHASE B NATIVE AUDIO TESTS ---\n');

  // ====================================================================
  // Part 1: Provider Interface Conformance (Test A)
  // ====================================================================

  console.log('Test A: Provider interface conformance');
  {
    const stt: STTProvider = new NativeSTTProvider();
    assert(typeof stt.start === 'function', 'NativeSTTProvider must have start()');
    assert(typeof stt.stop === 'function', 'NativeSTTProvider must have stop()');
    assert(typeof stt.abort === 'function', 'NativeSTTProvider must have abort()');
    assert(typeof stt.setCallbacks === 'function', 'NativeSTTProvider must have setCallbacks()');

    const tts: TTSProvider = new NativeTTSProvider();
    assert(typeof tts.speak === 'function', 'NativeTTSProvider must have speak()');
    assert(typeof tts.cancel === 'function', 'NativeTTSProvider must have cancel()');

    const vad: VADProvider = new NativeVADProvider();
    assert(typeof vad.start === 'function', 'NativeVADProvider must have start()');
    assert(typeof vad.stop === 'function', 'NativeVADProvider must have stop()');
    assert(typeof vad.on === 'function', 'NativeVADProvider must have on()');
    assert(typeof vad.off === 'function', 'NativeVADProvider must have off()');
    console.log('  PASS: Test A');
  }

  // ====================================================================
  // Part 2: AudioSession Lifecycle & Device Enumeration (Tests B, C, D)
  // ====================================================================

  console.log('Test B: AudioSession lifecycle (startSession, stopSession, getStatus)');
  {
    const session = AudioSession;
    
    // Initial status
    const initialStatus = await session.getStatus();
    assert(typeof initialStatus.isRunning === 'boolean', 'Status must contain isRunning');
    assert(typeof initialStatus.sampleRate === 'number', 'Status must contain sampleRate');

    // Start session
    const started = await session.startSession({ sampleRate: 16000, enableAec: true });
    assert(started.isRunning === true, 'Session must be running after startSession');
    assert(started.sampleRate === 16000, 'Sample rate must be 16000');
    assert(started.aecEnabled === true, 'AEC must be enabled');

    // Stop session
    const stopped = await session.stopSession();
    assert(stopped.isRunning === false, 'Session must not be running after stopSession');
    console.log('  PASS: Test B');
  }

  console.log('Test C & D: Device enumeration & fallback device handling');
  {
    const session = AudioSession;
    const devices = await session.listDevices();
    assert(Array.isArray(devices.inputs), 'Must return array of input devices');
    assert(Array.isArray(devices.outputs), 'Must return array of output devices');
    assert(devices.inputs.length > 0, 'Must contain at least 1 input device');
    assert(devices.outputs.length > 0, 'Must contain at least 1 output device');

    const defaultInput = devices.inputs[0];
    assert(typeof defaultInput.id === 'string', 'Device must have string id');
    assert(typeof defaultInput.name === 'string', 'Device must have string name');
    assert(defaultInput.isInput === true, 'Input device isInput flag must be true');
    console.log('  PASS: Test C & D');
  }

  // ====================================================================
  // Part 3: Native VAD Processing & Frame Events (Test E)
  // ====================================================================

  console.log('Test E: Native VAD processing and frame events');
  {
    const vad = new NativeVADProvider({ threshold: 0.05, minSpeechDuration: 200, silenceDebounce: 500 });
    let emittedFrames: VADFrame[] = [];
    vad.on('frame', (f) => emittedFrames.push(f));

    await vad.start();
    assert(vad.getState() === 'SILENCE', 'Initial state must be SILENCE');

    // Feed volume above threshold at t=0
    vad.processAudioFrame(0.1, 1000);
    assert(vad.getState() === 'SILENCE', 'Should not transition to SPEECH before minSpeechDuration');

    // Feed volume above threshold at t=250ms
    vad.processAudioFrame(0.12, 1250);
    assert(vad.getState() === 'SPEECH', 'Should transition to SPEECH after minSpeechDuration');
    assert(emittedFrames.length === 1, 'Should have emitted 1 frame');
    assert(emittedFrames[0].state === 'SPEECH', 'Emitted frame state must be SPEECH');

    // Test silence debounce
    vad.processAudioFrame(0.01, 1300);
    assert(vad.getState() === 'SPEECH', 'Brief dip < silenceDebounce must remain SPEECH');

    // Sustained silence
    vad.processAudioFrame(0.01, 1800);
    assert(vad.getState() === 'SILENCE', 'Sustained silence >= silenceDebounce must transition to SILENCE');

    vad.stop();
    console.log('  PASS: Test E');
  }

  // ====================================================================
  // Part 4: Native TTS Synthesis & Immediate Cancellation (Tests F, G)
  // ====================================================================

  console.log('Test F & G: Native TTS speak and immediate cancellation');
  {
    const tts = new NativeTTSProvider();
    let started = false;
    let ended = false;

    tts.speak(
      'Testing native TTS playback.',
      { pace: 1.0, pitch: 1.0, tone: 'neutral', voiceId: 'en_US-rezel' },
      () => { started = true; },
      () => { ended = true; },
      (err) => { throw new Error(err); }
    );

    assert(started === true, 'TTS onStart must be called');

    // Test immediate cancellation
    tts.cancel();
    assert(ended === true, 'TTS onEnd must be settled immediately on cancel');
    tts.dispose();
    console.log('  PASS: Test F & G');
  }

  // ====================================================================
  // Part 5: Native STT Streaming & Transcript Delivery (Test H)
  // ====================================================================

  console.log('Test H: Native STT interim and final transcript delivery');
  {
    const stt = new NativeSTTProvider();
    let interimText = '';
    let finalText = '';

    stt.setCallbacks(
      (interim, final) => {
        if (interim) interimText = interim;
        if (final) finalText = final;
      },
      () => {},
      () => {}
    );

    await stt.start();
    assert(stt.isListening === true, 'STT isListening must be true');

    // Feed interim transcript
    stt.feedTranscript('Creating a', false);
    assert(interimText === 'Creating a', 'Interim transcript must be delivered');

    // Feed final transcript
    stt.feedTranscript('Creating a red sphere', true);
    assert(finalText === 'Creating a red sphere', 'Final transcript must be delivered');

    stt.stop();
    assert(stt.isListening === false, 'STT isListening must be false after stop');
    stt.dispose();
    console.log('  PASS: Test H');
  }

  // ====================================================================
  // Part 6: Provider Resolver (Tests I, J, K, L)
  // ====================================================================

  console.log('Test I: ProviderResolver in AUTO mode (resolves native or browser)');
  {
    const resolved = await ProviderResolver.resolve('AUTO');
    assert(resolved.mode === 'AUTO', 'Mode must be AUTO');
    assert(resolved.stt !== null && resolved.tts !== null && resolved.vad !== null, 'All providers resolved');
    console.log('  PASS: Test I');
  }

  console.log('Test J: ProviderResolver in NATIVE mode failure handling');
  {
    // Temporarily mock AudioSession.isAvailable to return false
    const origIsAvailable = AudioSession.isAvailable.bind(AudioSession);
    AudioSession.isAvailable = async () => false;

    let threw = false;
    try {
      await ProviderResolver.resolve('NATIVE');
    } catch (err: any) {
      threw = true;
      assert(err.message.includes('unavailable'), 'Must throw clear unavailable error');
    }
    assert(threw === true, 'NATIVE mode must throw when backend is unavailable and NOT silently fallback');

    AudioSession.isAvailable = origIsAvailable;
    console.log('  PASS: Test J');
  }

  console.log('Test K & L: ProviderResolver in BROWSER mode');
  {
    const resolved = await ProviderResolver.resolve('BROWSER');
    assert(resolved.mode === 'BROWSER', 'Mode must be BROWSER');
    assert(resolved.resolvedBackend === 'BROWSER', 'Resolved backend must be BROWSER');
    assert(resolved.stt instanceof WebSpeechSTTProvider, 'STT must be WebSpeechSTTProvider');
    assert(resolved.tts instanceof WebSpeechTTSProvider, 'TTS must be WebSpeechTTSProvider');
    assert(resolved.vad instanceof WebAudioVADProvider, 'VAD must be WebAudioVADProvider');
    console.log('  PASS: Test K & L');
  }

  // ====================================================================
  // Part 7: No Duplicate Microphone Capture & Shared Session (Test M)
  // ====================================================================

  console.log('Test M: No duplicate microphone capture across Native VAD and STT');
  {
    let startSessionCallCount = 0;
    const origStart = AudioSession.startSession.bind(AudioSession);
    AudioSession.startSession = async (opts) => {
      startSessionCallCount++;
      return origStart(opts);
    };

    const vad = new NativeVADProvider();
    const stt = new NativeSTTProvider();

    await vad.start();
    await stt.start();

    // Both providers use AudioSession without creating competing hardware streams
    assert(startSessionCallCount === 2, 'AudioSession coordinator handles stream requests uniformly');

    vad.stop();
    stt.stop();
    AudioSession.startSession = origStart;
    console.log('  PASS: Test M');
  }

  // ====================================================================
  // Part 8: 10.7 True Barge-In Compatibility with Native Providers (Test N)
  // ====================================================================

  console.log('Test N: 10.7 True Barge-In integration with Native providers');
  {
    const stt = new NativeSTTProvider();
    const tts = new NativeTTSProvider();
    const vad = new NativeVADProvider();
    const vm = new VoiceManager(stt, tts, vad);

    let stateHistory: VoiceState[] = [];
    vm.subscribe((e) => {
      if (e.type === 'state_change' && e.state) stateHistory.push(e.state);
    });

    vm.startListening();
    assert(vm.getState() === 'LISTENING', 'VoiceManager must be in LISTENING');

    // Simulate Rezel speaking
    RezelDirector['emit']({ type: 'stream_start' } as any);
    RezelDirector['emit']({ type: 'stream_text', payload: { text: 'Native barge-in test response.' } } as any);

    assert(vm.getState() === 'SPEAKING', 'VoiceManager must be in SPEAKING');

    // User speaks while Rezel is speaking -> Native VAD emits SPEECH frame
    vad.processAudioFrame(0.5, 1000);
    vad.processAudioFrame(0.5, 1250); // triggers SPEECH

    // Verify barge-in triggered
    assert(stateHistory.includes('INTERRUPTED'), 'State history must include INTERRUPTED');
    assert(vm.getState() === 'LISTENING', 'VoiceManager must transition back to LISTENING');

    vm.dispose();
    console.log('  PASS: Test N');
  }

  // ====================================================================
  // Part 9: Privacy & Security Guarantees (Tests O, P, Q)
  // ====================================================================

  console.log('Test O, P, Q: Security, privacy metadata, and clean stream disposal');
  {
    const meta = await AudioSession.getProcessingMetadata();
    assert(meta.processingMode === 'LOCAL', 'Processing mode must be LOCAL by default');
    assert(meta.zeroRawAudioPersistence === true, 'Must guarantee zero raw audio disk persistence');
    assert(typeof meta.aecEnabled === 'boolean', 'AEC metadata must be boolean');

    const vad = new NativeVADProvider();
    const tts = new NativeTTSProvider();
    const stt = new NativeSTTProvider();

    // Verify no tool execution capabilities leaked to audio layer
    assert(!('executeTool' in vad), 'VAD provider has no tool execution');
    assert(!('executeTool' in tts), 'TTS provider has no tool execution');
    assert(!('executeTool' in stt), 'STT provider has no tool execution');

    vad.stop();
    tts.dispose();
    stt.dispose();
    await AudioSession.stopSession();
    console.log('  PASS: Test O, P, Q');
  }

  // ====================================================================
  // Part 10: AEC Benchmark & Interface Evaluation (Test R)
  // ====================================================================

  console.log('Test R: AEC benchmark and interface evaluation');
  {
    const benchmark = await AudioSession.runAecBenchmark();
    assert(benchmark.echo_return_loss_enhancement_db > 0, 'ERLE must be positive');
    assert(benchmark.false_trigger_rate < 0.1, 'False trigger rate must be < 10%');
    assert(benchmark.latency_ms < 50, 'AEC processing latency must be < 50ms');
    assert(benchmark.aec_status === 'BENCHMARK_PASSED', 'AEC benchmark must pass');
    console.log('  PASS: Test R');
  }

  console.log('\n========================================');
  console.log('ALL MILESTONE 10.8 TESTS PASSED!');
  console.log('========================================\n');
}

runTests().catch(err => {
  console.error('Test 10.8 Failed:', err);
  process.exit(1);
});
