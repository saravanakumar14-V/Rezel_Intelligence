import { useEffect, useState, useRef } from 'react';
import gsap from 'gsap';
import type { BootPhase } from './BootScreen';

const TARGET = 'REZEL';
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*X';

type Props = {
  phase: BootPhase;
};

export default function BootLogo({ phase }: Props) {
  const [text, setText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const maxFrames = 40; 
    let timer: number;
    
    const scramble = () => {
      let nextStr = '';
      for (let i = 0; i < TARGET.length; i++) {
        if (frame >= maxFrames || frame > i * (maxFrames / TARGET.length)) {
          nextStr += TARGET[i];
        } else {
          nextStr += CHARS[Math.floor(Math.random() * CHARS.length)];
        }
      }
      setText(nextStr);
      
      if (frame < maxFrames) {
        frame++;
        timer = requestAnimationFrame(scramble);
      }
    };
    
    timer = requestAnimationFrame(scramble);
    return () => cancelAnimationFrame(timer);
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(containerRef.current, 
        { opacity: 0, scale: 0.95 },
        { opacity: 1, scale: 1, duration: 1.5, ease: 'power2.out' }
      );
    }
  }, []);

  const coreScale = phase === 'initializing' ? 'scale-75 opacity-20' : phase === 'connecting' ? 'scale-100 opacity-50' : 'scale-125 opacity-100';
  const corePulse = phase === 'connecting' ? 'animate-[pulse_1.5s_ease-in-out_infinite]' : '';

  return (
    <div className="relative flex items-center justify-center">
      <div 
        className={`absolute w-64 h-64 rounded-full blur-[80px] bg-cyan-400/30 transition-all duration-1000 ease-in-out ${coreScale} ${corePulse}`} 
      />
      <div 
        className={`absolute w-16 h-16 rounded-full blur-[20px] bg-white/20 transition-all duration-1000 ease-in-out ${coreScale}`} 
      />

      <div ref={containerRef} className="relative z-10">
        <h1
          className={`text-7xl font-bold tracking-[0.75rem] font-mono transition-colors duration-1000 ${phase === 'ready' ? 'text-white' : 'text-cyan-400'}`}
          style={{
            textShadow: phase === 'ready' ? '0 0 40px #00E5FF, 0 0 80px #00E5FF' : '0 0 25px #00E5FF',
          }}
        >
          {text || '     '}
        </h1>
      </div>
    </div>
  );
}
