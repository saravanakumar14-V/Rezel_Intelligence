import React, { createContext, useContext, useState, useEffect } from 'react';

export type QualityLevel = 'LOW' | 'MED' | 'HIGH' | 'ULTRA';

interface HardwareContextState {
  quality: QualityLevel;
  setQuality: (q: QualityLevel) => void;
  devicePixelRatio: number;
}

const HardwareContext = createContext<HardwareContextState | undefined>(undefined);

export function HardwareProvider({ children }: { children: React.ReactNode }) {
  const [quality, setQuality] = useState<QualityLevel>('MED');
  const [dpr, setDpr] = useState(1);

  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio || 1, 2));

    // Simple heuristic for hardware quality
    const determineQuality = () => {
      const cores = navigator.hardwareConcurrency || 4;
      if (cores <= 4) return 'LOW';
      if (cores <= 8) return 'MED';
      return 'HIGH';
    };

    setQuality(determineQuality());
  }, []);

  return (
    <HardwareContext.Provider value={{ quality, setQuality, devicePixelRatio: dpr }}>
      {children}
    </HardwareContext.Provider>
  );
}

export function useHardware() {
  const ctx = useContext(HardwareContext);
  if (!ctx) throw new Error('useHardware must be used within HardwareProvider');
  return ctx;
}
