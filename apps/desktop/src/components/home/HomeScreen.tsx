import { useState, useEffect, useCallback, useRef } from 'react';
import SpaceScene from '../scene/SpaceScene';
import EnvironmentBar from '../environment/EnvironmentBar';
import EnvironmentIndicators from '../environment/EnvironmentIndicators';
import IntentSurface from '../intent/IntentSurface';
import ConversationLayer from '../conversation/ConversationLayer';
import ActivityBand from '../activity/ActivityBand';
import InspectorHost from '../inspectors/InspectorHost';
import NotificationSurface from '../hud/notifications/NotificationSurface';
import ContextualApprovalSurface from '../hud/approval/ContextualApprovalSurface';
import PermissionConfirmModal from '../hud/PermissionConfirmModal';
import { CompanionWindow } from '../companion/CompanionWindow';
import AccessField from '../navigation/AccessField';
import { accessFieldBus } from '../navigation/accessFieldState';
import {
  setApprovalHandler,
  resolveApproval,
  type ApprovalRequest,
} from '../../lib/security/ToolExecutor';
import { ApprovalBridge } from '../../lib/ai/approval/ApprovalBridge';
import type { ApprovalRequest as BridgeApprovalRequest } from '../../lib/ai/approval/types';
import { AgentCore } from '../../lib/ai/AgentCore';
import { RezelDirector, type DirectorEvent } from '../../lib/director/RezelDirector';
import type { AgentStatus } from '../../lib/ai/AgentCore';
import { useVoice } from '../../hooks/useVoice';
import { useChat } from '../../hooks/useChat';
import type { OrbState } from '../hud/CommandOrb';
import type { InspectorId } from '../../types/navigation';
import type { ExperienceProfile, WindowState } from '../../lib/director/types';
import { ExperienceProfileRegistry } from '../../lib/director/ExperienceProfile';

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
  const [activeInspector, setActiveInspector] = useState<InspectorId>(null);
  const [profile, setProfile] = useState<ExperienceProfile>(() =>
    ExperienceProfileRegistry.getProfile(RezelDirector.getCurrentMode())
  );
  const [windowMode, setWindowMode] = useState<WindowState>(() =>
    RezelDirector.getWindowState()
  );

  // Approval handlers
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);
  const [pendingBridgeApproval, setPendingBridgeApproval] = useState<BridgeApprovalRequest | null>(
    () => ApprovalBridge.getLatestPending() || null
  );

  useEffect(() => {
    setApprovalHandler((req) => setPendingApproval(req));
    return () => setApprovalHandler(null);
  }, []);

  useEffect(() => {
    const unsub = ApprovalBridge.subscribe((list) => {
      setPendingBridgeApproval(list[0] || null);
    });
    return () => unsub();
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

  const chat = useChat();
  const chatEventRef = useRef(chat.handleAgentEvent);
  chatEventRef.current = chat.handleAgentEvent;

  const [orbState, setOrbState] = useState<OrbState>('idle');
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    AgentCore.init().catch(console.error);

    const handler = (event: DirectorEvent) => {
      chatEventRef.current(event);

      if (event.type === 'stream_start') {
        setIsDismissed(false);
      }

      if (event.type === 'stream_text') {
        setIsDismissed(false);
      }

      if (event.type === 'status_change' && event.payload?.status) {
        if (event.payload.status === 'idle') {
          setOrbState('idle');
        } else {
          setOrbState(agentStatusToOrbState(event.payload.status));
        }
      }

      if (event.type === 'workflow_started') {
        setActiveTool(event.payload?.title || 'Workflow Execution');
      } else if (
        event.type === 'reasoning_workflow_completed' ||
        event.type === 'reasoning_error'
      ) {
        setActiveTool(null);
      }

      if (event.type === 'profile_changed' && event.payload?.profile) {
        setProfile(event.payload.profile);
      }

      if (event.type === 'window_mode_changed' && event.payload?.mode) {
        setWindowMode(event.payload.mode);
      }
    };

    // First-Time User Experience (FTUE): subtle discovery reveal
    let ftueTimer: ReturnType<typeof setTimeout> | undefined;
    if (typeof window !== 'undefined') {
      const hasExplored = localStorage.getItem('rezel_has_explored');
      if (!hasExplored) {
        ftueTimer = setTimeout(() => {
          accessFieldBus.open();
          localStorage.setItem('rezel_has_explored', 'true');
        }, 1800);
      }
    }

    RezelDirector.subscribe(handler);
    return () => {
      if (ftueTimer) clearTimeout(ftueTimer);
      RezelDirector.unsubscribe(handler);
    };
  }, []);

  const { voiceState, startListening, cancel } = useVoice();

  // Voice states (listening/speaking) take priority over agent states
  const effectiveOrbState: OrbState =
    voiceState === 'listening' ||
    voiceState === 'speaking' ||
    voiceState === 'thinking' ||
    voiceState === 'interrupted'
      ? voiceState
      : orbState;

  const handleOrbClick = useCallback(() => {
    if (
      effectiveOrbState === 'listening' ||
      effectiveOrbState === 'speaking' ||
      effectiveOrbState === 'thinking'
    ) {
      cancel();
    } else {
      startListening();
    }
  }, [effectiveOrbState, cancel, startListening]);

  const bgStyle = (() => {
    switch (profile.uiProfile.theme) {
      case 'terminal':
        return { background: '#000000' };
      case 'holographic':
        return { background: '#010515' };
      case 'soft':
      default:
        return { background: '#02030A' };
    }
  })();

  const isCompanion = windowMode === 'COMPANION';

  const INSPECTOR_TO_SURFACE_MAP: Record<string, string> = {
    providers: 'analyze-providers',
    models: 'inspect-models',
    memory: 'analyze-memory',
    system: 'analyze-system',
    workflow: 'auto-workflows',
    personalization: 'ctrl-personalization',
    conversations: 'conv-chat',
    trust: 'ctrl-permissions',
  };

  const handleOpenInspector = useCallback((id: InspectorId) => {
    if (id && INSPECTOR_TO_SURFACE_MAP[id]) {
      accessFieldBus.open(INSPECTOR_TO_SURFACE_MAP[id]);
      return;
    }
    setActiveInspector((prev) => (prev === id ? null : id));
  }, []);

  const handleCloseInspector = useCallback(() => {
    setActiveInspector(null);
  }, []);

  return (
    <div
      className="relative w-screen h-screen overflow-hidden transition-colors duration-1000 select-none"
      style={bgStyle}
    >
      {/* Critical Invariant: SpaceScene remains continuously mounted, occluded in companion mode */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          isCompanion ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <SpaceScene />
      </div>

      {isCompanion ? (
        <CompanionWindow />
      ) : (
        <>
          {/* Top Environment Bar (Brand, App Status, Active Provider, Clock) */}
          <EnvironmentBar onOpenInspector={handleOpenInspector} />

          {/* Left Context & Resource Indicators */}
          <EnvironmentIndicators onOpenInspector={handleOpenInspector} />

          {/* Ambient Living Workflow / Activity Band */}
          <ActivityBand onOpenInspector={handleOpenInspector} />

          {/* Ambient Conversation Layer */}
          <ConversationLayer
            chat={chat}
            activeTool={activeTool}
            isDismissed={isDismissed}
            onDismiss={() => setIsDismissed(true)}
            onOpenInspector={handleOpenInspector}
          />

          {/* Deep Contextual Inspector Host Overlay */}
          <InspectorHost
            activeInspector={activeInspector}
            onClose={handleCloseInspector}
            onOpenInspector={handleOpenInspector}
          />

          {/* Primary Bottom Intent Control Surface */}
          <IntentSurface
            orbState={effectiveOrbState}
            onOrbClick={handleOrbClick}
            onOpenInspector={handleOpenInspector}
            chat={chat}
          />

          {/* Universal Spatial Access Field Navigation Layer */}
          <AccessField />
        </>
      )}

      {/* Contextual Human Approval Gate Surface */}
      {pendingBridgeApproval && (
        <ContextualApprovalSurface
          request={pendingBridgeApproval}
          onDecided={() => setPendingBridgeApproval(null)}
        />
      )}

      {/* Unified Notification & Event Surface */}
      <NotificationSurface />

      {/* Modal Fallback for High-Security Operations */}
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