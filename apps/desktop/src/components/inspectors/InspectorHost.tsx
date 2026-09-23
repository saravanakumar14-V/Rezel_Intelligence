import React, { Suspense, lazy, useEffect } from 'react';
import type { InspectorId } from '../../types/navigation';
import { GsapPresence } from '../layout/GsapPresence';

// ─── Lazy-loaded Inspectors ──────────────────────────────────────────────────

const MemoryInspector          = lazy(() => import('./MemoryInspector'));
const ConversationInspector    = lazy(() => import('./ConversationInspector'));
const ModelInspector           = lazy(() => import('./ModelInspector'));
const ProviderInspector        = lazy(() => import('./ProviderInspector'));
const TrustInspector           = lazy(() => import('./TrustInspector'));
const SystemInspector          = lazy(() => import('./SystemInspector'));
const PersonalizationInspector = lazy(() => import('./PersonalizationInspector'));
const WorkflowInspector        = lazy(() => import('./WorkflowInspector'));

// ─── Error Boundary ──────────────────────────────────────────────────────────

class InspectorErrorBoundary extends React.Component<
  { children: React.ReactNode; onClose?: () => void },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute top-14 right-6 w-[420px] bg-red-950/80 p-5 border border-red-500/50 rounded-2xl text-red-200 pointer-events-auto backdrop-blur-xl shadow-2xl z-20">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-xs font-bold text-red-400 uppercase tracking-wider">
              Inspector Fault
            </span>
            {this.props.onClose && (
              <button
                type="button"
                onClick={this.props.onClose}
                className="text-white/60 hover:text-white font-mono text-xs px-2 py-0.5 rounded bg-white/10"
              >
                Dismiss
              </button>
            )}
          </div>
          <p className="font-sans text-xs text-white/80">
            Failed to load inspector: {this.state.error?.message}
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

const LoadingSkeleton = () => (
  <div className="absolute top-14 right-6 bottom-24 w-[440px] bg-[#060B1E]/60 backdrop-blur-xl rounded-2xl border border-white/10 flex flex-col items-center justify-center pointer-events-auto shadow-2xl z-20">
    <div className="w-8 h-8 rounded-full border-2 border-[#00E5FF]/20 border-t-[#00E5FF] animate-spin" />
    <span className="mt-3 font-mono text-[10px] tracking-widest text-[#7ECFFF]/70 uppercase">
      Materializing Context...
    </span>
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

export interface InspectorHostProps {
  activeInspector: InspectorId;
  onClose: () => void;
  onOpenInspector?: (id: InspectorId) => void;
}

export default function InspectorHost({ activeInspector, onClose, onOpenInspector }: InspectorHostProps) {
  // Global Escape key listener to close active inspector
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeInspector !== null) {
        // Only if not in an input or textarea that might handle it
        if (
          document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.tagName === 'TEXTAREA'
        ) {
          // Blur first
          (document.activeElement as HTMLElement).blur();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeInspector, onClose]);

  let content: React.ReactNode = null;

  if (activeInspector) {
    content = (
      <InspectorErrorBoundary onClose={onClose}>
        <Suspense fallback={<LoadingSkeleton />}>
          {activeInspector === 'memory' && (
            <MemoryInspector onClose={onClose} onOpenInspector={onOpenInspector} />
          )}
          {activeInspector === 'conversations' && <ConversationInspector onClose={onClose} />}
          {activeInspector === 'models' && <ModelInspector onClose={onClose} />}
          {activeInspector === 'providers' && <ProviderInspector onClose={onClose} />}
          {activeInspector === 'trust' && <TrustInspector onClose={onClose} />}
          {activeInspector === 'system' && <SystemInspector onClose={onClose} />}
          {activeInspector === 'personalization' && <PersonalizationInspector onClose={onClose} />}
          {activeInspector === 'workflow' && <WorkflowInspector onClose={onClose} />}
        </Suspense>
      </InspectorErrorBoundary>
    );
  }

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 20 }}
    >
      <GsapPresence mode={activeInspector ?? 'none'}>
        {content}
      </GsapPresence>
    </div>
  );
}
