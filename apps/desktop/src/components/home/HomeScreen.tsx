import { useState, useEffect, useCallback, useRef } from 'react';
import SpaceScene from '../scene/SpaceScene';
import HologramHUD from '../hud/HologramHUD';
import PermissionConfirmModal from '../hud/PermissionConfirmModal';
import {
  setApprovalHandler,
  resolveApproval,
  type ApprovalRequest,
} from '../../lib/security/ToolExecutor';
import { AgentCore } from '../../lib/ai/AgentCore';
import type { AgentStatus } from '../../lib/ai/AgentCore';
import { useVoice } from '../../hooks/useVoice';
import type { OrbState } from '../hud/CommandOrb';

/**
 * HomeScreen
 *
 * Primary view rendered after the Genesis boot sequence.
 *
 * Stacking order (back → front):
 *  z-auto  — SpaceScene                (R3F Canvas, fills background)
 *  z-10    — HologramHUD               (glassmorphic overlay, pointer-events-none)
 *  z-50    — PermissionConfirmModal     (only when a tool needs approval)
 *
 * Integrations:
 *  Security — ToolExecutor approval handler
 *  Voice   — useVoice hook → AgentCore.send() → TTS response
 *  AI      — AgentCore event handler drives orbState
 */

/** Maps AgentCore status to CommandOrb visual state. */
function agentStatusToOrbState(status: AgentStatus): OrbState {
  switch (status) {
    case 'thinking':
    case 'streaming':
    case 'tool_executing':
      return 'thinking';
    case 'error':
      return 'idle';
    default:
      return 'idle';
  }
}

export default function HomeScreen() {
  // ── Security approval state ──────────────────────────────────────────────
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);

  useEffect(() => {
    setApprovalHandler((req) => setPendingApproval(req));
    return () => setApprovalHandler(null);
  }, []);

  const handleApprove = useCallback(() => {
    if (!pendingApproval) return;
    resolveApproval(pendingApproval.id, true);
    setPendingApproval(null);
  }, [pendingApproval]);

  const handleDeny = useCallback(() => {
    if (!pendingApproval) return;
    resolveApproval(pendingApproval.id, false);
    setPendingApproval(null);
  }, [pendingApproval]);

  // ── AgentCore init + event handling ──────────────────────────────────────
  const [orbState, setOrbState] = useState<OrbState>('idle');
  const processingRef = useRef(false);

  useEffect(() => {
    AgentCore.init().catch(console.error);

    AgentCore.setEventHandler((event) => {
      if (event.type === 'status_change' && event.status) {
        // Don't override voice states (listening/speaking)
        if (event.status === 'idle' && !processingRef.current) {
          setOrbState('idle');
        } else if (event.status !== 'idle') {
          setOrbState(agentStatusToOrbState(event.status));
        }
      }
    });

    return () => AgentCore.setEventHandler(null);
  }, []);

  // ── Voice engine ────────────────────────────────────────────────────────
  const speakRef = useRef<((text: string) => void) | null>(null);

  const handleVoiceResult = useCallback(async (transcript: string) => {
    processingRef.current = true;
    setOrbState('thinking');

    try {
      const response = await AgentCore.send(transcript);
      if (response && !response.startsWith('Error:')) {
        speakRef.current?.(response);
      } else {
        setOrbState('idle');
      }
    } catch {
      setOrbState('idle');
    } finally {
      processingRef.current = false;
    }
  }, []);

  const handleSpeakEnd = useCallback(() => {
    setOrbState('idle');
  }, []);

  const handleVoiceError = useCallback((error: string) => {
    if (import.meta.env.DEV) {
      console.warn('[Voice]', error);
    }
  }, []);

  const { voiceState, startListening, speak, cancel } = useVoice({
    onResult: handleVoiceResult,
    onSpeakEnd: handleSpeakEnd,
    onError: handleVoiceError,
  });

  // Keep ref in sync after destructuring
  speakRef.current = speak;

  // Voice states (listening/speaking) take priority over agent states
  const effectiveOrbState: OrbState =
    voiceState === 'listening' || voiceState === 'speaking'
      ? voiceState
      : orbState;

  // ── Orb click handler ───────────────────────────────────────────────────
  const handleOrbClick = useCallback(() => {
    if (effectiveOrbState === 'listening' || effectiveOrbState === 'speaking') {
      cancel();
    } else {
      startListening();
    }
  }, [effectiveOrbState, cancel, startListening]);

  return (
    <div
      className="relative w-screen h-screen overflow-hidden"
      style={{ background: '#02030A' }}
    >
      {/* Cinematic 3D space scene — fills the entire background */}
      <SpaceScene />

      {/* Glassmorphic HUD overlay — telemetry, clock, voice state */}
      <HologramHUD orbState={effectiveOrbState} onOrbClick={handleOrbClick} />

      {/* Permission confirmation modal — only visible when ToolExecutor awaits approval */}
      {pendingApproval && (
        <PermissionConfirmModal
          request={pendingApproval}
          onApprove={handleApprove}
          onDeny={handleDeny}
        />
      )}
    </div>
  );
}