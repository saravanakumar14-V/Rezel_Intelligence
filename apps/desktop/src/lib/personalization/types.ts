import type { SpatialSpace } from '../navigation/types';

export type VisualPreset = 'CALM' | 'FOCUS' | 'DYNAMIC' | 'MINIMAL';
export type UIDensity = 'COMFORTABLE' | 'COMPACT';
export type TransitionStyle = 'SMOOTH' | 'CINEMATIC' | 'INSTANT';
export type NotificationDensity = 'ALL' | 'IMPORTANT_ONLY' | 'MINIMAL';
export type PreferredProvider = 'AUTO' | 'LOCAL' | 'GEMINI' | 'OPENAI' | 'ANTHROPIC' | 'OLLAMA';
export type ReasoningMode = 'SMART' | 'FAST' | 'BALANCED' | 'LOCAL';
export type CostSensitivity = 'LOW' | 'BALANCED' | 'QUALITY_FIRST';

export interface VisualPreferences {
  preset: VisualPreset;
  density: UIDensity;
  ambientIntensity: number; // 0.0 - 1.0
  accentGlow: boolean;
}

export interface MotionPreferences {
  reducedMotion: boolean;
  transitionStyle: TransitionStyle;
}

export interface AudioPreferences {
  voiceEnabled: boolean;
  ttsEnabled: boolean;
  soundEffects: boolean;
  voicePace: number; // 0.5 - 2.0
  voiceTone: string;
}

export interface AIPreferences {
  preferredProvider: PreferredProvider;
  reasoningMode: ReasoningMode;
  localFirst: boolean;
  costSensitivity: CostSensitivity;
}

export interface WorkspacePreferences {
  startupSpace: SpatialSpace;
  showBackgroundIndicators: boolean;
}

export interface NotificationPreferences {
  density: NotificationDensity;
  soundCues: boolean;
}

export interface AccessibilityPreferences {
  highContrast: boolean;
  largeMonospace: boolean;
}

export interface PersonalizationProfile {
  schemaVersion: number;
  visual: VisualPreferences;
  motion: MotionPreferences;
  audio: AudioPreferences;
  ai: AIPreferences;
  workspace: WorkspacePreferences;
  notifications: NotificationPreferences;
  accessibility: AccessibilityPreferences;
}

export type PersonalizationListener = (profile: PersonalizationProfile) => void;
