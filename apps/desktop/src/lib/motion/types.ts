export type MotionDurationToken =
  | 'instant'
  | 'micro'
  | 'fast'
  | 'standard'
  | 'extended'
  | 'cinematic';

export type MotionEaseToken =
  | 'standard'
  | 'in'
  | 'out'
  | 'inOut'
  | 'spatial'
  | 'emphasis';

export interface MotionConfig {
  duration: number; // in seconds
  ease: string;
  reducedMotion: boolean;
}

export type MotionSemanticState =
  | 'IDLE'
  | 'LISTENING'
  | 'THINKING'
  | 'PLANNING'
  | 'EXECUTING'
  | 'WAITING'
  | 'SUCCESS'
  | 'WARNING'
  | 'ERROR'
  | 'RECOVERY'
  | 'CANCELLED';
