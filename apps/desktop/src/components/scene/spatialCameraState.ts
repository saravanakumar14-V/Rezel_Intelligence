export type CameraPresetType = 'DEFAULT' | 'SYSTEM' | 'FOCUS' | 'REAR' | 'RESET';

export interface CameraPresetConfig {
  name: string;
  theta: number; // Azimuth angle in radians
  phi: number;   // Polar angle in radians (from zenith: PI/2 = equator)
  radius: number; // Distance to target
  label: string;
  shortcut: string;
}

export const CAMERA_PRESETS: Record<CameraPresetType, CameraPresetConfig> = {
  DEFAULT: {
    name: 'DEFAULT',
    theta: 0.0,
    phi: Math.PI * 0.5, // 90° (Canonical Equator)
    radius: 7.5,
    label: 'Standard',
    shortcut: '1',
  },
  SYSTEM: {
    name: 'SYSTEM',
    theta: 0.85, // ~49° azimuth
    phi: 0.955,  // ~54.7° quantum magic angle elevation
    radius: 8.5,
    label: 'System',
    shortcut: '2',
  },
  FOCUS: {
    name: 'FOCUS',
    theta: 0.0,
    phi: Math.PI * 0.5,
    radius: 4.2, // Close-up directly on nucleus & tensor matrix
    label: 'Focus',
    shortcut: '3',
  },
  REAR: {
    name: 'REAR',
    theta: Math.PI, // 180° rear view
    phi: 1.35,
    radius: 7.5,
    label: 'Rear',
    shortcut: '4',
  },
  RESET: {
    name: 'RESET',
    theta: 0.0,
    phi: Math.PI * 0.5,
    radius: 7.5,
    label: 'Reset',
    shortcut: 'R',
  },
};

type PresetListener = (preset: CameraPresetType) => void;
type HoverListener = (layerName: string | null) => void;
type AngleListener = (azimuthDeg: number, elevationDeg: number, distance: number) => void;

class SpatialCameraBus {
  private presetListeners = new Set<PresetListener>();
  private hoverListeners = new Set<HoverListener>();
  private angleListeners = new Set<AngleListener>();
  private currentPreset: CameraPresetType = 'DEFAULT';

  public setPreset(preset: CameraPresetType) {
    this.currentPreset = preset === 'RESET' ? 'DEFAULT' : preset;
    this.presetListeners.forEach((fn) => fn(preset));
  }

  public getCurrentPreset(): CameraPresetType {
    return this.currentPreset;
  }

  public subscribePreset(fn: PresetListener) {
    this.presetListeners.add(fn);
    return () => this.presetListeners.delete(fn);
  }

  private currentHoveredLayer: string | null = null;

  public setHoveredLayer(layer: string | null) {
    this.currentHoveredLayer = layer;
    this.hoverListeners.forEach((fn) => fn(layer));
  }

  public getHoveredLayer(): string | null {
    return this.currentHoveredLayer;
  }

  public subscribeHover(fn: HoverListener) {
    this.hoverListeners.add(fn);
    return () => this.hoverListeners.delete(fn);
  }

  public notifyAngle(azimuthDeg: number, elevationDeg: number, distance: number) {
    this.angleListeners.forEach((fn) => fn(azimuthDeg, elevationDeg, distance));
  }

  public subscribeAngle(fn: AngleListener) {
    this.angleListeners.add(fn);
    return () => this.angleListeners.delete(fn);
  }
}

export const spatialCameraBus = new SpatialCameraBus();
