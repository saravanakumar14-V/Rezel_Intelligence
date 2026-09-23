import { useState, useRef, useEffect } from 'react';
import { Send, Square, Sparkles, Mic, MicOff } from 'lucide-react';
import CommandOrb, { type OrbState } from '../hud/CommandOrb';
import type { InspectorId } from '../../types/navigation';
import type { UseChatReturn } from '../../hooks/useChat';
import { useVoice } from '../../hooks/useVoice';
import { AgentCore } from '../../lib/ai/AgentCore';
import { ContextualIntentResolver } from '../../lib/ai/context/ContextualIntentResolver';
import { cn } from '../../lib/cn';
import styles from './IntentSurface.module.css';

export interface IntentSurfaceProps {
  orbState?: OrbState;
  onOrbClick?: () => void;
  onOpenInspector?: (id: InspectorId) => void;
  chat?: UseChatReturn;
  className?: string;
}

export default function IntentSurface({
  orbState = 'idle',
  onOrbClick,
  onOpenInspector,
  chat,
  className,
}: IntentSurfaceProps) {
  const [input, setInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    voiceState,
    startListening,
    stopListening,
    cancel: cancelVoice,
    interimTranscript,
    isSpeaking,
  } = useVoice();

  // Synchronize live speech transcript directly into the omnibar input without locking
  useEffect(() => {
    if (interimTranscript) {
      setInput(interimTranscript);
    }
  }, [interimTranscript]);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Hotkey '/' to focus input
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === 'Escape') {
        if (isSpeaking) {
          cancelVoice(); // Barge-in interrupt
        } else if (document.activeElement === inputRef.current) {
          inputRef.current?.blur();
        }
      }

      // Modifier shortcuts for inspectors (Ctrl+Shift or Cmd+Shift)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        const key = e.key.toUpperCase();
        if (key === 'M') {
          e.preventDefault();
          onOpenInspector?.('memory');
        } else if (key === 'P') {
          e.preventDefault();
          onOpenInspector?.('providers');
        } else if (key === 'K') {
          e.preventDefault();
          onOpenInspector?.('models');
        } else if (key === 'S') {
          e.preventDefault();
          onOpenInspector?.('system');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onOpenInspector, isSpeaking, cancelVoice]);

  const handleSubmit = async () => {
    const query = input.trim();
    if (!query || isExecuting) return;

    // Barge-in: immediately stop TTS if audio is playing
    if (isSpeaking) {
      cancelVoice();
    }

    // Stop listening if speech was active
    if (voiceState === 'listening') {
      stopListening();
    }

    setInput('');
    setIsExecuting(true);

    try {
      // Resolve intent across all contextual subsystems
      const resolution = await ContextualIntentResolver.resolveIntent(query);

      if (resolution.handled) {
        if (resolution.type === 'INSPECTOR' && resolution.targetInspector) {
          onOpenInspector?.(resolution.targetInspector);
        }
        return;
      }

      // Standard conversation / task execution
      if (chat) {
        await chat.send(query);
      } else {
        await AgentCore.send(query);
      }
    } catch (err) {
      console.error('[IntentSurface] Execution error:', err);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCancel = () => {
    if (chat) {
      chat.abort();
    } else {
      AgentCore.abort();
    }
    cancelVoice();
    setIsExecuting(false);
  };

  const isVoiceListening = voiceState === 'listening';
  const effectiveOrbState = isVoiceListening ? 'listening' : isSpeaking ? 'speaking' : orbState;
  const isBusy = isExecuting || Boolean(chat?.isProcessing);

  return (
    <div className={cn(styles.intentSurfaceRoot, className)}>
      <div
        className={cn(
          styles.capsule,
          isBusy && styles.capsuleActive,
          isVoiceListening && styles.capsuleListening
        )}
      >
        {/* Integrated Voice Orb anchor */}
        <div className={styles.orbAnchor}>
          <CommandOrb
            state={effectiveOrbState}
            onClick={onOrbClick || (isVoiceListening ? cancelVoice : startListening)}
          />
        </div>

        {/* Omnibar Input — NEVER disabled during voice so user can freely edit / type */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            // If user begins typing while TTS is speaking, interrupt TTS (barge-in)
            if (isSpeaking) {
              cancelVoice();
            }
            setInput(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={
            isVoiceListening
              ? "Listening... (you can also type or edit speech)"
              : isBusy
              ? "Reasoning and executing plan across workspace..."
              : isSpeaking
              ? "Rezel is responding... (type or press Esc to interrupt)"
              : "Ask Rezel, give instructions, or type 'why?', 'show models', 'what's running'..."
          }
          className={styles.inputField}
          disabled={isBusy}
        />

        {/* Voice Toggle Button */}
        <button
          type="button"
          onClick={isVoiceListening ? stopListening : startListening}
          className={`p-1.5 rounded-full transition-colors ${
            isVoiceListening ? 'text-cyan-300 bg-cyan-500/20' : 'text-slate-400 hover:text-cyan-300'
          }`}
          aria-label={isVoiceListening ? 'Stop listening' : 'Start voice input'}
          title={isVoiceListening ? 'Stop voice listening' : 'Speak to Rezel'}
        >
          {isVoiceListening ? <Mic size={14} className="animate-pulse" /> : <MicOff size={14} />}
        </button>

        {/* Shortcut Hint badge when idle & empty */}
        {!input && !isBusy && !isVoiceListening && !isSpeaking && (
          <div className={styles.shortcutsHint}>
            <span className={styles.keyHint} title="Press '/' to focus command bar">
              /
            </span>
          </div>
        )}

        {/* Action / Cancel Button */}
        {isBusy ? (
          <button
            type="button"
            onClick={handleCancel}
            className={styles.cancelBtn}
            aria-label="Cancel active action"
            title="Cancel execution (Esc)"
          >
            <Square size={13} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!input.trim()}
            className={styles.actionBtn}
            aria-label="Send command"
            title="Execute intent (Enter)"
          >
            {input.trim() ? <Send size={13} /> : <Sparkles size={13} />}
          </button>
        )}
      </div>
    </div>
  );
}
