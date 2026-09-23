type Props = {
  messages: string[];
};

export default function BootMessages({ messages }: Props) {
  return (
    <div className="mt-8 font-mono text-[11px] w-[340px] h-[72px] overflow-hidden flex flex-col justify-end text-cyan-200/50 tracking-wide text-left relative z-10">
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-transparent to-[#010103] z-10" />
      <div className="flex flex-col gap-1 z-0 pb-1">
        {messages.map((msg, i) => {
          const isLast = i === messages.length - 1;
          return (
            <div key={i} className={`flex transition-opacity duration-300 ${isLast ? 'text-cyan-300/80 font-medium' : 'opacity-40'}`}>
              <span>{msg}</span>
              {isLast && (
                <span className="w-[6px] h-[14px] bg-cyan-400 ml-1.5 opacity-70 animate-[pulse_0.75s_step-end_infinite]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}