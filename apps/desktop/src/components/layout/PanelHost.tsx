import React, { Suspense, lazy } from 'react';
import type { AppMode } from '../hud/ModeNav';
import type { UseChatReturn } from '../../hooks/useChat';
import { GsapPresence } from './GsapPresence';

// ─── Lazy-loaded panels ───────────────────────────────────────────────────────

const ChatPanel       = lazy(() => import('../panels/ChatPanel'));
const AutoPanel       = lazy(() => import('../panels/AutoPanel'));
const MemoryPanel     = lazy(() => import('../panels/MemoryPanel'));
const SettingsPanel   = lazy(() => import('../panels/SettingsPanel'));

// ─── Error Boundary ──────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error?: Error}> {
  constructor(props: any) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute top-8 right-8 w-[420px] bg-red-900/40 p-4 border border-red-500/50 rounded-xl text-red-200 pointer-events-auto">
          Failed to load panel: {this.state.error?.message}
        </div>
      );
    }
    return this.props.children;
  }
}

const LoadingSkeleton = () => (
  <div className="absolute top-8 right-8 bottom-8 w-[420px] bg-[#0A0D15]/40 backdrop-blur-md rounded-2xl border border-white/5 flex items-center justify-center animate-pulse pointer-events-auto">
    <div className="w-8 h-8 rounded-full border-2 border-white/20 border-t-white/80 animate-spin" />
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

interface PanelHostProps {
  mode: AppMode;
  chat?: UseChatReturn;
}

export default function PanelHost({ mode, chat }: PanelHostProps) {
  let content: React.ReactNode = null;
  
  if (mode !== 'core') {
    content = (
      <ErrorBoundary>
        <Suspense fallback={<LoadingSkeleton />}>
          {mode === 'chat' && (chat ? <ChatPanel chat={chat} /> : <div className="absolute top-8 right-8 p-4 bg-red-900/50 text-white rounded">Chat unavailable</div>)}
          {mode === 'auto'     && <AutoPanel />}
          {mode === 'memory'   && <MemoryPanel />}
          {mode === 'settings' && <SettingsPanel />}
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 20 }}
    >
      <GsapPresence mode={mode}>
        {content}
      </GsapPresence>
    </div>
  );
}
