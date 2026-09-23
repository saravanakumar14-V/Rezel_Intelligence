import React, { useEffect, useRef } from 'react';
import type {
  SpatialSurfaceNode,
  SpatialSurfaceState,
} from '../../lib/navigation/SpatialSurfaceRegistry';
import { SpatialSurface } from './SpatialSurface';
import { cn } from '../../lib/cn';
import styles from './SurfaceStack.module.css';

export interface SurfaceStackProps {
  activeLineage: SpatialSurfaceNode[];
  onSelectAction: (targetSurfaceId: string) => void;
  onCloseSurface: (index: number) => void;
  onFocusSurface: (index: number) => void;
  className?: string;
}

export const SurfaceStack: React.FC<SurfaceStackProps> = ({
  activeLineage,
  onSelectAction,
  onCloseSurface,
  onFocusSurface,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest/rightmost spawned surface smoothly
  useEffect(() => {
    if (containerRef.current && activeLineage.length > 0) {
      containerRef.current.scrollTo({
        left: containerRef.current.scrollWidth,
        behavior: 'smooth',
      });
    }
  }, [activeLineage.length]);

  if (activeLineage.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className={cn(styles.surfaceStackTrack, className)}
      role="region"
      aria-label="Spawned Spatial Surfaces"
      onClick={(e) => e.stopPropagation()}
    >
      {activeLineage.map((node, index) => {
        const isCurrent = index === activeLineage.length - 1;
        const depth = node.depth;

        // Determine surface lifecycle state
        let state: SpatialSurfaceState = 'active';
        if (!isCurrent) {
          state = 'background';
        }

        return (
          <SpatialSurface
            key={`${node.capabilityId}-${node.id}-${depth}`}
            surface={node.definition}
            state={state}
            isCurrent={isCurrent}
            depth={depth}
            onSelectAction={onSelectAction}
            onClose={() => onCloseSurface(index)}
            onFocus={() => onFocusSurface(index)}
          />
        );
      })}
    </div>
  );
};
