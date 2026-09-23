import { useState, useEffect } from 'react';
import { ChevronLeft, Activity } from 'lucide-react';
import {
  SpatialNavigationEngine,
} from '../../../lib/navigation/SpatialNavigationEngine';
import type {
  NavigationState,
  SpatialSpace,
} from '../../../lib/navigation/types';
import { cn } from '../../../lib/cn';
import styles from './ContextSpatialIndicator.module.css';

export default function ContextSpatialIndicator() {
  const [navState, setNavState] = useState<NavigationState>(() =>
    SpatialNavigationEngine.getState()
  );

  useEffect(() => {
    const unsub = SpatialNavigationEngine.subscribe((s) => {
      setNavState(s);
    });
    return () => unsub();
  }, []);

  const { currentSpace, currentSubContext, backgroundSpaces, canGoBack } = navState;

  if (currentSpace === 'CORE' && !currentSubContext && backgroundSpaces.length === 0) {
    return null;
  }

  const handleBack = () => {
    SpatialNavigationEngine.goBack();
  };

  const handleNavigate = (space: SpatialSpace) => {
    SpatialNavigationEngine.navigate(space);
  };

  return (
    <div
      className={styles.indicatorHost}
      role="navigation"
      aria-label="Spatial Context Trail"
    >
      {canGoBack && (
        <button
          type="button"
          onClick={handleBack}
          className={styles.backBtn}
          aria-label="Return to previous context"
        >
          <ChevronLeft size={12} />
        </button>
      )}

      <div className={styles.trailRow}>
        <button
          type="button"
          onClick={() => SpatialNavigationEngine.resetToCore()}
          className={cn(styles.nodeBtn, currentSpace === 'CORE' && styles.nodeActive)}
        >
          CORE
        </button>

        {currentSpace !== 'CORE' && (
          <>
            <span className={styles.chevron}>/</span>
            <button
              type="button"
              onClick={() => handleNavigate(currentSpace)}
              className={cn(styles.nodeBtn, !currentSubContext && styles.nodeActive)}
            >
              {currentSpace}
            </button>
          </>
        )}

        {currentSubContext && (
          <>
            <span className={styles.chevron}>/</span>
            <span className={cn(styles.nodeBtn, styles.nodeActive)}>
              {currentSubContext}
            </span>
          </>
        )}
      </div>

      {backgroundSpaces.length > 0 && (
        <div className="flex items-center gap-1">
          {backgroundSpaces.map((bgSpace) => (
            <button
              key={bgSpace}
              type="button"
              onClick={() => handleNavigate(bgSpace)}
              className={styles.bgPill}
              title={`Switch to active background task: ${bgSpace}`}
            >
              <span className="flex items-center gap-1">
                <Activity size={9} className="animate-pulse" />
                {bgSpace} ACTIVE
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
