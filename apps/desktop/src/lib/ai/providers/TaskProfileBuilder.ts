/**
 * Rezel OS — Task Profile Builder (Milestone 11.2A)
 *
 * Derives structured, immutable TaskProfiles capturing capability requirements,
 * latency preferences, and execution targets before routing decisions.
 */

import type {
  TaskProfile,
  TaskCategory,
  TaskRequiredCapabilities,
  LatencyPreference,
  CostSensitivity,
  ProviderVendor,
} from './types';

export interface TaskProfileInput {
  category?: TaskCategory;
  executionTarget?: 'CHAT' | 'REASONING';
  goal?: string;
  messagesCount?: number;
  hasVisionMedia?: boolean;
  hasAudioInput?: boolean;
  requiresTools?: boolean;
  requiresStructuredOutput?: boolean;
  requiresExtendedThinking?: boolean;
  minContextTokens?: number;
  latencyPreference?: LatencyPreference;
  costSensitivity?: CostSensitivity;
  preferredVendor?: ProviderVendor;
  preferredModelId?: string;
  allowedVendors?: ProviderVendor[];
}

export class TaskProfileBuilderImpl {
  build(input: TaskProfileInput): TaskProfile {
    const category = input.category ?? (input.executionTarget === 'REASONING' ? 'REASONING' : 'CONVERSATION');
    const executionTarget = input.executionTarget ?? (category === 'REASONING' || category === 'AUTOMATION' ? 'REASONING' : 'CHAT');

    const requiredCapabilities: TaskRequiredCapabilities = {
      toolCalling: input.requiresTools ?? (executionTarget === 'REASONING' || category === 'AUTOMATION' || category === 'CODING'),
      structuredOutput: input.requiresStructuredOutput ?? (executionTarget === 'REASONING'),
      vision: input.hasVisionMedia ?? false,
      audioInput: input.hasAudioInput ?? false,
      extendedThinking: input.requiresExtendedThinking ?? false,
      minContextTokens: input.minContextTokens ?? (input.messagesCount && input.messagesCount > 20 ? 64_000 : 8192),
    };

    const latencyPreference: LatencyPreference = input.latencyPreference ?? (category === 'CONVERSATION' ? 'FAST' : 'BALANCED');
    const costSensitivity: CostSensitivity = input.costSensitivity ?? 'BUDGET_AWARE';

    // Rough heuristic: ~4 chars per token + system prompt overhead
    const estimatedInputTokens = Math.max(
      500,
      input.goal ? Math.ceil(input.goal.length / 4) + 1000 : 1000
    );

    return {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      category,
      executionTarget,
      requiredCapabilities,
      latencyPreference,
      costSensitivity,
      estimatedInputTokens,
      maxOutputTokens: executionTarget === 'REASONING' ? 8192 : 4096,
      preferredVendor: input.preferredVendor,
      preferredModelId: input.preferredModelId,
      allowedVendors: input.allowedVendors,
    };
  }
}

export const TaskProfileBuilder = new TaskProfileBuilderImpl();
