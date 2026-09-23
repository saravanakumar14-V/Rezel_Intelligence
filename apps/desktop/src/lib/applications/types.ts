/**
 * Rezel OS — Application Automation Platform Contracts (Milestone 11.3C)
 *
 * Defines the generic application adapter, session management, capability model,
 * observation/inspection contracts, and lifecycle events.
 */

import type { NormalizedObservation, AppEntity, VerificationPredicate, VerificationResult } from '../ai/verification/types';

export type ApplicationHealthState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'READY'
  | 'DEGRADED'
  | 'UNHEALTHY'
  | 'STALE'
  | 'UNKNOWN';

export interface ApplicationHealth {
  readonly state: ApplicationHealthState;
  readonly lastHeartbeat: number;
  readonly message?: string;
  readonly connectionId?: string;
  readonly details?: Record<string, unknown>;
}

export type ApplicationCapabilityRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ApplicationCapability {
  readonly id: string;                         // Machine-readable capability ID, e.g. 'scene.write', 'object.create'
  readonly name: string;                       // Concrete tool name, e.g. 'blender.create_object'
  readonly description: string;
  readonly applicationId: string;              // e.g. 'blender', 'after_effects'
  readonly category: 'SCENE' | 'OBJECT' | 'RENDER' | 'PROJECT' | 'COMPOSITION' | 'LAYER' | 'COLLECTION' | 'MATERIAL' | 'ANIMATION' | 'EXPORT' | 'SYSTEM';
  readonly parameters: Record<string, unknown>; // JSON schema
  readonly mutatesExternalState: boolean;
  readonly risk: ApplicationCapabilityRisk;
  readonly retryPolicy: 'NEVER' | 'AUTO';
  readonly requiredLocks?: Array<{ uri: string; access: 'READ' | 'WRITE' }>;
}

export type ApplicationSessionState =
  | 'STARTING'
  | 'ACTIVE'
  | 'BUSY'
  | 'STALE'
  | 'CLOSING'
  | 'CLOSED'
  | 'FAILED';

export interface ApplicationSession {
  readonly sessionId: string;                  // Unique per-instance/connection, e.g. 'sess_blender_a_123'
  readonly applicationId: string;              // 'blender', 'after_effects'
  readonly launchId?: string;                  // Unique per process spawn
  readonly processId?: number;                 // OS PID
  readonly connectionId: string;               // Unique WebSocket / IPC connection ID
  readonly state: ApplicationSessionState;
  readonly health: ApplicationHealth;
  readonly capabilities: ApplicationCapability[];
  readonly createdAt: number;
  readonly lastActivityAt: number;
  readonly metadata?: Record<string, unknown>;
}

export interface ApplicationDiscoveryInfo {
  readonly applicationId: string;
  readonly displayName: string;
  readonly isInstalled: boolean;
  readonly isRunning: boolean;
  readonly version?: string;
  readonly executablePath?: string;
  readonly availableSessions: ApplicationSession[];
}

export interface ApplicationOperation {
  readonly operationId: string;
  readonly applicationId: string;
  readonly sessionId?: string;
  readonly capabilityId: string;
  readonly parameters: Record<string, unknown>;
  readonly mutatesExternalState: boolean;
  readonly timeoutMs?: number;
  readonly verificationPredicate?: VerificationPredicate;
  readonly context?: {
    readonly workflowId?: string;
    readonly stepId?: string;
    readonly executionId?: string;
    readonly projectId?: string;
  };
}

export interface ApplicationOperationResult {
  readonly operationId: string;
  readonly applicationId: string;
  readonly sessionId?: string;
  readonly success: boolean;
  readonly outcome: 'SUCCESS' | 'FAILED' | 'UNKNOWN';
  readonly output?: any;
  readonly error?: string;
  readonly durationMs: number;
  readonly mutatesExternalState: boolean;
  readonly observation?: NormalizedObservation;
}

export interface InspectionRequest {
  readonly applicationId: string;
  readonly sessionId?: string;
  readonly inspectionType?: string;
  readonly parameters?: Record<string, unknown>;
  readonly context?: {
    readonly workflowId?: string;
    readonly executionId?: string;
  };
}

export interface InspectionResult {
  readonly applicationId: string;
  readonly sessionId?: string;
  readonly timestamp: number;
  readonly status: 'SUCCESS' | 'ERROR' | 'UNKNOWN';
  readonly entities: AppEntity[];
  readonly rawOutput?: any;
  readonly error?: string;
}

export interface ApplicationLifecycleEvent {
  readonly type:
    | 'application_discovered'
    | 'application_session_created'
    | 'application_connected'
    | 'application_disconnected'
    | 'application_health_changed'
    | 'application_operation_started'
    | 'application_operation_completed'
    | 'application_operation_failed'
    | 'application_operation_unknown'
    | 'application_verification_completed';
  readonly timestamp: number;
  readonly applicationId: string;
  readonly sessionId?: string;
  readonly operationId?: string;
  readonly workflowId?: string;
  readonly stepId?: string;
  readonly payload?: Record<string, unknown>;
}

export interface ApplicationAdapter {
  readonly applicationId: string;
  readonly displayName: string;

  getCapabilities(): ApplicationCapability[];

  discover(): Promise<ApplicationDiscoveryInfo>;

  connect(options?: {
    sessionId?: string;
    launchId?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  }): Promise<ApplicationSession>;

  disconnect(sessionId: string): Promise<void>;

  getHealth(sessionId?: string): ApplicationHealth;

  getSessions(): ApplicationSession[];

  getSession(sessionId: string): ApplicationSession | undefined;

  inspect(request: InspectionRequest, signal?: AbortSignal): Promise<InspectionResult>;

  execute(
    operation: ApplicationOperation,
    signal?: AbortSignal
  ): Promise<ApplicationOperationResult>;

  verify(
    sessionId: string,
    predicate: VerificationPredicate,
    signal?: AbortSignal
  ): Promise<VerificationResult>;
}
