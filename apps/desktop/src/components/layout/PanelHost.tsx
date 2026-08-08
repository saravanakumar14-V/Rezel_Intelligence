import { Suspense, lazy } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { AppMode } from '../hud/ModeNav';

// ─── Lazy-loaded panel stubs ──────────────────────────────────────────────────

const ChatPanel       = lazy(() => import('../panels/ChatPanel'));
const AutoPanel       = lazy(() => import('../panels/AutoPanel'));
const MemoryPanel     = lazy(() => import('../panels/MemoryPanel'));
const SettingsPanel   = lazy(() => import('../panels/SettingsPanel'));

// ─── Animation variants ──────────────────────────────────────────────────────

const panelVariants = {
  initial:  { opacity: 0, x: 40, filter: 'blur(6px)' },
  animate:  { opacity: 1, x: 0,  filter: 'blur(0px)' },
  exit:     { opacity: 0, x: 20, filter: 'blur(4px)' },
};

const panelTransition = {
  duration: 0.35,
  ease: [0.25, 0.1, 0.25, 1] as const,
};

// ─── Component ────────────────────────────────────────────────────────────────

interface PanelHostProps {
  mode: AppMode;
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
export default function PanelHost({ mode }: PanelHostProps) {
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
          >
            <Suspense fallback={null}>
              {mode === 'chat'     && <ChatPanel />}
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
