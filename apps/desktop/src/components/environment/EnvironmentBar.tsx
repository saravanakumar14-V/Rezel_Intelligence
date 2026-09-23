import { useEffect, useState } from 'react';
import ActiveProviderBadge from '../hud/ActiveProviderBadge';
import { RezelDirector, type DirectorEvent } from '../../lib/director/RezelDirector';
import type { InspectorId } from '../../types/navigation';
import { cn } from '../../lib/cn';
import styles from './EnvironmentBar.module.css';

const REZEL_VERSION = 'v0.1.0-dev';

export interface EnvironmentBarProps {
  onOpenInspector?: (id: InspectorId) => void;
  className?: string;
}

export default function EnvironmentBar({ onOpenInspector, className }: EnvironmentBarProps) {
  const [timeStr, setTimeStr] = useState('');
  const [activeApp, setActiveApp] = useState<string | null>(null);

  // Live Monospace Clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTimeStr(
        now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Subscriptions for active application sessions
  useEffect(() => {
    const session = RezelDirector.getApplicationSessionManager().getForegroundSession();
    if (session?.connectionStatus === 'CONNECTED') {
      setActiveApp(session.appId);
    }

    const handler = (event: DirectorEvent) => {
      if (event.type === 'application_changed') {
        const app =
          event.payload?.session?.appId ||
          event.payload?.activeApplication?.appId ||
          (typeof event.payload === 'string' ? event.payload : null);
        setActiveApp(app);
      }
    };

    RezelDirector.subscribe(handler);
    return () => RezelDirector.unsubscribe(handler);
  }, []);

  return (
    <header className={cn(styles.topBar, className)} role="banner">
      {/* Left: Brand Node, Version, and Connected App */}
      <div className={styles.leftSection}>
        <div className={styles.brandGroup}>
          <div className={styles.brandDot} aria-hidden="true" />
          <span className={styles.brandName}>REZEL</span>
          <span className={styles.versionBadge}>{REZEL_VERSION}</span>
        </div>

        {activeApp && (
          <button
            type="button"
            onClick={() => onOpenInspector?.('workflow')}
            className={styles.appSessionPill}
            title={`Connected to ${activeApp}. Click to view Automation workspace.`}
          >
            <span className={styles.statusDotGreen} />
            <span>{activeApp.toUpperCase()} · CONNECTED</span>
          </button>
        )}
      </div>

      {/* Right: Active Provider & Live Clock */}
      <div className={styles.rightSection}>
        <div
          onClick={() => onOpenInspector?.('providers')}
          className="cursor-pointer"
          title="Click to view Provider & Model Network"
        >
          <ActiveProviderBadge />
        </div>

        <span className={styles.clock} aria-label={`Current system time ${timeStr}`}>
          {timeStr}
        </span>
      </div>

      {/* Top Hairline Accent */}
      <div className={styles.topHairline} aria-hidden="true" />
    </header>
  );
}
