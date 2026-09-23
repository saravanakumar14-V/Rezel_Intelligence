import { useState, useEffect, useRef } from 'react';
import {
  spatialCameraBus,
  CAMERA_PRESETS,
  type CameraPresetType,
} from './spatialCameraState';

/**
 * SpatialNavigationOverlay
 *
 * Minimalist, non-intrusive HUD overlay providing:
 *  1. Initial "DRAG TO EXPLORE 360°" spatial hint (fades away gracefully).
 *  2. Minimal camera preset selector pills with keyboard shortcuts.
 *  3. Live spatial telemetry readout (Azimuth °, Elevation °, Distance).
 *  4. Quiet, dwell-based (380ms) contextual inspection tag for Core computational layers.
 */
export default function SpatialNavigationOverlay() {
  const [activePreset, setActivePreset] = useState<CameraPresetType>('DEFAULT');
  const [showHint, setShowHint] = useState(true);
  const [displayedLayer, setDisplayedLayer] = useState<string | null>(null);
  const [angleInfo, setAngleInfo] = useState({ azimuth: 0, elevation: 0, distance: 7.5 });
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Fade out initial hint after 6 seconds
    const timer = setTimeout(() => {
      setShowHint(false);
    }, 6000);

    const unsubPreset = spatialCameraBus.subscribePreset((preset) => {
      setActivePreset(preset === 'RESET' ? 'DEFAULT' : preset);
      setShowHint(false); // Dismiss hint on user interaction
    });

    const unsubHover = spatialCameraBus.subscribeHover((layer) => {
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
      if (layer) {
        // Quiet 380ms dwell timer before revealing contextual label
        dwellTimerRef.current = setTimeout(() => {
          setDisplayedLayer(layer);
        }, 380);
      } else {
        // Swift dismissal on exit
        setDisplayedLayer(null);
      }
    });

    const unsubAngle = spatialCameraBus.subscribeAngle((azimuth, elevation, distance) => {
      setAngleInfo({ azimuth, elevation, distance });
    });

    return () => {
      clearTimeout(timer);
      unsubPreset();
      unsubHover();
      unsubAngle();
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
    };
  }, []);

  const handleSelectPreset = (preset: CameraPresetType) => {
    spatialCameraBus.setPreset(preset);
  };

  const presetList: CameraPresetType[] = ['DEFAULT', 'SYSTEM', 'FOCUS', 'REAR'];

  return (
    <div className="absolute inset-0 pointer-events-none z-10 select-none overflow-hidden font-mono text-xs">
      {/* 1. Initial Subtle "Drag to Explore" Hint */}
      {showHint && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 backdrop-blur-md shadow-lg shadow-cyan-950/50 animate-pulse transition-opacity duration-1000">
          <svg className="w-3.5 h-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            <path d="M2 12h20" />
          </svg>
          <span className="tracking-widest uppercase text-[10px] font-semibold">
            Drag to Explore 360° Core Orbit
          </span>
        </div>
      )}

      {/* 2. Quiet Contextual Layer Inspection Tag */}
      {displayedLayer && (
        <div className="absolute top-[26%] left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-1 rounded bg-black/50 border border-white/15 backdrop-blur-md text-white shadow-xl transition-all duration-200 pointer-events-none">
          <span className="w-1 h-1 rounded-full bg-[#FFE082] animate-pulse" />
          <span className="font-mono text-[9px] tracking-[0.22em] uppercase font-medium text-white/90">
            {displayedLayer}
          </span>
        </div>
      )}

      {/* 3. Bottom-Right Spatial Telemetry & Camera Preset Bar */}
      <div className="absolute bottom-5 right-6 flex flex-col items-end gap-1.5">
        {/* Spatial Coordinates Readout */}
        <div className="flex items-center gap-2.5 px-2.5 py-1 rounded bg-black/40 border border-cyan-950/60 text-[10px] text-cyan-400/70 backdrop-blur-sm">
          <span className="tracking-wider">
            AZ <span className="text-cyan-200 font-semibold">{angleInfo.azimuth}°</span>
          </span>
          <span className="text-cyan-800">|</span>
          <span className="tracking-wider">
            EL <span className="text-cyan-200 font-semibold">{angleInfo.elevation > 0 ? `+${angleInfo.elevation}` : angleInfo.elevation}°</span>
          </span>
          <span className="text-cyan-800">|</span>
          <span className="tracking-wider">
            R <span className="text-cyan-200 font-semibold">{angleInfo.distance}</span>
          </span>
        </div>

        {/* Minimal Preset Switcher Pills */}
        <div className="pointer-events-auto flex items-center gap-1 p-1 rounded-lg bg-black/50 border border-cyan-500/20 backdrop-blur-md shadow-2xl">
          {presetList.map((presetKey) => {
            const config = CAMERA_PRESETS[presetKey];
            const isActive = activePreset === presetKey;
            return (
              <button
                key={presetKey}
                onClick={() => handleSelectPreset(presetKey)}
                title={`Switch to ${config.label} View [Key: ${config.shortcut}]`}
                className={`px-2.5 py-1 rounded text-[10px] uppercase tracking-wider font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-sm shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-cyan-200 hover:bg-white/5 border border-transparent'
                }`}
              >
                {config.label}
                <span className="ml-1 opacity-40 text-[8px] font-mono">[{config.shortcut}]</span>
              </button>
            );
          })}

          <div className="w-[1px] h-3.5 bg-white/10 mx-0.5" />

          <button
            onClick={() => handleSelectPreset('RESET')}
            title="Reset Camera to Canonical View [Key: R]"
            className="px-2 py-1 rounded text-[10px] text-slate-400 hover:text-cyan-200 hover:bg-white/5 transition-all duration-200"
          >
            <span className="font-mono text-[9px] uppercase tracking-wider">↺ Reset [R]</span>
          </button>
        </div>
      </div>
    </div>
  );
}
