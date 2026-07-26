import SpaceScene from "../scene/SpaceScene";
import HologramHUD from "../hud/HologramHUD";

/**
 * HomeScreen
 *
 * The primary view rendered after the Genesis boot sequence completes.
 *
 * Layout (stacking order):
 *  1. SpaceScene      — position:absolute inset-0, z-index 0 (R3F canvas)
 *  2. HologramHUD     — position:absolute inset-0, z-index 10 (glassmorphic overlay)
 *
 * HologramHUD uses pointer-events-none so mouse events fall through to
 * the canvas for the CameraController parallax effect.
 */
export default function HomeScreen() {
  return (
    <div
      className="relative w-screen h-screen overflow-hidden"
      style={{ background: "#02030A" }}
    >
      {/* Cinematic 3D space scene — fills the entire background */}
      <SpaceScene />

      {/* Glassmorphic HUD overlay — telemetry, clock, voice state */}
      <HologramHUD />
    </div>
  );
}