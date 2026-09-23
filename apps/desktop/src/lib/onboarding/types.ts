/**
 * Rezel OS — Onboarding State & Types (Milestone R8)
 */

export const ONBOARDING_VERSION = 1;

export type OnboardingStage =
  | 'awakening'
  | 'environment'
  | 'capabilities'
  | 'hardware'
  | 'providers'
  | 'local-ai'
  | 'integrations'
  | 'permissions'
  | 'personalization'
  | 'ready';

export type HardwareTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'ULTRA';

export interface DiscoveredEnvironment {
  status: 'SUCCESS' | 'PARTIAL' | 'UNAVAILABLE';
  os?: string;
  architecture?: string;
  cpuName?: string;
  cpuCores?: number;
  gpuDevice?: string;
  totalMemoryGB?: number;
  storageFreeGB?: number;
  isNetworkConnected?: boolean;
  dpr?: number;
}

export interface HardwareCapabilityProfile {
  tier: HardwareTier;
  summary: string;
  recommendations: string[];
  specs: {
    cpu: string;
    gpu: string;
    ram: string;
    storage: string;
  };
}

export interface ProviderSetupRecord {
  vendor: string;
  displayName: string;
  status: 'CONNECTED' | 'NOT_CONNECTED' | 'DISCOVERED';
  keyProvided: boolean;
}

export interface LocalAIDiscoveryResult {
  status: 'NOT_DETECTED' | 'DETECTED_OFFLINE' | 'CONNECTED';
  endpoint: string;
  modelCount: number;
  models: string[];
}

export interface IntegrationDiscoveryRecord {
  id: string;
  displayName: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'UNAVAILABLE';
  description: string;
}

export interface InitialPreferences {
  experienceStyle: 'Calm' | 'Balanced' | 'Technical';
  voiceEnabled: boolean;
  workspaceDensity: 'Spacious' | 'Balanced' | 'Dense';
  aiPreference: 'Local-first' | 'Balanced' | 'Cloud-first';
}

export interface OnboardingState {
  version: number;
  firstLaunch: boolean;
  completed: boolean;
  interrupted: boolean;
  currentStage: OnboardingStage;
  completedStages: OnboardingStage[];
  skippedStages: OnboardingStage[];
  environment?: DiscoveredEnvironment;
  hardwareProfile?: HardwareCapabilityProfile;
  localAI?: LocalAIDiscoveryResult;
  preferences: InitialPreferences;
  completedAt?: number;
}
