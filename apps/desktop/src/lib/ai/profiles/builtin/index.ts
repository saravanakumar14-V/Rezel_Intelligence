/**
 * Rezel 13.2.1 — Built-in Application Profiles Index
 */

export * from './notepad.profile';
export * from './calculator.profile';
export * from './explorer.profile';
export * from './after_effects.profile';
export * from './blender.profile';

import { NOTEPAD_PROFILE } from './notepad.profile';
import { CALCULATOR_PROFILE } from './calculator.profile';
import { EXPLORER_PROFILE } from './explorer.profile';
import { AFTER_EFFECTS_PROFILE } from './after_effects.profile';
import { BLENDER_PROFILE } from './blender.profile';
import type { ApplicationProfile } from '../types';

export const BUILTIN_PROFILES: readonly ApplicationProfile[] = [
  NOTEPAD_PROFILE,
  CALCULATOR_PROFILE,
  EXPLORER_PROFILE,
  AFTER_EFFECTS_PROFILE,
  BLENDER_PROFILE,
];

