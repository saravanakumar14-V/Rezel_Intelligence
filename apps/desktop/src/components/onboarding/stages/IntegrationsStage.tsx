import React, { useEffect, useState } from 'react';
import { Box, Layers, CheckCircle2, AlertCircle, ChevronRight } from 'lucide-react';
import { RezelDirector } from '../../../lib/director/RezelDirector';
import styles from '../OnboardingHost.module.css';

interface StageProps {
  onAdvance: () => void;
  onSkip: () => void;
}

export const IntegrationsStage: React.FC<StageProps> = ({ onAdvance, onSkip }) => {
  const [activeSession, setActiveSession] = useState<{
    appId: string | null;
    status: string;
  }>({ appId: null, status: 'DISCONNECTED' });

  useEffect(() => {
    const session = RezelDirector.getApplicationSessionManager().getForegroundSession();
    if (session && session.connectionStatus === 'CONNECTED') {
      setActiveSession({ appId: session.appId, status: 'CONNECTED' });
    } else {
      setActiveSession({ appId: null, status: 'DISCONNECTED' });
    }
  }, []);

  return (
    <div className={styles.stageStandard}>
      <div className={styles.stageHeader}>
        <span className={styles.stageCategoryTag}>STAGE 06 · APPLICATION BRIDGES</span>
        <h1 className={styles.stageTitle}>Creative Tool Integrations</h1>
        <p className={styles.stageSubtitle}>
          Rezel connects to creative desktop applications (Blender, After Effects) via real-time local socket IPC on port 9090.
        </p>
      </div>

      <div className={styles.integrationsGrid}>
        <div className={styles.integrationCard}>
          <div className={styles.integrationCardTop}>
            <div className="flex items-center gap-2">
              <Box size={16} className="text-amber-400" />
              <span className={styles.integrationName}>Blender 3D Bridge</span>
            </div>
            <span className={activeSession.appId === 'blender' ? styles.statusConnectedPill : styles.statusPassivePill}>
              {activeSession.appId === 'blender' ? 'CONNECTED' : 'NOT CONNECTED'}
            </span>
          </div>
          <p className={styles.integrationDesc}>
            Inspect 3D viewport scenes, execute procedural geometry nodes, and animate cameras directly from Rezel natural language.
          </p>
        </div>

        <div className={styles.integrationCard}>
          <div className={styles.integrationCardTop}>
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-purple-400" />
              <span className={styles.integrationName}>Adobe After Effects</span>
            </div>
            <span className={activeSession.appId === 'aftereffects' ? styles.statusConnectedPill : styles.statusPassivePill}>
              {activeSession.appId === 'aftereffects' ? 'CONNECTED' : 'NOT CONNECTED'}
            </span>
          </div>
          <p className={styles.integrationDesc}>
            Inspect composition hierarchies, automate timeline keyframes, and trigger background render queues.
          </p>
        </div>
      </div>

      <div className={styles.integrationTip}>
        {activeSession.status === 'CONNECTED' ? (
          <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs">
            <CheckCircle2 size={13} />
            <span>Active session established with {activeSession.appId}.</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-slate-400 font-mono text-xs">
            <AlertCircle size={13} />
            <span>Integrations are optional. Launch your software with the Rezel plugin enabled whenever you wish to synchronize.</span>
          </div>
        )}
      </div>

      <div className={styles.stageActionDeck}>
        <button type="button" onClick={onSkip} className={styles.textGhostButton}>
          <span>SKIP APPLICATION BRIDGES</span>
        </button>

        <button type="button" onClick={onAdvance} className={styles.primaryActionButton}>
          <span>CONTINUE</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};
