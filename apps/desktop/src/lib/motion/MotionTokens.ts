import type { MotionDurationToken, MotionEaseToken } from './types';

export const MotionDurations: Record<MotionDurationToken, number> = {
  instant: 0.05,
  micro: 0.15,
  fast: 0.25,
  standard: 0.35,
  extended: 0.5,
  cinematic: 0.8,
};

export const MotionEasings: Record<MotionEaseToken, string> = {
  standard: 'power2.out',
  in: 'power2.in',
  out: 'power3.out',
  inOut: 'power2.inOut',
  spatial: 'cubic-bezier(0.16, 1, 0.3, 1)',
  emphasis: 'back.out(1.4)',
};

export const MotionDistances = {
  microShift: 4,
  spatialShift: 16,
  panelSlide: 32,
  modalDrop: 20,
};
