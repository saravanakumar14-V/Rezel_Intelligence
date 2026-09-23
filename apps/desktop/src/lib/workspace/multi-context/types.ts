import type { SpatialSpace } from '../../navigation/types';

export type ContextType =
  | 'WORKFLOW'
  | 'AUTOMATION'
  | 'MODEL_DOWNLOAD'
  | 'KNOWLEDGE_INDEX'
  | 'CONVERSATION'
  | 'SYSTEM_TASK';

export type ContextStatus =
  | 'ACTIVE'
  | 'BACKGROUND'
  | 'ATTENTION'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'FAILED'
  | 'RECOVERED';

export type ContextPriority =
  | 'BACKGROUND'
  | 'RELEVANT'
  | 'ATTENTION'
  | 'URGENT';

export interface RezelActiveContext {
  id: string;
  type: ContextType;
  title: string;
  summary: string;
  status: ContextStatus;
  priority: ContextPriority;
  progress?: number; // 0 - 100
  stepDescription?: string;
  relatedId?: string; // workflowId, modelId, appId
  targetSpace: SpatialSpace;
  createdAt: number;
  lastFocusedTime: number;
  canCancel: boolean;
  canResume: boolean;
  blockedReason?: string;
}

export type MultiContextListener = (contexts: RezelActiveContext[]) => void;
