import { useEffect, useState } from "react";
import BootLogo from "./BootLogo";
import BootTransition from "./BootTransition";
import HomeScreen from "../home/HomeScreen";
import { OnboardingHost } from "../onboarding/OnboardingHost";
import { OnboardingCoordinator } from "../../lib/onboarding/OnboardingCoordinator";

export type BootPhase = "initializing" | "connecting" | "ready";

export default function BootScreen() {
  const [bootComplete, setBootComplete] = useState<boolean>(false);
  const [phase, setPhase] = useState<BootPhase>("initializing");
  const [isFirstLaunch, setIsFirstLaunch] = useState<boolean>(false);
  const [onboardingFinished, setOnboardingFinished] = useState<boolean>(false);

  useEffect(() => {
    // Initialize onboarding state in parallel with boot phase
    OnboardingCoordinator.initialize().then(() => {
      setIsFirstLaunch(OnboardingCoordinator.isFirstLaunch());
    });

    const connectTimer = setTimeout(() => {
      setPhase("connecting");
    }, 180);

    const readyTimer = setTimeout(() => {
      setPhase("ready");
    }, 380);

    const completeTimer = setTimeout(() => {
      setBootComplete(true);
    }, 550);

    return () => {
      clearTimeout(connectTimer);
      clearTimeout(readyTimer);
      clearTimeout(completeTimer);
    };
  }, []);

  const shouldShowOnboarding = bootComplete && isFirstLaunch && !onboardingFinished;

  if (!bootComplete) {
    return (
      <BootTransition phase={phase}>
        <div className="w-full h-full bg-transparent flex flex-col items-center justify-center relative z-10 pointer-events-none">
          <BootLogo phase={phase} />
          <div className="mt-4 flex items-center gap-2 font-mono text-[9px] tracking-widest text-[#00E5FF]/70 uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00E5FF] animate-pulse" />
            <span>Awakening Quantum Core...</span>
          </div>
        </div>
      </BootTransition>
    );
  }

  if (shouldShowOnboarding) {
    return (
      <OnboardingHost
        onComplete={() => {
          setOnboardingFinished(true);
          setIsFirstLaunch(false);
        }}
      />
    );
  }

  return <HomeScreen />;
}
