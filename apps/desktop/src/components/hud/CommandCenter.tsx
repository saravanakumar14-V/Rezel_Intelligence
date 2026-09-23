import { useState, useRef, useEffect } from 'react';
import { Send, Square, Sparkles } from 'lucide-react';
import CommandOrb, { type OrbState } from './CommandOrb';
import type { AppMode } from './ModeNav';
import { useVoice } from '../../hooks/useVoice';
import { AgentCore } from '../../lib/ai/AgentCore';
import { SpatialNavigationEngine } from '../../lib/navigation/SpatialNavigationEngine';
import { PersonalizationManager } from '../../lib/personalization/PersonalizationManager';
import { cn } from '../../lib/cn';
import styles from './CommandCenter.module.css';

export interface CommandCenterProps {
  orbState?: OrbState;
  onOrbClick?: () => void;
  onModeChange?: (mode: AppMode) => void;
}

export default function CommandCenter({
  orbState = 'idle',
  onOrbClick,
  onModeChange,
}: CommandCenterProps) {
  const [input, setInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { voiceState, startListening, cancel: cancelVoice } = useVoice();

  // Global hotkey '/' to focus command bar, 'Escape' to blur/cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSubmit = async () => {
    const query = input.trim();
    if (!query || isExecuting) return;

    // Check spatial navigation commands & natural language space routing
    if (SpatialNavigationEngine.resolveCommand(query)) {
      const currentSpace = SpatialNavigationEngine.getCurrentSpace();
      if (currentSpace === 'CORE') onModeChange?.('core');
      else if (currentSpace === 'CONVERSATION') onModeChange?.('chat');
      else if (currentSpace === 'WORKFLOW') onModeChange?.('auto');
      else if (currentSpace === 'MEMORY' || currentSpace === 'KNOWLEDGE') onModeChange?.('memory');
      else if (currentSpace === 'MODELS' || currentSpace === 'PROVIDERS' || currentSpace === 'SYSTEM' || currentSpace === 'TRUST' || currentSpace === 'AUDIT') onModeChange?.('settings');
      setInput('');
      return;
    }

    // Check personalization & identity customization commands
    if (PersonalizationManager.resolveNaturalCommand(query)) {
      setInput('');
      return;
    }

    setInput('');
    setIsExecuting(true);

    try {
      await AgentCore.send(query);
    } catch (err) {
      console.error('[CommandCenter] Execution error:', err);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCancel = () => {
    AgentCore.abort();
    cancelVoice();
    setIsExecuting(false);
  };

  const handlePillClick = (mode: AppMode) => {
    onModeChange?.(mode);
  };

  const isVoiceListening = voiceState === 'listening';
  const effectiveOrbState = orbState;

  return (
    <div className={styles.commandCenterRoot}>
      <div
        className={cn(
          styles.capsule,
          isExecuting && styles.capsuleActive,
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

        {/* Omnibar Input */}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSubmit();
            }
          }}
          placeholder={
            isVoiceListening
              ? "Rezel is listening to your voice..."
              : isExecuting
              ? "Reasoning and executing plan across workspace..."
              : "Ask Rezel or type /chat, /auto, /memory... (Press '/' to focus)"
          }
          className={styles.inputField}
          disabled={isExecuting || isVoiceListening}
        />

        {/* Mode Quick Pills (visible when input is empty & idle) */}
        {!input && !isExecuting && !isVoiceListening && (
          <div className={styles.quickPills}>
            <button
              type="button"
              className={styles.pill}
              onClick={() => handlePillClick('chat')}
              title="Switch to Chat conversation"
            >
              CHAT
            </button>
            <button
              type="button"
              className={styles.pill}
              onClick={() => handlePillClick('auto')}
              title="Open Automation & Workflow Console"
            >
              AUTO
            </button>
            <span className={styles.keyHint}>/</span>
          </div>
        )}

        {/* Trigger / Cancel Action Button */}
        {isExecuting || isVoiceListening ? (
          <button
            type="button"
            onClick={handleCancel}
            className={styles.cancelBtn}
            aria-label="Cancel active action"
            title="Cancel execution (Esc)"
          >
            <Square size={14} />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!input.trim()}
            className={styles.actionBtn}
            aria-label="Send command"
            title="Execute command (Enter)"
          >
            {input.trim() ? <Send size={14} /> : <Sparkles size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}
