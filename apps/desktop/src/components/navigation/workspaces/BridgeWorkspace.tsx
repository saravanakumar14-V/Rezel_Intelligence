import React, { useState, useEffect } from 'react';
import { Box, Activity, AlertCircle, CheckCircle2 } from 'lucide-react';
import { RezelDirector } from '../../../lib/director/RezelDirector';
import styles from '../SpatialSurface.module.css';

interface BridgeWorkspaceProps {
  appName?: 'Blender' | 'After Effects' | string;
}

export const BridgeWorkspace: React.FC<BridgeWorkspaceProps> = ({ appName = 'Blender' }) => {
  const [bridgeAppSession, setBridgeAppSession] = useState<{
    appId: string | null;
    status: string;
  }>({ appId: null, status: 'DISCONNECTED' });

  useEffect(() => {
    const session = RezelDirector.getApplicationSessionManager().getForegroundSession();
    if (session && session.connectionStatus === 'CONNECTED') {
      setBridgeAppSession({ appId: session.appId, status: 'CONNECTED' });
    } else {
      setBridgeAppSession({ appId: null, status: 'DISCONNECTED' });
    }
  }, []);

  const isConnected = bridgeAppSession.status === 'CONNECTED';

  return (
    <div className="flex flex-col h-full w-full p-3 gap-3">
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#040C24]/80 border border-white/10">
        <Box size={14} className={isConnected ? 'text-emerald-400' : 'text-amber-400'} />
        <span className="font-mono text-[10px] tracking-wider uppercase font-bold text-white">
          {appName.toUpperCase()} BRIDGE: {isConnected ? `CONNECTED (${bridgeAppSession.appId})` : 'NOT CONNECTED'}
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-center items-center text-center p-6 rounded-xl bg-[#060B1E]/60 border border-white/5 gap-3">
        {isConnected ? (
          <>
            <CheckCircle2 size={32} className="text-emerald-400" />
            <span className="font-mono text-xs text-emerald-300 font-bold uppercase tracking-wider">
              Live Session Active
            </span>
            <p className="font-sans text-xs text-slate-300 max-w-[320px]">
              Live IPC session established with {bridgeAppSession.appId}. You can stream 3D scene parameters and execute creative macros.
            </p>
          </>
        ) : (
          <>
            <AlertCircle size={32} className="text-amber-400/80" />
            <span className="font-mono text-xs text-amber-300 font-bold uppercase tracking-wider">
              Bridge Inactive
            </span>
            <p className="font-sans text-xs text-slate-400 max-w-[340px]">
              Rezel could not reach the local bridge socket on port 9090. Launch <strong>{appName}</strong> with the Rezel Bridge plugin installed to enable automation and scene sync.
            </p>
          </>
        )}
      </div>

      <div className="flex justify-end shrink-0">
        <button
          type="button"
          className={styles.executeButton}
          disabled={!isConnected}
          title={!isConnected ? 'Bridge disconnected. Launch app to connect.' : 'Synchronize scene'}
        >
          <Activity size={12} />
          <span>{isConnected ? 'SYNC SCENE' : 'BRIDGE DISCONNECTED'}</span>
        </button>
      </div>
    </div>
  );
};

