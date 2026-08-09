import { motion } from "framer-motion";
import type { BootPhase } from "./BootScreen";

type Props = {
  children: React.ReactNode;
  phase: BootPhase;
};

export default function BootTransition({ children, phase }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      transition={{
        duration: 0.9,
        ease: "easeInOut",
      }}
      className="relative w-screen h-screen overflow-hidden bg-[#010103]"
      style={{ willChange: 'opacity, transform' }}
    >
      {/* Holographic grid slowly moving downwards */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(to right, #00E5FF 1px, transparent 1px), linear-gradient(to bottom, #00E5FF 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          animation: 'rezel-grid 15s linear infinite',
        }}
      />

      {/* Very subtle noise/CRT overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,#000_120%)] pointer-events-none z-20" />

      {/* CRT Scan Line (CSS Animation) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20 opacity-50">
        <div
          className="w-full h-[2px] bg-cyan-400/10 blur-[1px]"
          style={{ animation: 'rezel-scan 4s linear infinite' }}
        />
      </div>
      
      {/* Final transition flash when ready */}
      <div className={`absolute inset-0 bg-white z-30 transition-opacity duration-1000 pointer-events-none ${phase === "ready" ? "opacity-10" : "opacity-0"}`} />

      {children}
    </motion.div>
  );
}