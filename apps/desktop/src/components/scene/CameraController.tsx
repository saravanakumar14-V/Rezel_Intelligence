import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * CameraController
 *
 * Mouse-reactive parallax camera rig for the Rezel space scene.
 *
 * The camera rests at [0, 0, 8] and drifts gently toward an offset
 * determined by normalised mouse position. Motion is smoothed with
 * a per-frame lerp (factor 0.04).
 *
 * Constraints:
 *  - X offset: ±1.2 units
 *  - Y offset: ±0.8 units  (inverted Y so moving mouse up tilts up)
 *  - Zoom: fixed (no scroll zoom)
 *  - Camera always looks at world origin
 *
 * Performance:
 *  - Mouse Vector2 and target Vector3 allocated once via useRef
 *  - No new object creation inside useFrame or the event listener
 *  - Event listener is cleaned up on unmount
 */
export default function CameraController() {
  const { camera, gl } = useThree();

  const mouse  = useRef<THREE.Vector2>(new THREE.Vector2(0, 0));
  const target = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));

  // Attach mouse listener to the canvas and clean up on unmount
  useEffect(() => {
    const canvas = gl.domElement;

    const handleMouseMove = (e: MouseEvent) => {
      mouse.current.x =  (e.clientX / window.innerWidth)  * 2 - 1;
      mouse.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    return () => {
      canvas.removeEventListener("mousemove", handleMouseMove);
    };
  }, [gl.domElement]);

  useFrame(() => {
    // Map normalised mouse [-1, 1] to camera offset range
    target.current.x =  mouse.current.x * 1.2;
    target.current.y =  mouse.current.y * 0.8;

    // Lerp toward target — no allocations
    camera.position.x += (target.current.x - camera.position.x) * 0.04;
    camera.position.y += (target.current.y - camera.position.y) * 0.04;

    // Keep the camera always looking at the core
    camera.lookAt(0, 0, 0);
  });

  return null;
}
