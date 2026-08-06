import { useState, useEffect, useCallback } from 'react';
import SpaceScene from '../scene/SpaceScene';
import HologramHUD from '../hud/HologramHUD';
import PermissionConfirmModal from '../hud/PermissionConfirmModal';
import {
  setApprovalHandler,
  resolveApproval,
  type ApprovalRequest,
} from '../../lib/security/ToolExecutor';

/**
 * HomeScreen
 *
 * Primary view rendered after the Genesis boot sequence.
 *
 * Stacking order (back → front):
 *  z-auto  — SpaceScene       (R3F Canvas, fills background)
 *  z-10    — HologramHUD      (glassmorphic overlay, pointer-events-none)
 *  z-50    — PermissionConfirmModal  (only when a tool needs approval)
 *
 * Security integration:
 *  - Registers setApprovalHandler on mount so ToolExecutor can surface
 *    the confirmation dialog to the user.
 *  - resolveApproval(id, approved) is called when the user decides.
 *  - Handler is deregistered on unmount (pass null).
 */
export default function HomeScreen() {
  const [pendingApproval, setPendingApproval] = useState<ApprovalRequest | null>(null);

  // Register the ToolExecutor approval channel
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

  return (
    <div
      className="relative w-screen h-screen overflow-hidden"
      style={{ background: '#02030A' }}
    >
      {/* Cinematic 3D space scene — fills the entire background */}
      <SpaceScene />

      {/* Glassmorphic HUD overlay — telemetry, clock, voice state */}
      <HologramHUD />

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