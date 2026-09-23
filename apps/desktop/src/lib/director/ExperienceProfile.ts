import type { Mode, ExperienceProfile } from './types.js';

const FRIENDLY_PROFILE: ExperienceProfile = {
  id: 'FRIENDLY',
  displayName: 'Friendly Assistant',
  behavior: {
    systemPromptExtension: 'Be conversational, empathetic, and occasionally use light humor. Keep responses concise unless asked for detail. Focus on natural everyday interaction.',
    communicationStyle: 'conversational',
    verbosity: 'medium',
    humorLevel: 'occasional',
    planningStyle: 'collaborative',
  },
  toolPreferences: {
    preferredCategories: [],
    preferredCapabilities: [],
    deprioritizedCategories: [],
  },
  uiProfile: {
    theme: 'soft',
    hudDensity: 'minimal',
    transitionStyle: 'smooth',
  },
  voiceProfile: {
    pace: 1.0,
    pitch: 1.0,
    tone: 'warm',
    interruptionPolicy: 'allow',
  }
};

const CREATOR_PROFILE: ExperienceProfile = {
  id: 'CREATOR',
  displayName: 'Creator Mode',
  behavior: {
    systemPromptExtension: 'You are in Creator Mode. Focus on creative production, visualization, and cinematic transitions. Prioritize visual planning, iterative refinement, and composition over raw technical details.',
    communicationStyle: 'cinematic',
    verbosity: 'low',
    humorLevel: 'none',
    planningStyle: 'visual_first',
  },
  toolPreferences: {
    preferredCategories: ['application', 'media'],
    preferredCapabilities: ['blender.inspect_scene', 'blender.create_object', 'blender.create_camera', 'ae_inspect_project'],
    deprioritizedCategories: ['system', 'shell'],
  },
  uiProfile: {
    theme: 'holographic',
    hudDensity: 'focused',
    transitionStyle: 'cinematic',
  },
  voiceProfile: {
    pace: 0.9,
    pitch: 0.95,
    tone: 'professional',
    interruptionPolicy: 'require_pause',
  }
};

const DEVELOPER_PROFILE: ExperienceProfile = {
  id: 'DEVELOPER',
  displayName: 'Developer Mode',
  behavior: {
    systemPromptExtension: 'You are in Developer Mode. Provide highly precise, technical, and detailed engineering responses. Prioritize project context, code awareness, testing, and debugging. Do not omit crucial technical details.',
    communicationStyle: 'technical',
    verbosity: 'high',
    humorLevel: 'none',
    planningStyle: 'test_driven',
  },
  toolPreferences: {
    preferredCategories: ['shell', 'file', 'network', 'system'],
    preferredCapabilities: [],
    deprioritizedCategories: ['media'],
  },
  uiProfile: {
    theme: 'terminal',
    hudDensity: 'dense',
    transitionStyle: 'instant',
  },
  voiceProfile: {
    pace: 1.1,
    pitch: 1.0,
    tone: 'energetic',
    interruptionPolicy: 'allow',
  }
};

class ExperienceProfileRegistryImpl {
  private profiles: Record<Mode, ExperienceProfile> = {
    'FRIENDLY': FRIENDLY_PROFILE,
    'CREATOR': CREATOR_PROFILE,
    'DEVELOPER': DEVELOPER_PROFILE,
  };

  getProfile(mode: Mode): ExperienceProfile {
    return this.profiles[mode] || this.profiles['FRIENDLY'];
  }
}

export const ExperienceProfileRegistry = new ExperienceProfileRegistryImpl();
