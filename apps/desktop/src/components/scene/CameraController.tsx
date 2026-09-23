import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  CAMERA_PRESETS,
  spatialCameraBus,
  type CameraPresetType,
} from "./spatialCameraState";

/**
 * CameraController
 *
 * Full 360° spatial camera rig for the Rezel QuantumCore.
 *
 * Features:
 *  - 360° continuous horizontal orbit (azimuth theta)
 *  - Controlled elevation range (polar phi clamped between 0.45 and PI - 0.45 rad)
 *  - Bounded distance zoom (radius 3.8 to 11.5 units)
 *  - Pointer drag (mouse, trackpad, touch) with momentum & inertia damping
 *  - Inactivity auto-recovery to subtle cinematic drift after 6 seconds of idle
 *  - Instant yield to user interaction
 *  - Camera presets (Default, System, Focus, Rear, Reset) with shortest-arc geodesic pathing
 *  - Global keyboard shortcuts (1-4, R, 0)
 *  - Respects prefers-reduced-motion
 */
export default function CameraController() {
  const { camera, gl } = useThree();

  // Current and Target Spherical Coordinates
  const currentSpherical = useRef(new THREE.Spherical(7.5, Math.PI * 0.5, 0.0));
  const targetSpherical  = useRef(new THREE.Spherical(7.5, Math.PI * 0.5, 0.0));
  const targetPos        = useRef(new THREE.Vector3());

  // Drag & Interaction Physics
  const isDragging      = useRef(false);
  const pointerStart    = useRef({ x: 0, y: 0 });
  const velocity        = useRef({ theta: 0, phi: 0 });
  const inactivityTimer = useRef(0); // seconds since user last interacted
  const isTransitioningPreset = useRef(false);

  // Reduced motion preference
  const prefersReducedMotion = useRef(false);

  // Setup Event Listeners & Preset Subscription
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.style.cursor = "grab";

    // Reduced motion check
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotion.current = mediaQuery.matches;
    const handleMotionChange = (e: MediaQueryListEvent) => {
      prefersReducedMotion.current = e.matches;
    };
    mediaQuery.addEventListener("change", handleMotionChange);

    // Pointer Down
    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      isDragging.current = true;
      isTransitioningPreset.current = false;
      inactivityTimer.current = 0;
      pointerStart.current = { x: e.clientX, y: e.clientY };
      velocity.current = { theta: 0, phi: 0 };
      canvas.style.cursor = "grabbing";
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        // Fallback
      }
    };

    // Pointer Move
    const handlePointerMove = (e: PointerEvent) => {
      if (!isDragging.current) return;
      inactivityTimer.current = 0;

      const dx = e.clientX - pointerStart.current.x;
      const dy = e.clientY - pointerStart.current.y;
      pointerStart.current = { x: e.clientX, y: e.clientY };

      const sensitivity = 0.0055;
      const dTheta = -dx * sensitivity;
      const dPhi   = -dy * sensitivity;

      targetSpherical.current.theta += dTheta;
      targetSpherical.current.phi = THREE.MathUtils.clamp(
        targetSpherical.current.phi + dPhi,
        0.45,
        Math.PI - 0.45
      );

      velocity.current = {
        theta: dTheta * 0.85,
        phi: dPhi * 0.85,
      };
    };

    // Pointer Up / Cancel
    const handlePointerUp = (e: PointerEvent) => {
      if (!isDragging.current) return;
      isDragging.current = false;
      canvas.style.cursor = "grab";
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // Fallback
      }
    };

    // Wheel Zoom
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      inactivityTimer.current = 0;
      isTransitioningPreset.current = false;

      const zoomSpeed = 0.0035;
      targetSpherical.current.radius = THREE.MathUtils.clamp(
        targetSpherical.current.radius + e.deltaY * zoomSpeed,
        3.8,
        11.5
      );
    };

    // Global Keyboard Shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (
        activeTag === 'input' ||
        activeTag === 'textarea' ||
        document.activeElement?.getAttribute('contenteditable') === 'true'
      ) {
        return;
      }

      if (e.key === 'r' || e.key === 'R' || e.key === '0' || e.code === 'KeyR' || e.code === 'Digit0' || e.code === 'Numpad0') {
        spatialCameraBus.setPreset('RESET');
      } else if (e.key === '1' || e.code === 'Digit1' || e.code === 'Numpad1') {
        spatialCameraBus.setPreset('DEFAULT');
      } else if (e.key === '2' || e.code === 'Digit2' || e.code === 'Numpad2') {
        spatialCameraBus.setPreset('SYSTEM');
      } else if (e.key === '3' || e.code === 'Digit3' || e.code === 'Numpad3') {
        spatialCameraBus.setPreset('FOCUS');
      } else if (e.key === '4' || e.code === 'Digit4' || e.code === 'Numpad4') {
        spatialCameraBus.setPreset('REAR');
      }
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", handlePointerUp);
    canvas.addEventListener("pointercancel", handlePointerUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeyDown);

    // Preset Subscription
    const unsubPreset = spatialCameraBus.subscribePreset((preset: CameraPresetType) => {
      const config = CAMERA_PRESETS[preset] || CAMERA_PRESETS.DEFAULT;
      
      // Calculate shortest angular arc on theta
      const currentTheta = currentSpherical.current.theta;
      const targetCanonicalTheta = config.theta;
      
      let deltaTheta = ((targetCanonicalTheta - (currentTheta % (Math.PI * 2))) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      targetSpherical.current.theta = currentTheta + deltaTheta;
      targetSpherical.current.phi = config.phi;
      targetSpherical.current.radius = config.radius;

      isTransitioningPreset.current = true;
      inactivityTimer.current = 0;
      velocity.current = { theta: 0, phi: 0 };
    });

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      canvas.removeEventListener("wheel", handleWheel);
      window.removeEventListener("keydown", handleKeyDown);
      mediaQuery.removeEventListener("change", handleMotionChange);
      unsubPreset();
    };
  }, [gl.domElement]);

  useFrame((_, delta) => {
    // 1. Inertia handling when released
    if (!isDragging.current && !isTransitioningPreset.current) {
      if (Math.abs(velocity.current.theta) > 0.0001 || Math.abs(velocity.current.phi) > 0.0001) {
        targetSpherical.current.theta += velocity.current.theta;
        targetSpherical.current.phi = THREE.MathUtils.clamp(
          targetSpherical.current.phi + velocity.current.phi,
          0.45,
          Math.PI - 0.45
        );

        // Inertia damping
        velocity.current.theta *= 0.92;
        velocity.current.phi *= 0.92;
      }
    }

    // 2. Inactivity Tracking & Cinematic Drift
    if (!isDragging.current) {
      inactivityTimer.current += delta;

      // Resume gentle cinematic drift after 6 seconds of idle (unless reduced-motion)
      if (inactivityTimer.current >= 6.0 && !prefersReducedMotion.current) {
        targetSpherical.current.theta += delta * 0.035; // Gentle majestic orbit
      }
    }

    // 3. Smooth Damped Interpolation toward Target Coordinates
    const lerpFactor = isTransitioningPreset.current ? Math.min(1.0, delta * 4.5) : Math.min(1.0, delta * 8.0);

    currentSpherical.current.theta += (targetSpherical.current.theta - currentSpherical.current.theta) * lerpFactor;
    currentSpherical.current.phi += (targetSpherical.current.phi - currentSpherical.current.phi) * lerpFactor;
    currentSpherical.current.radius += (targetSpherical.current.radius - currentSpherical.current.radius) * lerpFactor;

    // Check if preset transition finished
    if (
      isTransitioningPreset.current &&
      Math.abs(targetSpherical.current.theta - currentSpherical.current.theta) < 0.01 &&
      Math.abs(targetSpherical.current.phi - currentSpherical.current.phi) < 0.01 &&
      Math.abs(targetSpherical.current.radius - currentSpherical.current.radius) < 0.05
    ) {
      isTransitioningPreset.current = false;
    }

    // 4. Convert Spherical to Cartesian Coordinates
    targetPos.current.setFromSpherical(currentSpherical.current);

    // Apply to camera position
    camera.position.copy(targetPos.current);
    camera.lookAt(0, 0, 0);

    // 5. Notify HUD bus of live angle periodically
    const azimuthDeg = Math.round(((currentSpherical.current.theta * (180 / Math.PI)) % 360 + 360) % 360);
    const elevationDeg = Math.round(90 - (currentSpherical.current.phi * (180 / Math.PI)));
    const distance = Math.round(currentSpherical.current.radius * 10) / 10;

    spatialCameraBus.notifyAngle(azimuthDeg, elevationDeg, distance);
  });

  return null;
}
