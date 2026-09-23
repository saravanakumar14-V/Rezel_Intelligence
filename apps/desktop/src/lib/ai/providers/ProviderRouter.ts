/**
 * Rezel OS — Provider Router & Dynamic Routing Engine (Milestone 11.2C)
 *
 * Central intelligence routing authority. Dispatches Chat and Reasoning requests
 * to optimal eligible providers based on TaskProfile requirements, Routing Profiles,
 * live health states, user authorization, and CostGuard pre-execution caps.
 *
 * Enforces:
 * - Zero direct tool execution by models
 * - Immutable TaskProfile preservation across failovers
 * - Strict LOCAL policy (zero cloud calls when LOCAL profile is active)
 * - Zero-surprise billing (paid failover requires allowPaidFailover === true)
 * - Classified failover (retryable vs non-retryable)
 * - Safe diagnostic observability (no credential or secret leaks)
 */

import { ProviderRegistry } from './ProviderRegistry';
import { withIdleTimeout } from './utils/StreamTimeout';
import { ProviderHealthManager } from './ProviderHealthManager';
import { ProviderAuthManager } from './ProviderAuthManager';
import { CostGuard } from './CostGuard';
import { ProviderError } from './adapters/ProviderError';
import type {
  ProviderVendor,
  RoutingProfile,
  TaskProfile,
  ModelMetadata,
  VendorProviderPackage,
  ChatAIProvider,
  ReasoningAIProvider,
  UnifiedMessage,
  UnifiedChatOptions,
  UnifiedStreamChunk,
  UnifiedReasoningRequest,
  UnifiedReasoningResult,
  ProviderLifecycleEvent,
} from './types';

export interface SelectedRoute<T> {
  package: VendorProviderPackage;
  adapter: T;
  model: ModelMetadata;
  vendor: ProviderVendor;
  isPaid: boolean;
  routingProfile: RoutingProfile;
  selectionReason: string;
}

export type ProviderRouterEventListener = (event: ProviderLifecycleEvent) => void;

export class ProviderRouterImpl {
  private activeRoutingProfile: RoutingProfile = 'AUTO';
  private listeners: Set<ProviderRouterEventListener> = new Set();

  // ─── Active Routing Profile ───────────────────────────────────────────────

  getRoutingProfile(): RoutingProfile {
    return this.activeRoutingProfile;
  }

  setRoutingProfile(profile: RoutingProfile): void {
    this.activeRoutingProfile = profile;
  }

  // ─── Event Subscriptions ──────────────────────────────────────────────────

  subscribe(listener: ProviderRouterEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitEvent(event: ProviderLifecycleEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Ignore listener error
      }
    }
  }

  // ─── Candidate Evaluation & Selection ─────────────────────────────────────

  /**
   * Evaluates and selects the best Chat AI provider candidate.
   */
  async selectChatProvider(
    taskProfile: TaskProfile,
    routingProfile: RoutingProfile = this.activeRoutingProfile,
    options: { excludeVendors?: ProviderVendor[]; isFailover?: boolean } = {}
  ): Promise<SelectedRoute<ChatAIProvider>> {
    const candidates = await this.getCandidates(taskProfile, routingProfile, 'CHAT', options);
    if (candidates.length === 0) {
      const fallbackVendor: ProviderVendor = routingProfile === 'LOCAL' ? 'OLLAMA' : (taskProfile.preferredVendor || 'GEMINI');
      const errorMsg = routingProfile === 'LOCAL'
        ? 'No eligible local AI models available that satisfy the task requirements'
        : 'No eligible AI provider is currently available or authorized for this task';
      throw new ProviderError({
        code: routingProfile === 'LOCAL' ? 'OFFLINE' : 'SERVICE_UNAVAILABLE',
        message: errorMsg,
        vendor: fallbackVendor,
      });
    }

    const top = candidates[0];
    const pkg = ProviderRegistry.getPackage(top.model.vendor);
    if (!pkg || !pkg.chat) {
      throw new ProviderError({
        code: 'SERVICE_UNAVAILABLE',
        message: `Vendor package ${top.model.vendor} is not available`,
        vendor: top.model.vendor,
      });
    }

    this.emitEvent({
      type: options.isFailover ? 'provider_fallback' : 'provider_selected',
      timestamp: Date.now(),
      vendor: top.model.vendor,
      modelId: top.model.id,
      taskProfileId: taskProfile.id,
      payload: {
        reason: top.reason,
      },
    });

    console.info(`[ProviderRouter] Selected Chat Route: ${top.model.vendor} (${top.model.id}) | Profile: ${routingProfile} | Reason: ${top.reason}`);

    return {
      package: pkg,
      adapter: pkg.chat,
      model: top.model,
      vendor: top.model.vendor,
      isPaid: top.model.pricing.costTier !== 'FREE',
      routingProfile,
      selectionReason: top.reason,
    };
  }

  /**
   * Evaluates and selects the best Reasoning AI provider candidate.
   */
  async selectReasoningProvider(
    taskProfile: TaskProfile,
    routingProfile: RoutingProfile = this.activeRoutingProfile,
    options: { excludeVendors?: ProviderVendor[]; isFailover?: boolean } = {}
  ): Promise<SelectedRoute<ReasoningAIProvider>> {
    const candidates = await this.getCandidates(taskProfile, routingProfile, 'REASONING', options);
    if (candidates.length === 0) {
      const fallbackVendor: ProviderVendor = routingProfile === 'LOCAL' ? 'OLLAMA' : (taskProfile.preferredVendor || 'GEMINI');
      const errorMsg = routingProfile === 'LOCAL'
        ? 'No eligible local AI models available that satisfy reasoning requirements'
        : 'No eligible Reasoning provider is currently available or authorized';
      throw new ProviderError({
        code: routingProfile === 'LOCAL' ? 'OFFLINE' : 'SERVICE_UNAVAILABLE',
        message: errorMsg,
        vendor: fallbackVendor,
      });
    }

    const top = candidates[0];
    const pkg = ProviderRegistry.getPackage(top.model.vendor);
    if (!pkg || !pkg.reasoning) {
      throw new ProviderError({
        code: 'SERVICE_UNAVAILABLE',
        message: `Vendor reasoning package ${top.model.vendor} is not available`,
        vendor: top.model.vendor,
      });
    }

    this.emitEvent({
      type: options.isFailover ? 'provider_fallback' : 'provider_selected',
      timestamp: Date.now(),
      vendor: top.model.vendor,
      modelId: top.model.id,
      taskProfileId: taskProfile.id,
      payload: {
        reason: top.reason,
      },
    });

    console.info(`[ProviderRouter] Selected Reasoning Route: ${top.model.vendor} (${top.model.id}) | Profile: ${routingProfile} | Reason: ${top.reason}`);

    return {
      package: pkg,
      adapter: pkg.reasoning,
      model: top.model,
      vendor: top.model.vendor,
      isPaid: top.model.pricing.costTier !== 'FREE',
      routingProfile,
      selectionReason: top.reason,
    };
  }

  private async getCandidates(
    taskProfile: TaskProfile,
    routingProfile: RoutingProfile,
    executionTarget: 'CHAT' | 'REASONING',
    options: { excludeVendors?: ProviderVendor[]; isFailover?: boolean }
  ): Promise<Array<{ model: ModelMetadata; score: number; reason: string }>> {
    const packages = ProviderRegistry.listPackages();
    const allModels: ModelMetadata[] = [];
    
    for (const pkg of packages) {
      if (options.excludeVendors && options.excludeVendors.includes(pkg.vendor)) {
        continue;
      }
      try {
        const models = await pkg.getModels();
        allModels.push(...models);
      } catch (err) {
        console.warn(`[ProviderRouter] Failed to get models for ${pkg.vendor}`, err);
      }
    }

    const scoredCandidates: Array<{ model: ModelMetadata; score: number; reason: string }> = [];

    for (const model of allModels) {
      // 1. Exclude filter
      if (options.excludeVendors && options.excludeVendors.includes(model.vendor)) {
        continue;
      }

      // 2. Strict LOCAL Policy: Never allow cloud models when LOCAL profile is active
      if (routingProfile === 'LOCAL') {
        if (!model.isLocal && model.vendor !== 'OLLAMA' && model.vendor !== 'LOCAL') {
          continue;
        }
      }

      // 3. Provider Registered and Adapter Available
      if (!ProviderRegistry.hasPackage(model.vendor)) {
        continue;
      }
      const pkg = ProviderRegistry.getPackage(model.vendor);
      if (!pkg) {
        continue;
      }
      if (executionTarget === 'CHAT' && !pkg.chat) {
        continue;
      }
      if (executionTarget === 'REASONING' && !pkg.reasoning) {
        continue;
      }

      // 4. Provider Authorization & Keys
      const auth = ProviderAuthManager.getAuthorization(model.vendor);
      if (!auth.enabled) {
        continue;
      }
      if (executionTarget === 'REASONING' && !auth.allowedForReasoning) {
        continue;
      }
      if (taskProfile.category === 'AUTOMATION' && !auth.allowedForAutomation) {
        continue;
      }

      const isPaid = model.pricing.costTier !== 'FREE';
      const hasKey = await ProviderAuthManager.hasKey(model.vendor);
      if (!hasKey && isPaid) {
        continue;
      }

      // 5. Automatic Paid Failover Invariant:
      // If this is a failover attempt and the candidate is paid, user MUST have authorized allowPaidFailover
      if (options.isFailover && isPaid && !auth.allowPaidFailover) {
        continue;
      }

      // 6. CostGuard Pre-Execution Budget Cap
      if (isPaid) {
        const estimate = CostGuard.estimate(
          model.pricing,
          taskProfile.estimatedInputTokens,
          taskProfile.maxOutputTokens,
          auth
        );
        if (estimate.isExceedingRequestLimit || estimate.isExceedingDailyLimit) {
          continue;
        }
      }

      // 7. Health Manager Filter
      const providerHealth = ProviderHealthManager.getProviderHealth(model.vendor);
      if (
        providerHealth.state === 'AUTH_FAILED' ||
        providerHealth.state === 'DISABLED' ||
        providerHealth.state === 'OFFLINE'
      ) {
        continue;
      }

      const modelHealth = ProviderHealthManager.getModelHealth(model.id, model.vendor);
      if (
        modelHealth.state === 'RATE_LIMITED' ||
        modelHealth.state === 'QUOTA_EXHAUSTED' ||
        modelHealth.state === 'AUTH_FAILED'
      ) {
        continue;
      }

      // 8. Capability Compatibility
      const caps = model.capabilities;
      const req = taskProfile.requiredCapabilities;

      if (req.toolCalling && !caps.toolCalling) continue;
      if (req.structuredOutput && !caps.structuredOutput) continue;
      if (req.vision && !caps.vision) continue;
      if (req.audioInput && !caps.audioInput) continue;
      if (req.audioOutput && !caps.audioOutput) continue;
      if (req.extendedThinking && !caps.extendedThinking) continue;
      if (req.minContextTokens && caps.maxContextTokens < req.minContextTokens) continue;
      if (req.supportsComputerUse && !caps.supportsComputerUse) continue;

      // 9. MANUAL Profile Exact Match
      if (routingProfile === 'MANUAL') {
        if (taskProfile.preferredModelId && model.id === taskProfile.preferredModelId) {
          scoredCandidates.push({ model, score: 500, reason: 'Explicit manual model selection' });
          continue;
        }
        if (taskProfile.preferredVendor && model.vendor === taskProfile.preferredVendor) {
          scoredCandidates.push({ model, score: 400, reason: 'Explicit manual vendor selection' });
          continue;
        }
        continue;
      }

      // 10. Scoring based on RoutingProfile
      let score = 100;
      let reason = 'Standard capability match';

      if (routingProfile === 'SMART') {
        if (caps.extendedThinking) score += 50;
        if (caps.maxContextTokens >= 200_000) score += 30;
        reason = 'High reasoning and context capability';
      } else if (routingProfile === 'FAST') {
        if (model.id.includes('flash') || model.id.includes('haiku') || model.id.includes('mini') || model.id.includes('3b')) {
          score += 60;
        }
        reason = 'High throughput and low latency';
      } else if (routingProfile === 'BALANCED') {
        if (model.pricing.costTier === 'FREE' || model.pricing.costTier === 'LOW') score += 30;
        score += 20;
        reason = 'Optimal balance between capability and cost';
      } else if (routingProfile === 'LOCAL') {
        score += 80;
        reason = 'Local offline execution';
      } else {
        // AUTO Profile: Best eligible model
        if (modelHealth.state === 'HEALTHY') score += 30;
        if (caps.toolCalling) score += 10;
        if (taskProfile.category === 'REASONING' && caps.extendedThinking) score += 40;
        reason = 'Best eligible model based on task requirements and health';
      }

      // Healthy bonus
      if (modelHealth.state === 'HEALTHY') score += 20;
      if (modelHealth.state === 'PROBING') score += 5;

      scoredCandidates.push({ model, score, reason });
    }

    // Sort descending by score
    scoredCandidates.sort((a, b) => b.score - a.score);
    return scoredCandidates;
  }

  // ─── Dispatch with Classified Failover (Chat) ─────────────────────────────

  async *chat(
    taskProfile: TaskProfile,
    messages: UnifiedMessage[],
    options: UnifiedChatOptions = {}
  ): AsyncGenerator<UnifiedStreamChunk> {
    const excludedVendors: ProviderVendor[] = [];
    let currentAttempt = 0;
    const maxAttempts = 3;

    while (currentAttempt < maxAttempts) {
      currentAttempt++;
      let route: SelectedRoute<ChatAIProvider>;

      try {
        route = await this.selectChatProvider(taskProfile, this.activeRoutingProfile, {
          excludeVendors: excludedVendors,
          isFailover: currentAttempt > 1,
        });
      } catch (err: any) {
        yield { type: 'error', error: err?.message || 'No eligible provider available' };
        return;
      }

      let errorOccurred: { code: string; message: string; isRetryable: boolean } | null = null;
      let streamedAnyText = false;

      try {
        const baseStream = route.adapter.chat(route.model.id, messages, options);
        // Default 30s idle timeout for streaming chunks
        const stream = withIdleTimeout(baseStream, 30000);
        
        for await (const chunk of stream) {
          if (chunk.type === 'text') {
            streamedAnyText = true;
            yield chunk;
          } else if (chunk.type === 'tool_call') {
            yield chunk;
          } else if (chunk.type === 'error') {
            const rawErr = chunk.error || 'Unknown streaming error';
            let extractedCode: import('./adapters/ProviderError').ProviderErrorCode = 'UNKNOWN_PROVIDER_ERROR';
            if (rawErr.includes('AUTHENTICATION_FAILURE') || rawErr.includes('401') || rawErr.includes('403')) {
              extractedCode = 'AUTHENTICATION_FAILURE';
            } else if (rawErr.includes('INVALID_REQUEST') || rawErr.includes('400')) {
              extractedCode = 'INVALID_REQUEST';
            } else if (rawErr.includes('QUOTA_EXHAUSTED') || rawErr.toLowerCase().includes('quota')) {
              extractedCode = 'QUOTA_EXHAUSTED';
            } else if (rawErr.includes('RATE_LIMIT') || rawErr.includes('429')) {
              extractedCode = 'RATE_LIMIT';
            } else if (rawErr.includes('OFFLINE')) {
              extractedCode = 'OFFLINE';
            } else if (rawErr.includes('SERVICE_UNAVAILABLE') || rawErr.includes('503') || rawErr.includes('529')) {
              extractedCode = 'SERVICE_UNAVAILABLE';
            } else if (rawErr.includes('TIMEOUT')) {
              extractedCode = 'TIMEOUT';
            }

            const isRetryable = ProviderError.isRetryable(new ProviderError({
              code: extractedCode,
              message: rawErr,
              vendor: route.vendor,
            }));
            errorOccurred = { code: extractedCode, message: rawErr, isRetryable };
            break;
          } else if (chunk.type === 'done') {
            yield chunk;
            return;
          }
        }
      } catch (streamErr: any) {
        let extractedCode: import('./adapters/ProviderError').ProviderErrorCode = 'UNKNOWN_PROVIDER_ERROR';
        if (streamErr?.name === 'StreamTimeoutError') {
          extractedCode = 'TIMEOUT';
        } else {
          extractedCode = streamErr?.code || 'UNKNOWN_PROVIDER_ERROR';
        }
        
        const isRetryable = ProviderError.isRetryable(streamErr) || extractedCode === 'TIMEOUT';
        errorOccurred = {
          code: extractedCode,
          message: streamErr?.message || String(streamErr),
          isRetryable,
        };
      }

      if (errorOccurred) {
        // If we already streamed partial text to the user, DO NOT failover mid-sentence to avoid duplicate/garbled text
        if (streamedAnyText || !errorOccurred.isRetryable) {
          this.emitEvent({
            type: 'provider_failed',
            timestamp: Date.now(),
            vendor: route.vendor,
            modelId: route.model.id,
            taskProfileId: taskProfile.id,
            payload: {
              reason: errorOccurred.message,
            },
          });
          yield { type: 'error', error: errorOccurred.message };
          return;
        }

        // Retryable error before output: record failure and try next candidate with SAME task profile
        console.warn(`[ProviderRouter] Provider ${route.vendor} failed with retryable error (${errorOccurred.message}). Initiating classified failover...`);
        excludedVendors.push(route.vendor);
        this.emitEvent({
          type: 'provider_failed',
          timestamp: Date.now(),
          vendor: route.vendor,
          modelId: route.model.id,
          taskProfileId: taskProfile.id,
          payload: {
            reason: errorOccurred.message,
          },
        });
        continue;
      }

      return;
    }

    yield { type: 'error', error: 'All eligible AI providers failed to respond' };
  }

  // ─── Dispatch with Classified Failover (Reasoning) ─────────────────────────

  async reason(
    taskProfile: TaskProfile,
    request: UnifiedReasoningRequest,
    optionsOrSignal?: { routingProfile?: RoutingProfile; signal?: AbortSignal } | AbortSignal
  ): Promise<UnifiedReasoningResult> {
    const signal = optionsOrSignal instanceof AbortSignal ? optionsOrSignal : optionsOrSignal?.signal;
    const routingProfile = (optionsOrSignal && !(optionsOrSignal instanceof AbortSignal) && optionsOrSignal.routingProfile)
      ? optionsOrSignal.routingProfile
      : this.activeRoutingProfile;

    const excludedVendors: ProviderVendor[] = [];
    let currentAttempt = 0;
    const maxAttempts = 3;

    while (currentAttempt < maxAttempts) {
      currentAttempt++;
      const route = await this.selectReasoningProvider(taskProfile, routingProfile, {
        excludeVendors: excludedVendors,
        isFailover: currentAttempt > 1,
      });

      try {
        const result = await route.adapter.reason(route.model.id, request, signal);
        return result;
      } catch (err: any) {
        const isRetryable = ProviderError.isRetryable(err);
        this.emitEvent({
          type: 'provider_failed',
          timestamp: Date.now(),
          vendor: route.vendor,
          modelId: route.model.id,
          taskProfileId: taskProfile.id,
          payload: {
            reason: err?.message || String(err),
          },
        });

        if (!isRetryable || signal?.aborted) {
          throw err;
        }

        console.warn(`[ProviderRouter] Reasoning provider ${route.vendor} failed retryably. Triggering fallback...`);
        excludedVendors.push(route.vendor);
      }
    }

    throw new ProviderError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'All eligible reasoning providers exhausted during failover',
      vendor: excludedVendors[0] || 'GEMINI',
    });
  }
}

export const ProviderRouter = new ProviderRouterImpl();
