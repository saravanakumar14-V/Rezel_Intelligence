import React, { useState, useEffect, useRef } from 'react';
import { MotionEngine } from '../../lib/motion/MotionEngine';
import { MotionDistances } from '../../lib/motion/MotionTokens';

export function GsapPresence({
  mode,
  children,
}: {
  mode: string;
  children: React.ReactNode;
}) {
  const [currentMode, setCurrentMode] = useState(mode);
  const [currentNode, setCurrentNode] = useState(children);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === currentMode) {
      setCurrentNode(children);
      return;
    }

    if (containerRef.current && currentNode !== null) {
      MotionEngine.animateExit(containerRef.current, {
        toX: MotionDistances.spatialShift,
        durationToken: 'fast',
        easeToken: 'in',
        onComplete: () => {
          setCurrentMode(mode);
          setCurrentNode(children);
          if (children !== null && containerRef.current) {
            MotionEngine.animateEntrance(containerRef.current, {
              fromX: MotionDistances.panelSlide,
              durationToken: 'standard',
              easeToken: 'out',
            });
          }
        },
      });
    } else {
      setCurrentMode(mode);
      setCurrentNode(children);
      if (children !== null && containerRef.current) {
        MotionEngine.animateEntrance(containerRef.current, {
          fromX: MotionDistances.panelSlide,
          durationToken: 'standard',
          easeToken: 'out',
        });
      }
    }
  }, [mode, children, currentMode, currentNode]);

  // Clean up only on component unmount from DOM
  useEffect(() => {
    return () => {
      if (containerRef.current) {
        MotionEngine.killTweens(containerRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      style={{ willChange: 'opacity, transform, filter' }}
    >
      {currentNode}
    </div>
  );
}
