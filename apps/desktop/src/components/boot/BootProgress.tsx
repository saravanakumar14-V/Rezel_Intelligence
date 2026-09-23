import type { BootPhase } from "./BootScreen";

type Props = {
  progress: number;
  phase: BootPhase;
};

export default function BootProgress({ progress, phase }: Props) {
  const renderBlocks = (target: number, current: number) => {
    // 10 blocks total for the sequence
    const filled = Math.min(10, Math.floor((current / target) * 10));
    const blocks = "█".repeat(Math.max(0, filled)) + "░".repeat(Math.max(0, 10 - filled));
    return blocks;
  };

  return (
    <div className="w-[340px] mt-8 font-mono flex flex-col gap-3 text-cyan-500/70 text-[10px] tracking-widest relative z-10 px-4">
      
      <div className="flex justify-between items-center">
        <span>CORE INITIALIZATION</span>
        <span className={progress >= 40 ? "text-cyan-300" : ""}>{progress >= 40 ? "READY" : renderBlocks(40, progress)}</span>
      </div>

      <div className="flex justify-between items-center">
        <span>MEMORY MATRIX</span>
        <span className={progress >= 85 ? "text-cyan-300" : ""}>{progress >= 85 ? "READY" : progress >= 40 ? renderBlocks(45, progress - 40) : "STANDBY"}</span>
      </div>

      <div className="flex justify-between items-center">
        <span>CONSCIOUSNESS</span>
        <span className={phase === "ready" ? "text-cyan-100 font-bold" : ""}>{phase === "ready" ? "ACTIVE" : "STANDBY"}</span>
      </div>

      {/* Decorative HUD brackets */}
      <div className="absolute left-0 top-0 bottom-0 w-1 border-l border-y border-cyan-500/30 opacity-50" />
      <div className="absolute right-0 top-0 bottom-0 w-1 border-r border-y border-cyan-500/30 opacity-50" />
    </div>
  );
}