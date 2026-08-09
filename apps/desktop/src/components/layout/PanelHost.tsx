import { Suspense, lazy } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AppMode } from '../hud/ModeNav';
import type { UseChatReturn } from '../../hooks/useChat';

// ─── Lazy-loaded panels ───────────────────────────────────────────────────────

const ChatPanel       = lazy(() => import('../panels/ChatPanel'));
const AutoPanel       = lazy(() => import('../panels/AutoPanel'));
const MemoryPanel     = lazy(() => import('../panels/MemoryPanel'));
const SettingsPanel   = lazy(() => import('../panels/SettingsPanel'));

// ─── Animation variants ──────────────────────────────────────────────────────

const panelVariants = {
  initial:  { opacity: 0, x: 32, filter: 'blur(4px)' },
  animate:  { opacity: 1, x: 0,  filter: 'blur(0px)' },
  exit:     { opacity: 0, x: 16, filter: 'blur(3px)' },
};

const panelTransition = {
  duration: 0.3,
  ease: [0.22, 0.68, 0.35, 1.0] as const,
};

// ─── Component ────────────────────────────────────────────────────────────────

interface PanelHostProps {
  mode: AppMode;
  /** Chat hook state — passed through to ChatPanel to avoid re-creating useChat. */
  chat?: UseChatReturn;
}

/**
 * PanelHost
 *
 * AnimatePresence container that renders the currently active panel.
 * Sits at z-20 — above the HUD (z-10) but below PermissionConfirmModal (z-50).
 *
 * When mode is 'core', no panel is rendered — the bare 3D scene shows through.
 * Panels slide in from the right with a subtle blur transition.
 *
 * The SpaceScene is a sibling, never remounts during mode changes.
 */
export default function PanelHost({ mode, chat }: PanelHostProps) {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 20 }}
    >
      <AnimatePresence mode="wait">
        {mode !== 'core' && (
          <motion.div
            key={mode}
            variants={panelVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={panelTransition}
            className="absolute inset-0 pointer-events-none"
            style={{ willChange: 'opacity, transform, filter' }}
          >
            <Suspense fallback={null}>
              {mode === 'chat'     && chat && <ChatPanel chat={chat} />}
              {mode === 'auto'     && <AutoPanel />}
              {mode === 'memory'   && <MemoryPanel />}
              {mode === 'settings' && <SettingsPanel />}
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
