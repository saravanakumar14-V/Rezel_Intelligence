import { useState, useEffect } from 'react';
import {
  Activity,
  DownloadCloud,
  Brain,
  Layers,
  AlertTriangle,
  Play,
} from 'lucide-react';
import {
  AdaptiveWorkspaceManager,
} from '../../../lib/workspace/multi-context/AdaptiveWorkspaceManager';
import type {
  RezelActiveContext,
  ContextType,
} from '../../../lib/workspace/multi-context/types';
import { cn } from '../../../lib/cn';
import styles from './WorkspaceContextPill.module.css';

function getContextIcon(type: ContextType) {
  switch (type) {
    case 'WORKFLOW':
      return <Layers size={11} className={styles.statusIcon} />;
    case 'MODEL_DOWNLOAD':
      return <DownloadCloud size={11} className={styles.statusIcon} />;
    case 'KNOWLEDGE_INDEX':
      return <Brain size={11} className={styles.statusIcon} />;
    case 'AUTOMATION':
      return <Play size={11} className={styles.statusIcon} />;
    default:
      return <Activity size={11} className={styles.statusIcon} />;
  }
}

export default function WorkspaceContextPill() {
  const [backgroundContexts, setBackgroundContexts] = useState<RezelActiveContext[]>(() =>
    AdaptiveWorkspaceManager.getBackgroundContexts()
  );

  useEffect(() => {
    const unsub = AdaptiveWorkspaceManager.subscribe(() => {
      setBackgroundContexts(AdaptiveWorkspaceManager.getBackgroundContexts());
    });
    return () => unsub();
  }, []);

  if (backgroundContexts.length === 0) {
    return null;
  }

  const handleFocus = (id: string) => {
    AdaptiveWorkspaceManager.focusContext(id);
  };

  return (
    <div
      className={styles.pillContainer}
      role="region"
      aria-label="Active Background Contexts"
    >
      {backgroundContexts.map((ctx) => {
        const isAttention = ctx.status === 'ATTENTION' || ctx.status === 'BLOCKED';
        return (
          <button
            key={ctx.id}
            type="button"
            onClick={() => handleFocus(ctx.id)}
            className={cn(styles.contextPill, isAttention && styles.pillAttention)}
            aria-label={`Switch focus to ${ctx.title}`}
          >
            {isAttention ? (
              <AlertTriangle size={11} className="text-[#FF9F1C] shrink-0" />
            ) : (
              getContextIcon(ctx.type)
            )}
            <span>{ctx.title}</span>
            {typeof ctx.progress === 'number' && (
              <span className={styles.progressText}>{Math.round(ctx.progress)}%</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
