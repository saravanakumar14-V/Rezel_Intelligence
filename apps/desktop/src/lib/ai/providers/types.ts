/**
 * Rezel OS — Commercial Multi-Provider Platform Type Contracts (Milestone 11.2)
 *
 * Establishes provider-agnostic schemas, health models, task profiles,
 * capability descriptors, and lifecycle telemetry.
 */

// ─── 1. Vendor & Routing Enums ────────────────────────────────────────────────

export type ProviderVendor = 'GEMINI' | 'OPENAI' | 'ANTHROPIC' | 'OLLAMA' | 'LOCAL';

export type RoutingProfile =
  | 'AUTO'       // Intelligently picks best candidate based on task complexity & health
  | 'SMART'      // Prioritizes maximum reasoning depth and context capacity
  | 'BALANCED'   // Balances high quality, fast latency, and low cost
  | 'FAST'       // Lowest latency, instant streaming responses
  | 'LOCAL'      // 100% offline, zero cloud API calls
  | 'MANUAL';    // User explicitly locks chat/reasoning to a specific model

export type CostTier = 'FREE' | 'LOW' | 'MEDIUM' | 'HIGH';

// ─── 2. Health & Availability Model ───────────────────────────────────────────

export type HealthState =
  | 'HEALTHY'          // Fully operational and verified
  | 'DEGRADED'         // Experiencing high latency (>5s) or transient non-fatal retries
  | 'RATE_LIMITED'     // Temporary 429 rate limit active (RPM/TPM cooldown)
  | 'QUOTA_EXHAUSTED'  // Plan or daily token/request budget exhausted
  | 'AUTH_FAILED'      // Invalid API key (HTTP 401/403)
  | 'OFFLINE'          // Endpoint unreachable (ECONNREFUSED / DNS failure)
  | 'DISABLED'         // Explicitly disabled by user in settings
  | 'PROBING';         // Half-open circuit breaker test in progress

export interface AvailabilityRecord {
  readonly state: HealthState;
  readonly scope: 'PROVIDER' | 'MODEL';
  readonly targetId: string;
  /** Milliseconds until probe retry is allowed (derived from Retry-After or exponential backoff) */
  readonly retryAfterMs?: number;
  /** ISO timestamp when quota or rate limit is expected to reset */
  readonly resetAt?: string;
  /** Last recorded error with classification */
  readonly lastError?: {
    readonly code: string;
    readonly message: string;
    readonly timestamp: number;
    readonly httpStatus?: number;
  };
  readonly consecutiveFailures: number;
  readonly lastSuccessTimestamp?: number;
}

// ─── 3. Capabilities & Model Metadata ─────────────────────────────────────────

export interface ModelCapabilities {
  readonly text: boolean;
  readonly vision: boolean;
  readonly audioInput: boolean;
  readonly audioOutput: boolean;
  readonly toolCalling: boolean;
  readonly structuredOutput: boolean;
  readonly streaming: boolean;
  readonly systemPrompt: boolean;
  readonly extendedThinking: boolean;
  readonly maxContextTokens: number;
  readonly maxOutputTokens: number;
  readonly supportsComputerUse: boolean;
}

export interface ModelPricing {
  readonly inputPerMillionUSD: number;
  readonly outputPerMillionUSD: number;
  readonly costTier: CostTier;
}

export type TaskCategory = 'CONVERSATION' | 'REASONING' | 'CODING' | 'VISION' | 'AUTOMATION' | 'SYSTEM';

export interface ModelMetadata {
  readonly id: string;
  readonly vendor: ProviderVendor;
  readonly displayName: string;
  readonly capabilities: ModelCapabilities;
  readonly pricing: ModelPricing;
  readonly supportedTaskCategories: TaskCategory[];
  readonly isLocal: boolean;
  readonly isDeprecated?: boolean;
  readonly replacementModelId?: string;
}

// ─── 4. Task Profile & Policies ───────────────────────────────────────────────

export type LatencyPreference = 'FAST' | 'BALANCED' | 'THOROUGH';
export type CostSensitivity = 'FREE_ONLY' | 'BUDGET_AWARE' | 'ANY_AUTHORIZED';

export interface TaskRequiredCapabilities {
  readonly toolCalling?: boolean;
  readonly structuredOutput?: boolean;
  readonly vision?: boolean;
  readonly audioInput?: boolean;
  readonly audioOutput?: boolean;
  readonly extendedThinking?: boolean;
  readonly minContextTokens?: number;
  readonly supportsComputerUse?: boolean;
}

export interface TaskProfile {
  readonly id: string;
  readonly category: TaskCategory;
  readonly executionTarget: 'CHAT' | 'REASONING';
  readonly requiredCapabilities: TaskRequiredCapabilities;
  readonly latencyPreference: LatencyPreference;
  readonly costSensitivity: CostSensitivity;
  readonly estimatedInputTokens: number;
  readonly maxOutputTokens?: number;
  readonly preferredVendor?: ProviderVendor;
  readonly preferredModelId?: string;
  readonly allowedVendors?: ProviderVendor[];
}

export interface ProviderRoute {
  readonly vendor: ProviderVendor;
  readonly modelId: string;
  readonly routingProfile: RoutingProfile;
  readonly capabilities: ModelCapabilities;
  readonly isPaid: boolean;
  readonly selectionReason: string;
  readonly taskProfileId: string;
  readonly selectedAt: number;
}

// ─── 5. User Authorization & Cost Guard ───────────────────────────────────────

export interface UserProviderAuthorization {
  readonly vendor: ProviderVendor;
  readonly enabled: boolean;
  readonly allowPaidFailover: boolean;     // MUST be explicitly true to allow automatic paid fallback
  readonly allowedForReasoning: boolean;
  readonly allowedForAutomation: boolean;
  readonly maxCostPerRequestUSD: number;   // e.g. $0.50
  readonly maxDailyCostUSD: number;        // e.g. $5.00
  readonly currentDailySpentUSD: number;
  readonly dailySpendResetDate: string;    // 'YYYY-MM-DD'
}

export interface CostEstimate {
  readonly estimatedCostUSD: number;
  readonly isExceedingRequestLimit: boolean;
  readonly isExceedingDailyLimit: boolean;
  readonly costTier: CostTier;
}

// ─── 6. Provider Lifecycle Events ─────────────────────────────────────────────

export type ProviderLifecycleEventType =
  | 'provider_selected'
  | 'provider_failed'
  | 'provider_fallback'
  | 'provider_recovered'
  | 'provider_rate_limited'
  | 'provider_quota_exhausted'
  | 'provider_auth_failed'
  | 'provider_disabled';

export interface ProviderLifecycleEvent {
  readonly type: ProviderLifecycleEventType;
  readonly timestamp: number;
  readonly vendor: ProviderVendor;
  readonly modelId?: string;
  readonly taskProfileId: string;
  readonly payload: {
    readonly reason?: string;
    readonly retryAfterMs?: number;
    readonly resetAt?: string;
    readonly fallbackVendor?: ProviderVendor;
    readonly fallbackModelId?: string;
    readonly estimatedCostUSD?: number;
    readonly latencyMs?: number;
  };
}

// ─── 7. Unified Messages & Payloads ───────────────────────────────────────────

export interface UnifiedMessage {
  readonly role: 'user' | 'assistant' | 'system' | 'tool';
  readonly content: string;
  readonly toolCalls?: Array<{
    readonly id: string;
    readonly name: string;
    readonly args: Record<string, unknown>;
    /** Gemini 3.x: opaque thought signature for multi-turn tool use */
    readonly thoughtSignature?: string;
    /** Raw part from provider response (for echo-back fidelity) */
    readonly rawPart?: any;
  }>;
  readonly toolResults?: Array<{
    readonly callId: string;
    readonly name: string;
    readonly output: string;
    readonly success: boolean;
  }>;
  readonly timestamp: string;
}

export interface UnifiedChatOptions {
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly systemPrompt?: string;
  readonly tools?: any[];
  readonly signal?: AbortSignal;
}

export interface UnifiedStreamChunk {
  readonly type: 'text' | 'tool_call' | 'done' | 'error';
  readonly text?: string;
  readonly toolCall?: {
    readonly id: string;
    readonly name: string;
    readonly args: Record<string, unknown>;
    /** Gemini 3.x: opaque thought signature for multi-turn tool use */
    readonly thoughtSignature?: string;
    /** Raw part from the provider response (for echo-back fidelity) */
    readonly rawPart?: any;
  };
  readonly error?: string;
}

export interface UnifiedReasoningRequest {
  readonly goal: string;
  readonly context: any;
  readonly previousCycleResult?: any;
  readonly structuredOutputSchema?: Record<string, unknown>;
  readonly maxResponseTokens?: number;
}

export interface UnifiedReasoningResult {
  readonly raw: string;
  readonly structured?: any;
  readonly tokenUsage: { input: number; output: number };
  readonly latencyMs: number;
  readonly providerId: string;
  readonly modelId: string;
}

// ─── 8. Provider Interfaces ───────────────────────────────────────────────────

export interface BaseProvider {
  readonly vendor: ProviderVendor;
  readonly displayName: string;
  isAvailable(): Promise<boolean>;
  getHealth(): AvailabilityRecord;
}

export interface ChatAIProvider extends BaseProvider {
  chat(
    modelId: string,
    messages: UnifiedMessage[],
    options: UnifiedChatOptions
  ): AsyncGenerator<UnifiedStreamChunk>;
}

export interface ReasoningAIProvider extends BaseProvider {
  reason(
    modelId: string,
    request: UnifiedReasoningRequest,
    signal?: AbortSignal
  ): Promise<UnifiedReasoningResult>;
}

export interface VendorProviderPackage {
  readonly vendor: ProviderVendor;
  readonly displayName: string;
  readonly chat?: ChatAIProvider;
  readonly reasoning?: ReasoningAIProvider;
  getModels(): Promise<ModelMetadata[]>;
  getHealth(): AvailabilityRecord;
}
