type Props = {
  progress: number;
};

export default function BootProgress({ progress }: Props) {
  return (
    <div className="w-[420px] h-2 bg-white/10 rounded-full overflow-hidden mt-10">
      <div
        className="h-full bg-cyan-400 transition-all duration-300"
        style={{
          width: `${progress}%`,
          boxShadow: "0 0 20px #00E5FF",
        }}
      />
    </div>
  );
}