import './mock_tauri_core.js';
function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

import { WebAudioVADProvider } from './src/lib/voice/providers/WebAudioVADProvider.js';
import { VoiceManager } from './src/lib/voice/VoiceManager.js';
import type { STTProvider, TTSProvider, TTSProfile, VADProvider, VADFrame, VADEventHandler, VoiceState, VoiceEventHandler } from './src/lib/voice/types.js';
import { RezelDirector } from './src/lib/director/RezelDirector.js';
import { AgentCore } from './src/lib/ai/AgentCore.js';
import { LocalMemory } from './src/lib/memory/LocalMemory.js';
import { PlanEngine } from './src/lib/ai/PlanEngine.js';
import { WorkflowRuntime } from './src/lib/ai/WorkflowRuntime.js';
import { planStateMachine } from './src/lib/ai/PlanStateMachine.js';
import type { Plan } from './src/lib/ai/types.js';

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

  emitInterim(text: string) {
    this.onResultCb?.(text, '');
  }

  emitFinal(text: string) {
    this.onResultCb?.('', text);
  }
}

class MockTTS implements TTSProvider {
  public spokenTexts: string[] = [];
  public activeText: string | null = null;
  public onEndCb: (() => void) | null = null;
  public cancelledCount = 0;

  speak(text: string, _profile: TTSProfile, onStart: () => void, onEnd: () => void, _onError: (err: string) => void): void {
    this.spokenTexts.push(text);
    this.activeText = text;
    this.onEndCb = onEnd;
    onStart();
  }

  cancel(): void {
    this.cancelledCount++;
    this.activeText = null;
    if (this.onEndCb) {
      const cb = this.onEndCb;
      this.onEndCb = null;
      cb();
    }
  }
}

class ControllableVAD implements VADProvider {
  private handlers = new Set<VADEventHandler>();
  public isStarted = false;

  start(): void {
    this.isStarted = true;
  }

  stop(): void {
    this.isStarted = false;
  }

  on(event: 'frame', handler: VADEventHandler): void {
    if (event === 'frame') this.handlers.add(handler);
  }

  off(event: 'frame', handler: VADEventHandler): void {
    if (event === 'frame') this.handlers.delete(handler);
  }

  emit(frame: VADFrame) {
    for (const h of this.handlers) h(frame);
  }

  get handlerCount() {
    return this.handlers.size;
  }
}

async function runTests() {
  console.log('--- RUNNING MILESTONE 10.7 PHASE B TRUE BARGE-IN TESTS ---\n');

  // ====================================================================
  // Part 1: WebAudioVADProvider Unit Tests (A, B, C, D, P, Q, R)
  // ====================================================================

  console.log('Test A: VAD silence → speech transition');
  {
    const vad = new WebAudioVADProvider({ volumeThreshold: 0.05, minSpeechDuration: 200, silenceDebounce: 500 });
    let lastFrame: VADFrame | null = null;
    vad.on('frame', (f) => { lastFrame = f; });

    // Initial state is SILENCE
    assert(vad.getState() === 'SILENCE', 'VAD should start in SILENCE');

    // Feed volume above threshold at t=0
    vad.processAudioFrame(0.1, 1000);
    assert(vad.getState() === 'SILENCE', 'Should not transition immediately before minSpeechDuration');

    // Feed volume above threshold at t=250ms (duration >= 200ms)
    vad.processAudioFrame(0.12, 1250);
    assert(vad.getState() === 'SPEECH', 'Should transition to SPEECH after minSpeechDuration');
    assert(lastFrame !== null && lastFrame.state === 'SPEECH', 'Should have emitted SPEECH frame');
    console.log('  PASS: Test A');
  }

  console.log('Test B: speech duration threshold (minSpeechDuration prevents short triggers)');
  {
    const vad = new WebAudioVADProvider({ volumeThreshold: 0.05, minSpeechDuration: 200, silenceDebounce: 500 });
    let speechEmitted = false;
    vad.on('frame', (f) => { if (f.state === 'SPEECH') speechEmitted = true; });

    // Short volume spike for only 50ms
    vad.processAudioFrame(0.5, 1000);
    vad.processAudioFrame(0.5, 1050);
    vad.processAudioFrame(0.01, 1100); // drops back below threshold

    assert(vad.getState() === 'SILENCE', 'State should remain SILENCE for 50ms spike');
    assert(!speechEmitted, 'SPEECH frame should not be emitted for short spike');
    console.log('  PASS: Test B');
  }

  console.log('Test C: debounce (silenceDebounce prevents rapid toggling between words)');
  {
    const vad = new WebAudioVADProvider({ volumeThreshold: 0.05, minSpeechDuration: 200, silenceDebounce: 500 });
    vad.processAudioFrame(0.1, 1000);
    vad.processAudioFrame(0.1, 1250); // Becomes SPEECH
    assert(vad.getState() === 'SPEECH', 'Should be in SPEECH');

    // Pause between words for 200ms (< 500ms debounce)
    vad.processAudioFrame(0.01, 1300);
    vad.processAudioFrame(0.01, 1450);
    assert(vad.getState() === 'SPEECH', 'Brief pause < silenceDebounce must keep SPEECH state');

    // Continue speech
    vad.processAudioFrame(0.15, 1500);
    assert(vad.getState() === 'SPEECH', 'Continued speech keeps SPEECH state');

    // Prolonged silence >= 500ms
    vad.processAudioFrame(0.01, 1600);
    vad.processAudioFrame(0.01, 2150); // 550ms later
    assert(vad.getState() === 'SILENCE', 'Prolonged silence >= silenceDebounce transitions to SILENCE');
    console.log('  PASS: Test C');
  }

  console.log('Test D: noise spike does not trigger interruption');
  {
    const vad = new WebAudioVADProvider({ volumeThreshold: 0.05, minSpeechDuration: 200, silenceDebounce: 500 });
    let frameCount = 0;
    vad.on('frame', () => { frameCount++; });

    // Single click / spike
    vad.processAudioFrame(0.95, 1000);
    vad.processAudioFrame(0.00, 1030);

    assert(vad.getState() === 'SILENCE', 'Noise spike should not change state');
    assert(frameCount === 0, 'No frame emitted for filtered noise spike');
    console.log('  PASS: Test D');
  }

  console.log('Test P: provider cleanup on stop and off');
  {
    const vad = new WebAudioVADProvider();
    const handler = () => {};
    vad.on('frame', handler);
    vad.off('frame', handler);
    vad.stop();
    assert(vad.getState() === 'SILENCE', 'Stop should ensure SILENCE state');
    console.log('  PASS: Test P');
  }

  console.log('Test Q & R: microphone failure and unsupported browser API graceful fallback');
  {
    const vad = new WebAudioVADProvider();
    // In Node environment without window.AudioContext or navigator.mediaDevices
    await vad.start(); // should not throw, logs warn and returns cleanly
    vad.stop(); // should not throw
    console.log('  PASS: Test Q & R');
  }

  // ====================================================================
  // Part 2: VoiceManager Barge-In Integration Tests (E, F, G, J, S, T)
  // ====================================================================

  console.log('Test E & F: speech while SPEAKING triggers immediate TTS cancellation and queue clear');
  {
    const stt = new MockSTT();
    const tts = new MockTTS();
    const vad = new ControllableVAD();
    const vm = new VoiceManager(stt, tts, vad);

    let stateHistory: VoiceState[] = [];
    vm.subscribe((e) => {
      if (e.type === 'state_change' && e.state) stateHistory.push(e.state);
    });

    vm.startListening();
    assert(vad.isStarted, 'VAD should start when listening starts');

    // Simulate Director streaming sentences
    RezelDirector['emit']({ type: 'stream_start' } as any);
    RezelDirector['emit']({ type: 'stream_text', payload: { text: 'First sentence here. Second sentence starts here.' } } as any);

    assert(tts.activeText === 'First sentence here.', 'TTS should speak first sentence');
    assert(vm.getState() === 'SPEAKING', 'State should be SPEAKING');

    // User speaks while Rezel is speaking -> VAD emits SPEECH
    vad.emit({ state: 'SPEECH', confidence: 0.9, timestamp: Date.now() });

    // TTS must be cancelled immediately
    assert(tts.activeText === null, 'TTS active text should be cleared on barge-in');
    assert(tts.cancelledCount >= 1, 'TTS cancel() must have been called');

    // VoiceManager must transition to INTERRUPTED then back to LISTENING
    assert(stateHistory.includes('INTERRUPTED'), 'State history must include INTERRUPTED');
    assert(vm.getState() === 'LISTENING', 'VoiceManager must be back in LISTENING to capture new utterance');

    // Flushed sentences from the aborted stream must NOT be spoken
    RezelDirector['emit']({ type: 'stream_end' } as any);
    assert(tts.activeText === null, 'Aborted stream fragments must not be spoken');

    vm.dispose();
    console.log('  PASS: Test E & F');
  }

  console.log('Test G & T: RezelDirector.interrupt() called exactly once (no duplicate cancellation)');
  {
    const stt = new MockSTT();
    const tts = new MockTTS();
    const vad = new ControllableVAD();
    const vm = new VoiceManager(stt, tts, vad);

    let interruptCount = 0;
    const origInterrupt = RezelDirector.interrupt.bind(RezelDirector);
    RezelDirector.interrupt = () => {
      interruptCount++;
      origInterrupt();
    };

    vm.startListening();
    RezelDirector['emit']({ type: 'stream_start' } as any);
    RezelDirector['emit']({ type: 'stream_text', payload: { text: 'Testing interrupt count.' } } as any);

    assert(vm.getState() === 'SPEAKING', 'Should be SPEAKING');

    // Emit SPEECH frame
    vad.emit({ state: 'SPEECH', confidence: 0.9, timestamp: Date.now() });
    assert(interruptCount === 1, 'RezelDirector.interrupt() must be called once');

    // Emit another SPEECH frame while in LISTENING state
    vad.emit({ state: 'SPEECH', confidence: 0.95, timestamp: Date.now() });
    assert(interruptCount === 1, 'Subsequent SPEECH frames while listening must not trigger duplicate interrupt');

    RezelDirector.interrupt = origInterrupt;
    vm.dispose();
    console.log('  PASS: Test G & T');
  }

  console.log('Test S: VoiceManager has no direct access to tools/security layer');
  {
    const stt = new MockSTT();
    const tts = new MockTTS();
    const vad = new ControllableVAD();
    const vm = new VoiceManager(stt, tts, vad);

    // Verify VoiceManager prototype does not import or expose AIToolExecutor, SecurityToolExecutor, PolicyEngine, etc.
    assert(!('executeTool' in vm), 'VoiceManager must not have tool execution capabilities');
    assert(!('policyEngine' in vm), 'VoiceManager must not touch policy engine directly');
    vm.dispose();
    console.log('  PASS: Test S');
  }

  // ====================================================================
  // Part 3: AgentCore Interrupted Turn Persistence & Continuation (H, I, J, K)
  // ====================================================================

  console.log('Test H, I, J, K: Partial response persisted with interrupted metadata, and new turn continues cleanly');
  {
    // Setup controllable mock provider for AgentCore
    let streamResolvers: Array<() => void> = [];
    let abortedSignal: AbortSignal | null = null;

    const mockProvider = {
      name: 'barge-in-mock',
      async *chat(messages: any[], options?: any): AsyncGenerator<any> {
        abortedSignal = options?.signal ?? null;

        // Yield partial text chunk
        yield { type: 'text', text: 'I am creating the roads and now—' };

        // Wait for abort or resolution
        await new Promise<void>((resolve) => {
          streamResolvers.push(resolve);
          if (options?.signal?.aborted) {
            resolve();
            return;
          }
          options?.signal?.addEventListener('abort', () => resolve(), { once: true });
        });

        if (!options?.signal?.aborted) {
          yield { type: 'text', text: ' finished roads and houses.' };
        }
        yield { type: 'done' };
      },
      async isAvailable() { return true; }
    };

    (AgentCore as any).provider = mockProvider;
    (AgentCore as any).initialized = true;

    const convId = LocalMemory.createConversation('Barge-In Turn Test');
    (AgentCore as any).conversationId = convId;

    // Start Turn 1: User says "Create a city"
    const turn1Promise = AgentCore.send('Create a city', { conversationId: convId } as any);
    await new Promise(r => setTimeout(r, 20)); // allow streaming to start and yield first chunk

    // Simulate Barge-In: User interrupts
    RezelDirector.interrupt(); // calls AgentCore.abort()

    // Resolve any remaining stream promises
    streamResolvers.forEach(r => r());
    const turn1Result = await turn1Promise;

    // Verify Test H & I: Partial response persisted with interrupted: true
    const messages = LocalMemory.getMessages(convId);
    assert(messages.length === 2, `Expected 2 messages (user + partial assistant), got ${messages.length}`);
    assert(messages[0].role === 'user' && messages[0].content === 'Create a city', 'User message 1 preserved');
    
    const assistantMsg1 = messages[1];
    assert(assistantMsg1.role === 'assistant', 'Assistant message 1 exists');
    assert(assistantMsg1.content === 'I am creating the roads and now—', 'Partial content preserved exactly');
    assert(assistantMsg1.interrupted === true, 'Interrupted metadata flag must be true');
    assert(!assistantMsg1.content.includes('[Interrupted]'), 'Must not inject raw [Interrupted] text into content');
    console.log('  PASS: Test H & I');

    // Verify Test J & K: Turn 2 starts via send and executes normally
    streamResolvers = [];
    const turn2Promise = AgentCore.send('Wait, add a river first.', { conversationId: convId } as any);
    await new Promise(r => setTimeout(r, 20));
    streamResolvers.forEach(r => r());
    const turn2Result = await turn2Promise;

    const messagesAfterTurn2 = LocalMemory.getMessages(convId);
    assert(messagesAfterTurn2.length === 4, `Expected 4 messages after turn 2, got ${messagesAfterTurn2.length}`);
    assert(messagesAfterTurn2[2].role === 'user' && messagesAfterTurn2[2].content === 'Wait, add a river first.', 'User message 2 preserved');
    assert(messagesAfterTurn2[3].role === 'assistant', 'Assistant message 2 exists');
    assert(!messagesAfterTurn2[3].interrupted, 'Turn 2 assistant message should not be interrupted');
    console.log('  PASS: Test J & K');
  }

  // ====================================================================
  // Part 4: Workflow Cancellation & UNKNOWN Semantics (L, M, N, O)
  // ====================================================================

  console.log('Test L: Mutation not started → CANCELLED');
  {
    const plan: Plan = {
      id: `plan_test_l_${Date.now()}`,
      goal: 'Test unstarted cancellation',
      status: 'PLANNED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [
        {
          id: 'step_1',
          description: 'Unstarted step',
          status: 'PENDING',
          attempts: 0
        }
      ]
    };

    planStateMachine.cancelPlan(plan);
    assert(plan.status === 'CANCELLED', 'Plan must be CANCELLED');
    assert(plan.steps[0].status === 'CANCELLED', 'Unstarted step must be CANCELLED');
    assert(plan.steps[0].executionOutcome === undefined, 'Unstarted step must not have executionOutcome');
    console.log('  PASS: Test L');
  }

  console.log('Test M: Safely aborted mutation before external effect → CANCELLED');
  {
    const plan: Plan = {
      id: `plan_test_m_${Date.now()}`,
      goal: 'Test aborted mutation',
      status: 'PLANNED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [
        {
          id: 'step_m1',
          description: 'Step waiting for approval',
          status: 'WAITING',
          waitingReason: 'USER_CONFIRMATION',
          attempts: 1
        }
      ]
    };

    planStateMachine.cancelPlan(plan);
    assert(plan.status === 'CANCELLED', 'Plan must be CANCELLED');
    assert(plan.steps[0].status === 'CANCELLED', 'Waiting step must be CANCELLED');
    assert(plan.steps[0].executionOutcome === undefined, 'Step aborted before execution must not have executionOutcome');
    console.log('  PASS: Test M');
  }

  console.log('Test N & O: Ambiguous external mutation → UNKNOWN, no automatic retry');
  {
    const plan: Plan = {
      id: `plan_test_n_${Date.now()}`,
      goal: 'Test ambiguous running mutation',
      status: 'PLANNED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      steps: [
        {
          id: 'step_n1',
          description: 'Running external mutation',
          status: 'RUNNING',
          attempts: 1
        }
      ]
    };

    planStateMachine.cancelPlan(plan);
    assert(plan.status === 'CANCELLED', 'Plan must be CANCELLED');
    assert(plan.steps[0].status === 'CANCELLED', 'Running step must transition to CANCELLED');
    assert(plan.steps[0].executionOutcome === 'UNKNOWN', 'Running mutation interrupted during execution must be UNKNOWN');

    // Verify UNKNOWN is not retried automatically
    const { WorkflowRecoveryManager } = await import('./src/lib/ai/persistence/WorkflowRecoveryManager.js');
    const workflow = {
      id: 'wf_unknown_test',
      plan,
      status: 'RECOVERY_REQUIRED' as any,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    assert(!WorkflowRecoveryManager.canSafelyResume(workflow), 'Workflows with UNKNOWN mutations cannot be resumed automatically');
    console.log('  PASS: Test N & O');
  }

  console.log('\n========================================');
  console.log('ALL MILESTONE 10.7 TESTS PASSED!');
  console.log('========================================\n');
}

runTests().catch(err => {
  console.error('Test 10.7 Failed:', err);
  process.exit(1);
});
