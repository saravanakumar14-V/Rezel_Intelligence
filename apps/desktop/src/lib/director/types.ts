export type Intent = 'CONVERSATION' | 'CODING' | 'CREATIVE_AUTOMATION' | 'RESEARCH' | 'SYSTEM_TASK';
export type Mode = 'FRIENDLY' | 'CREATOR' | 'DEVELOPER';

export interface IntentClassification {
  intent: Intent;
  confidence: number;
  suggestedMode?: Mode;
  signals?: Record<string, any>;
}

export interface ApplicationSession {
  appId: string;
  processId?: number;
  connectionStatus: 'CONNECTED' | 'DISCONNECTED';
  activeProject?: string;
  foreground: boolean;
  capabilities: string[];
}

export interface ExperienceProfile {
  id: Mode;
  displayName: string;
  behavior: {
    systemPromptExtension: string;
    communicationStyle: 'conversational' | 'technical' | 'cinematic';
    verbosity: 'low' | 'medium' | 'high';
    humorLevel: 'none' | 'occasional' | 'frequent';
    planningStyle: 'collaborative' | 'visual_first' | 'test_driven' | 'autonomous';
  };
  toolPreferences: {
    preferredCategories: import('../ai/types').ToolCategory[];
    preferredCapabilities: string[];
    deprioritizedCategories: import('../ai/types').ToolCategory[];
  };
  uiProfile: {
    theme: 'soft' | 'holographic' | 'terminal';
    hudDensity: 'minimal' | 'focused' | 'dense';
    transitionStyle: 'smooth' | 'cinematic' | 'instant';
  };
  voiceProfile: {
    pace: number;
    pitch: number;
    tone: 'warm' | 'professional' | 'energetic';
    interruptionPolicy: 'allow' | 'require_pause';
  };
}

export interface ContextSnapshot {
  conversationId: string | null;
  mode: Mode;
  experienceProfile: ExperienceProfile;
  intent: Intent | null;
  intentConfidence: number;
  activeApplication: ApplicationSession | null;
  activeWorkflowId: string | null;
  projectContext?: import('../workspace/types').ProjectContextSnapshot;
  sessionState: Record<string, any>;
}

export interface AgentRequest {
  input: string;
  context?: ContextSnapshot;
}

// ── 10.9 Companion Window & Handoff Types ──────────────────────────────────────

export type WindowState = 'FULL' | 'TRANSITIONING' | 'COMPANION' | 'HIDDEN';

export type CompanionAnchor = 'BOTTOM_RIGHT' | 'TOP_RIGHT' | 'CUSTOM';

export interface CompanionConfig {
  width: number;
  height: number;
  anchor: CompanionAnchor;
  alwaysOnTop: boolean;
  customPosition?: { x: number; y: number };
}

export type HandoffState =
  | 'IDLE'
  | 'PREPARING'
  | 'LAUNCHING'
  | 'FOCUSING'
  | 'ENTERING_COMPANION'
  | 'COMPANION'
  | 'RESTORING'
  | 'FAILED';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}
