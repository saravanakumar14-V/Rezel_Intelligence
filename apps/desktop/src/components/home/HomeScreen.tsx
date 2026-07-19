import SpaceScene from "../scene/SpaceScene";

/**
 * HomeScreen
 *
 * The primary view rendered after the Genesis boot sequence completes.
 *
 * Currently mounts the full Cinematic Space Scene (Feature 2).
 * Future stages will overlay the HologramHUD and CommandOrb on top
 * of the 3D canvas using absolute-positioned React elements.
 *
 * Layout:
 *  - Outer container fills 100vw × 100vh, overflow hidden
 *  - SpaceScene is position:absolute inset-0 (fills the container)
 *  - HUD layers will sit above via z-index stacking (Stage 3)
 */
export default function HomeScreen() {
  return (
    <div
      className="relative w-screen h-screen overflow-hidden"
      style={{ background: "#02030A" }}
    >
      {/* Cinematic 3D space scene — fills the entire background */}
      <SpaceScene />
    </div>
  );
}