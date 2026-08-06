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
}

export interface ToolResult {
  callId: string;
  name: string;
  output: string;
  success: boolean;
}

export interface Message {
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  timestamp: string;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  tools?: ToolDefinition[];
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
  /** Tool group for PermissionManager classification. */
  toolGroup: string;
}

export type ToolCategory =
  | 'system'
  | 'memory'
  | 'file'
  | 'shell'
  | 'network'
  | 'ai';

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

export type PlanStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface PlanStep {
  id: string;
  description: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  dependsOn?: string[];
  status: PlanStepStatus;
  result?: string;
  error?: string;
}

export interface Plan {
  id: string;
  goal: string;
  steps: PlanStep[];
  status: 'planning' | 'executing' | 'completed' | 'failed';
  createdAt: string;
}
