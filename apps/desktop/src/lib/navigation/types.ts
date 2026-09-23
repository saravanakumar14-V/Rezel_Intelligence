export type SpatialSpace =
  | 'CORE'
  | 'CONVERSATION'
  | 'WORKFLOW'
  | 'AUTOMATION'
  | 'MODELS'
  | 'MEMORY'
  | 'KNOWLEDGE'
  | 'PROVIDERS'
  | 'TRUST'
  | 'AUDIT'
  | 'SYSTEM';

export interface SpatialContextEntry {
  space: SpatialSpace;
  subContext?: string;
  params?: Record<string, any>;
  timestamp: number;
}

export interface NavigationState {
  currentSpace: SpatialSpace;
  currentSubContext?: string;
  contextParams?: Record<string, any>;
  stack: SpatialContextEntry[];
  backgroundSpaces: SpatialSpace[];
  canGoBack: boolean;
}

export type NavigationListener = (state: NavigationState) => void;
