/**
 * Rezel OS — Application Automation Platform Exports (Milestone 11.3C)
 */

export * from './types';
export * from './ApplicationRegistry';
export * from './adapters/BaseApplicationAdapter';
export * from './adapters/BlenderApplicationAdapter';
export * from './adapters/AfterEffectsApplicationAdapter';

import { ApplicationRegistry } from './ApplicationRegistry';
import { BlenderApplicationAdapter } from './adapters/BlenderApplicationAdapter';
import { AfterEffectsApplicationAdapter } from './adapters/AfterEffectsApplicationAdapter';

// Register built-in application adapters
export function initializeApplicationPlatform(): void {
  if (!ApplicationRegistry.get('blender')) {
    ApplicationRegistry.register(new BlenderApplicationAdapter());
  }
  if (!ApplicationRegistry.get('after_effects')) {
    ApplicationRegistry.register(new AfterEffectsApplicationAdapter());
  }
}

// Auto-initialize default platform adapters
initializeApplicationPlatform();
