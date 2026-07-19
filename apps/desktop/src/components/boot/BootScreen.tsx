import { useEffect, useRef, useState } from "react";
import BootLogo from "./BootLogo";
import BootMessages from "./BootMessages";
import BootProgress from "./BootProgress";
import BootTransition from "./BootTransition";
import HomeScreen from "../home/HomeScreen";

const MESSAGES = [
  "Initializing Kernel...",
  "Loading Memory...",
  "Starting Intelligence...",
  "Connecting Modules...",
  "Preparing Interface...",
  "WELCOME.",
] as const;

const STEP_INTERVAL_MS  = 120;  // ms per progress tick (+2%)
const COMPLETE_DELAY_MS = 800;  // ms pause at 100% before transition

/**
 * BootScreen
 *
 * Drives the Genesis boot sequence then unmounts itself, handing
 * control to HomeScreen. Uses a single interval (no double effect)
 * by tracking the current message index via a ref rather than state,
 * which avoids the stale-closure problem and prevents the interval
 * from being restarted every time the index changes.
 */
export default function BootScreen() {
  const [progress, setProgress]         = useState<number>(0);
  const [messageIdx, setMessageIdx]     = useState<number>(0);
  const [bootComplete, setBootComplete] = useState<boolean>(false);

  // Ref-tracked index avoids re-registering the interval on every change
  const idxRef = useRef<number>(0);

  // Single boot progress interval
  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + 2;

        // Advance message at each 20% threshold
        const threshold = Math.floor(next / 20);
        if (threshold > idxRef.current && idxRef.current < MESSAGES.length - 1) {
          idxRef.current = threshold;
          setMessageIdx(threshold);
        }

        if (next >= 100) {
          clearInterval(timer);
          return 100;
        }

        return next;
      });
    }, STEP_INTERVAL_MS);

    return () => clearInterval(timer);
  // Empty deps — run once on mount, progress is managed inside the callback
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Transition to HomeScreen after a short pause at 100%
  useEffect(() => {
    if (progress < 100) return;
    const timer = setTimeout(() => setBootComplete(true), COMPLETE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [progress]);

  if (bootComplete) {
    return <HomeScreen />;
  }

  return (
    <BootTransition>
      <div className="w-screen h-screen bg-[#02030A] flex flex-col items-center justify-center">
        <BootLogo />
        <BootMessages message={MESSAGES[messageIdx]} />
        <BootProgress progress={progress} />
      </div>
    </BootTransition>
  );
}