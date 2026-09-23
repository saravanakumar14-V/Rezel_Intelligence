import React from 'react';
import { Mic, Clock } from 'lucide-react';
import type { SpatialSurfaceDefinition } from '../../../lib/navigation/SpatialSurfaceRegistry';

interface GenericFallbackWorkspaceProps {
  surface: SpatialSurfaceDefinition;
}

export const GenericFallbackWorkspace: React.FC<GenericFallbackWorkspaceProps> = ({ surface }) => {
  const isVoice = surface.taskType === 'voice-room' || surface.id.includes('voice');

  return (
    <div className="flex flex-col items-center justify-center h-full w-full min-h-[320px] p-6 text-center gap-3 bg-[#060B1E]/60 border border-white/5 rounded-xl">
      {isVoice ? (
        <>
          <Mic size={32} className="text-cyan-400/80 animate-pulse" />
          <span className="font-mono text-xs text-cyan-300 font-bold uppercase tracking-wider">
            Live Voice Stream Studio
          </span>
          <p className="font-sans text-xs text-slate-300 max-w-[340px]">
            Live bidirectional voice conversations stream through the Web Audio engine. Connect your microphone to interact. Voice input is also synchronized globally via the HUD.
          </p>
          <div className="flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-mono text-[10px]">
            <span>● AUDIO HARDWARE ENGINE READY</span>
          </div>
        </>
      ) : (
        <>
          <Clock size={32} className="text-purple-400/60" />
          <span className="font-mono text-xs text-purple-300 font-bold uppercase tracking-wider">
            Upcoming Capability
          </span>
          <p className="font-sans text-xs text-slate-400 max-w-[320px]">
            {surface.description}
          </p>
          <div className="flex items-center gap-1.5 mt-2 px-3 py-1 rounded bg-white/5 border border-white/10 text-slate-400 font-mono text-[9px] uppercase tracking-wider">
            <span>PLANNED FOR ROADMAP MILESTONE</span>
          </div>
        </>
      )}
    </div>
  );
};
