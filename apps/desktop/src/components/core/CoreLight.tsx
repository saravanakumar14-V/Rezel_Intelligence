/**
 * CoreLight
 *
 * Provides all lighting for the Rezel space scene.
 * - Soft ambient fill (near-black space)
 * - Cyan point light at core origin (primary glow)
 * - Quantum purple hemisphere light for atmosphere
 * - Directional rim light for edge separation
 */
export default function CoreLight() {
  return (
    <>
      {/* Space ambient — very dark to keep the void feel */}
      <ambientLight intensity={0.08} color="#0A0A1A" />

      {/* Cyan quantum core glow — centred at origin */}
      <pointLight
        position={[0, 0, 0]}
        intensity={80}
        distance={18}
        decay={2}
        color="#00E5FF"
      />

      {/* Quantum purple secondary fill */}
      <pointLight
        position={[0, 3, -4]}
        intensity={30}
        distance={12}
        decay={2}
        color="#7A5CFF"
      />

      {/* Hemisphere light — sky / ground colour split for realism */}
      <hemisphereLight
        args={["#0D1B2A", "#000000", 0.15]}
      />

      {/* Rim / back light — separates objects from background */}
      <directionalLight
        position={[-6, 4, -8]}
        intensity={0.6}
        color="#00BFFF"
      />
    </>
  );
}
