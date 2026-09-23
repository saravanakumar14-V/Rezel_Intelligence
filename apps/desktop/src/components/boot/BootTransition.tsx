import type { BootPhase } from "./BootScreen";

type Props = {
  children: React.ReactNode;
  phase: BootPhase;
};

export default function BootTransition({ children, phase }: Props) {
  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-[#010103]"
      style={{ willChange: 'opacity, transform' }}
    >
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(to right, #00E5FF 1px, transparent 1px), linear-gradient(to bottom, #00E5FF 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          animation: 'rezel-grid 15s linear infinite',
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,#000_120%)] pointer-events-none z-20" />
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-20 opacity-50">
        <div
          className="w-full h-[2px] bg-cyan-400/10 blur-[1px]"
          style={{ animation: 'rezel-scan 4s linear infinite' }}
        />
      </div>
      <div className={`absolute inset-0 bg-white z-30 transition-opacity duration-1000 pointer-events-none ${phase === "ready" ? "opacity-10" : "opacity-0"}`} />
      {children}
    </div>
  );
}
