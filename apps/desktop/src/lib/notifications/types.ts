export type EventSeverity =
  | 'BACKGROUND'
  | 'INFO'
  | 'PROGRESS'
  | 'SUCCESS'
  | 'ATTENTION'
  | 'WARNING'
  | 'RECOVERY'
  | 'ERROR'
  | 'CRITICAL';

export type EventVisibility =
  | 'LEVEL_0_AMBIENT'
  | 'LEVEL_1_CONTEXTUAL'
  | 'LEVEL_2_TRANSIENT'
  | 'LEVEL_3_PERSISTENT'
  | 'LEVEL_4_INTERVENTION';

export type EventSource =
  | 'AGENT'
  | 'WORKFLOW'
  | 'PROVIDER'
  | 'APPLICATION'
  | 'SECURITY'
  | 'MODEL'
  | 'MEMORY'
  | 'SYSTEM';

export type SoundCue = 'SUCCESS' | 'WARNING' | 'CRITICAL' | 'ATTENTION';

export interface NotificationContext {
  workflowId?: string;
  taskId?: string;
  stepId?: string;
  toolName?: string;
  provider?: string;
  modelId?: string;
  app?: string;
  resourcePath?: string;
  errorCode?: string;
  retryCount?: number;
}

export interface RezelNotificationEvent {
  id: string;
  title: string;
  summary: string;
  severity: EventSeverity;
  visibility: EventVisibility;
  source: EventSource;
  timestamp: number;
  timeFormatted: string;
  durationMs?: number;
  dismissible: boolean;
  persistent: boolean;
  resolved: boolean;
  requiresInteraction: boolean;
  context?: NotificationContext;
  groupId?: string;
  groupCount?: number;
  chainEvents?: RezelNotificationEvent[];
  soundCue?: SoundCue;
}

export type NotificationListener = (events: RezelNotificationEvent[]) => void;
