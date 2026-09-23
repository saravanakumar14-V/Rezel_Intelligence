/**
 * AI Layer — Shared Type Definitions
 *
 * Central type module for the Rezel AI subsystem. Every AI module imports
 * from here to avoid circular dependencies and ensure consistent typing.
 */

import type { RiskLevel } from '../security/PermissionManager';

// ─── Messages ─────────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  thoughtSignature?: string;
  rawPart?: any;
}

export interface ToolResult {
  callId: string;
  name: string;
  output: string;
  success: boolean;
  errorCode?: string;
}

export interface Message {
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  timestamp: string;
  interrupted?: boolean;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: any[];
  signal?: AbortSignal;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'done' | 'error';
  text?: string;
  toolCall?: ToolCall;
  error?: string;
}

export interface AIProvider {
  readonly name: string;
  chat(messages: Message[], options?: ChatOptions): AsyncGenerator<StreamChunk>;
  isAvailable(): Promise<boolean>;
}

// ─── Tools ────────────────────────────────────────────────────────────────────

export interface ParameterDef {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
  items?: Omit<ParameterDef, 'required'>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ParameterDef>;
  category: ToolCategory;
  /** Risk tier — determines whether security confirmation is required. */
  risk: RiskLevel;
  /** Tauri command name to invoke. Omit for JS-only tools. */
  tauriCommand?: string;
  /** IPC client ID for routing commands to external applications. */
  ipcClientId?: string;
  /** Tool group for PermissionManager classification. */
  toolGroup: string;
  /** True if the tool mutates state outside Rezel (e.g., AE composition, file system, OS). */
  mutatesExternalState?: boolean;
  /** Retry policy on failure or timeout. Mutations should be NEVER. */
  retryPolicy?: 'AUTO' | 'NEVER';
  /** Optional locks required by the tool. */
  requiredLocks?: { uri: string, access: 'READ' | 'WRITE' }[];
}

export type ToolCategory =
  | 'system'
  | 'memory'
  | 'file'
  | 'shell'
  | 'network'
  | 'ai'
  | 'application'
  | 'media';

// ─── Memory ───────────────────────────────────────────────────────────────────

export interface ConversationRecord {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

export interface MemoryEntry {
  key: string;
  value: string;
  category: 'preference' | 'context' | 'automation' | 'note';
  createdAt: string;
  updatedAt: string;
}

export interface MemoryStore {
  conversations: ConversationRecord[];
  entries: MemoryEntry[];
  version: number;
}

// ─── Planner ──────────────────────────────────────────────────────────────────

export type PlanStatus =
  | 'PLANNED'
  | 'RUNNING'
  | 'WAITING_FOR_USER'
  | 'PAUSED'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'PARTIALLY_SUCCEEDED'
  | 'PARTIALLY_ROLLED_BACK'
  | 'CANCELLED'
  | 'RECOVERY_REQUIRED';

export type PlanStepStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'WAITING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED'
  | 'CANCELLED';

export type WaitingReason =
  | 'USER_CONFIRMATION'
  | 'EXTERNAL_OPERATION'
  | 'APPLICATION_CONNECTION'
  | 'RETRY_BACKOFF'
  | 'RESOURCE';

export interface PlanStep {
  id: string;
  description: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  dependsOn?: string[];
  status: PlanStepStatus;
  waitingReason?: WaitingReason;
  result?: string;
  error?: string;
  
  /** The ultimate semantic outcome of the step, distinct from its status. */
  executionOutcome?: 'SUCCESS' | 'UNKNOWN' | 'FAILED';
  /** Clarifies why the step failed when status === 'FAILED' */
  failureReason?: 'TIMEOUT' | 'SECURITY_BLOCKED' | 'EXECUTION_FAILED';
  
  /** Execution Tracking */
  attempts: number;
  maxRetries?: number;
  executionId?: string;
  risk?: RiskLevel;
  
  /** Timestamps */
  startedAt?: string;
  completedAt?: string;
  
  /** Verification */
  verificationPredicate?: import('./verification/types').VerificationPredicate;
  observationResult?: import('./verification/types').NormalizedObservation;
  verificationResult?: import('./verification/types').VerificationResult;
  verificationReason?: string;

  /** Step-Level Dynamic Routing (Milestone 11.3B) */
  taskProfile?: import('./providers/types').TaskProfile;
  providerRoute?: import('./providers/types').ProviderRoute;
  routingProfile?: import('./providers/types').RoutingProfile;
  stepCategory?: import('./providers/types').TaskCategory;

  /** Step Data Flow & Variables (Milestone 11.4B) */
  outputDefinitions?: import('./dataflow/types').WorkflowStepOutputDefinition[];
  stepOutputs?: Record<string, unknown>;
  inputBindings?: Record<string, string>;
}

export interface Plan {
  id: string;
  workflowId?: string;
  projectId?: string;
  goal: string;
  version?: number;
  steps: PlanStep[];
  phases?: import('./planning/types').PlanPhase[];
  metadata?: import('./planning/types').PlanMetadata;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
  taskProfile?: import('./providers/types').TaskProfile;
  planningRoute?: import('./providers/types').ProviderRoute;
}

export interface Workflow {
  id: string;
  projectId?: string;
  plan: Plan;
  status: PlanStatus;
  createdAt: string;
  updatedAt: string;
  templateId?: string;
  templateVersion?: string;
  resolvedParameters?: Record<string, unknown>;
}

// ─── Phase 14 Workflow Types Export ──────────────────────────────────────────
export * from './workflow/types';

