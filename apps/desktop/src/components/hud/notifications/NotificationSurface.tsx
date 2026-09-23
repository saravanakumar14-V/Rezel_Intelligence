import { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  RefreshCw,
  Info,
  X,
} from 'lucide-react';
import {
  NotificationIntelligenceCenter,
} from '../../../lib/notifications/NotificationIntelligenceCenter';
import type {
  RezelNotificationEvent,
  EventSeverity,
} from '../../../lib/notifications/types';
import { cn } from '../../../lib/cn';
import styles from './NotificationSurface.module.css';

function getSeverityIcon(severity: EventSeverity) {
  switch (severity) {
    case 'SUCCESS':
      return <CheckCircle2 size={13} className="text-[#00E676] shrink-0" />;
    case 'WARNING':
    case 'ATTENTION':
      return <AlertTriangle size={13} className="text-[#FF9F1C] shrink-0" />;
    case 'RECOVERY':
      return <RefreshCw size={13} className="text-[#00E5FF] shrink-0 animate-spin" />;
    case 'ERROR':
    case 'CRITICAL':
      return <AlertOctagon size={13} className="text-[#FF5252] shrink-0" />;
    case 'INFO':
    case 'PROGRESS':
    case 'BACKGROUND':
    default:
      return <Info size={13} className="text-[#7ECFFF] shrink-0" />;
  }
}

export default function NotificationSurface() {
  const [transientEvent, setTransientEvent] = useState<RezelNotificationEvent | null>(() =>
    NotificationIntelligenceCenter.getActiveTransient()
  );
  const [persistentEvents, setPersistentEvents] = useState<RezelNotificationEvent[]>(() =>
    NotificationIntelligenceCenter.getPersistentAttention()
  );

  useEffect(() => {
    const unsub = NotificationIntelligenceCenter.subscribe(() => {
      setTransientEvent(NotificationIntelligenceCenter.getActiveTransient());
      setPersistentEvents(NotificationIntelligenceCenter.getPersistentAttention());
    });
    return () => unsub();
  }, []);

  const handleDismissTransient = () => {
    if (transientEvent) {
      NotificationIntelligenceCenter.dismiss(transientEvent.id);
    }
  };

  const handleDismissPersistent = (id: string) => {
    NotificationIntelligenceCenter.dismiss(id);
  };

  if (!transientEvent && persistentEvents.length === 0) {
    return null;
  }

  return (
    <div
      className={styles.surfaceContainer}
      role="region"
      aria-label="Unified Notifications and Events"
    >
      {/* ── Persistent Attention Items (Level 3 & 4) ─────────────────────────── */}
      {persistentEvents.map((evt) => {
        const severityClass = styles[`severity-${evt.severity.toLowerCase()}`];
        return (
          <div
            key={evt.id}
            className={cn(styles.persistentBanner, severityClass)}
            role="alert"
          >
            <div className={styles.bannerTitleRow}>
              <div className="flex items-center gap-1.5">
                {getSeverityIcon(evt.severity)}
                <span className={styles.capsuleTitle}>{evt.title}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={styles.timeText}>{evt.timeFormatted}</span>
                {evt.dismissible && (
                  <button
                    type="button"
                    onClick={() => handleDismissPersistent(evt.id)}
                    className="text-white/40 hover:text-white transition-colors"
                    aria-label="Dismiss notification"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            <span className={styles.capsuleSummary}>{evt.summary}</span>

            {evt.context?.resourcePath && (
              <div className="font-mono text-[8px] text-white/50 bg-black/40 px-2 py-1 rounded">
                Target: {evt.context.resourcePath}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Active Transient Capsule (Level 2) ───────────────────────────────── */}
      {transientEvent && (
        <div
          className={cn(
            styles.transientCapsule,
            styles[`severity-${transientEvent.severity.toLowerCase()}`]
          )}
          role="status"
          aria-live="polite"
        >
          <div className={styles.capsuleHeader}>
            <div className="flex items-center gap-1.5">
              {getSeverityIcon(transientEvent.severity)}
              <span className={styles.sourceBadge}>{transientEvent.source}</span>
              <span className={styles.capsuleTitle}>{transientEvent.title}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={styles.timeText}>{transientEvent.timeFormatted}</span>
              <button
                type="button"
                onClick={handleDismissTransient}
                className="text-white/40 hover:text-white transition-colors"
                aria-label="Dismiss transient notification"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          <span className={styles.capsuleSummary}>{transientEvent.summary}</span>
        </div>
      )}
    </div>
  );
}
