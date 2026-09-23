/**
 * Rezel OS — Provider & Model Health Manager (Milestone 11.2A)
 *
 * Tracks health states, circuit breakers, dynamic cooldowns, and lifecycle events
 * separately for Provider Accounts and Individual Models.
 */

import type {
  HealthState,
  AvailabilityRecord,
  ProviderVendor,
  ProviderLifecycleEvent,
  ProviderLifecycleEventType,
} from './types';

type HealthEventListener = (event: ProviderLifecycleEvent) => void;

export class ProviderHealthManagerImpl {
  private providerHealth = new Map<ProviderVendor, AvailabilityRecord>();
  private modelHealth = new Map<string, AvailabilityRecord>();
  private listeners = new Set<HealthEventListener>();

  constructor() {
    this.initDefaultHealth();
  }

  private initDefaultHealth(): void {
    const vendors: ProviderVendor[] = ['GEMINI', 'OPENAI', 'ANTHROPIC', 'OLLAMA', 'LOCAL'];
    for (const vendor of vendors) {
      this.providerHealth.set(vendor, {
        state: 'HEALTHY',
        scope: 'PROVIDER',
        targetId: vendor,
        consecutiveFailures: 0,
        lastSuccessTimestamp: Date.now(),
      });
    }
  }

  // ─── Query Health ───────────────────────────────────────────────────────────

  getProviderHealth(vendor: ProviderVendor): AvailabilityRecord {
    const record = this.providerHealth.get(vendor);
    if (!record) {
      return {
        state: 'HEALTHY',
        scope: 'PROVIDER',
        targetId: vendor,
        consecutiveFailures: 0,
      };
    }
    return this.evaluateCooldown(record);
  }

  getModelHealth(modelId: string, vendor: ProviderVendor): AvailabilityRecord {
    // 1. If provider is AUTH_FAILED, OFFLINE, or DISABLED, model inherits it
    const pHealth = this.getProviderHealth(vendor);
    if (pHealth.state === 'AUTH_FAILED' || pHealth.state === 'OFFLINE' || pHealth.state === 'DISABLED') {
      return {
        state: pHealth.state,
        scope: 'MODEL',
        targetId: modelId,
        lastError: pHealth.lastError,
        consecutiveFailures: pHealth.consecutiveFailures,
      };
    }

    const record = this.modelHealth.get(modelId);
    if (!record) {
      return {
        state: pHealth.state === 'DEGRADED' ? 'DEGRADED' : 'HEALTHY',
        scope: 'MODEL',
        targetId: modelId,
        consecutiveFailures: 0,
        lastSuccessTimestamp: Date.now(),
      };
    }
    return this.evaluateCooldown(record);
  }

  isModelAvailable(modelId: string, vendor: ProviderVendor): boolean {
    const pHealth = this.getProviderHealth(vendor);
    if (pHealth.state !== 'HEALTHY' && pHealth.state !== 'DEGRADED' && pHealth.state !== 'PROBING') {
      return false;
    }
    const mHealth = this.getModelHealth(modelId, vendor);
    return mHealth.state === 'HEALTHY' || mHealth.state === 'DEGRADED' || mHealth.state === 'PROBING';
  }

  // ─── Update State ───────────────────────────────────────────────────────────

  recordSuccess(vendor: ProviderVendor, modelId?: string, taskProfileId: string = 'system'): void {
    const now = Date.now();
    const prevProvider = this.getProviderHealth(vendor);
    
    // Clear provider failure state
    this.providerHealth.set(vendor, {
      state: 'HEALTHY',
      scope: 'PROVIDER',
      targetId: vendor,
      consecutiveFailures: 0,
      lastSuccessTimestamp: now,
    });

    if (prevProvider.state !== 'HEALTHY') {
      this.emitEvent({
        type: 'provider_recovered',
        timestamp: now,
        vendor,
        taskProfileId,
        payload: { reason: 'Successful operation completed' },
      });
    }

    if (modelId) {
      this.modelHealth.set(modelId, {
        state: 'HEALTHY',
        scope: 'MODEL',
        targetId: modelId,
        consecutiveFailures: 0,
        lastSuccessTimestamp: now,
      });
    }
  }

  recordFailure(options: {
    vendor: ProviderVendor;
    modelId?: string;
    taskProfileId?: string;
    errorCode: string;
    errorMessage: string;
    httpStatus?: number;
    retryAfterHeader?: string;
    resetAtHeader?: string;
  }): void {
    const { vendor, modelId, taskProfileId = 'system', errorCode, errorMessage, httpStatus, retryAfterHeader, resetAtHeader } = options;
    const now = Date.now();
    const parsedRetryAfterMs = this.parseRetryAfter(retryAfterHeader);
    const parsedResetAt = this.parseResetAt(resetAtHeader, parsedRetryAfterMs);

    let nextState: HealthState = 'DEGRADED';
    let isProviderScope = false;

    if (httpStatus === 401 || httpStatus === 403 || errorCode === 'AUTHENTICATION_FAILURE') {
      nextState = 'AUTH_FAILED';
      isProviderScope = true;
    } else if (httpStatus === 429 || errorCode === 'RATE_LIMIT') {
      nextState = 'RATE_LIMITED';
    } else if (errorCode === 'QUOTA_EXHAUSTED' || errorMessage.toLowerCase().includes('quota exhausted')) {
      nextState = 'QUOTA_EXHAUSTED';
    } else if (errorCode === 'OFFLINE' || errorCode === 'ECONNREFUSED') {
      nextState = 'OFFLINE';
      isProviderScope = true;
    } else {
      nextState = 'DEGRADED';
    }

    const lastError = {
      code: errorCode,
      message: errorMessage,
      timestamp: now,
      httpStatus,
    };

    if (isProviderScope || !modelId) {
      const prev = this.getProviderHealth(vendor);
      this.providerHealth.set(vendor, {
        state: nextState,
        scope: 'PROVIDER',
        targetId: vendor,
        retryAfterMs: parsedRetryAfterMs,
        resetAt: parsedResetAt,
        lastError,
        consecutiveFailures: prev.consecutiveFailures + 1,
      });
    }

    if (modelId) {
      const prev = this.modelHealth.get(modelId) || { consecutiveFailures: 0 };
      this.modelHealth.set(modelId, {
        state: nextState,
        scope: 'MODEL',
        targetId: modelId,
        retryAfterMs: parsedRetryAfterMs,
        resetAt: parsedResetAt,
        lastError,
        consecutiveFailures: prev.consecutiveFailures + 1,
      });
    }

    // Emit lifecycle event
    let eventType: ProviderLifecycleEventType = 'provider_failed';
    if (nextState === 'RATE_LIMITED') eventType = 'provider_rate_limited';
    else if (nextState === 'QUOTA_EXHAUSTED') eventType = 'provider_quota_exhausted';
    else if (nextState === 'AUTH_FAILED') eventType = 'provider_auth_failed';

    this.emitEvent({
      type: eventType,
      timestamp: now,
      vendor,
      modelId,
      taskProfileId,
      payload: {
        reason: errorMessage,
        retryAfterMs: parsedRetryAfterMs,
        resetAt: parsedResetAt,
      },
    });
  }

  setProviderDisabled(vendor: ProviderVendor, disabled: boolean): void {
    const now = Date.now();
    this.providerHealth.set(vendor, {
      state: disabled ? 'DISABLED' : 'HEALTHY',
      scope: 'PROVIDER',
      targetId: vendor,
      consecutiveFailures: 0,
      lastSuccessTimestamp: now,
    });

    if (disabled) {
      this.emitEvent({
        type: 'provider_disabled',
        timestamp: now,
        vendor,
        taskProfileId: 'settings',
        payload: { reason: 'User disabled in settings' },
      });
    }
  }

  // ─── Cooldown & Circuit Breaker Logic ───────────────────────────────────────

  private evaluateCooldown(record: AvailabilityRecord): AvailabilityRecord {
    if (record.state !== 'RATE_LIMITED' && record.state !== 'QUOTA_EXHAUSTED' && record.state !== 'DEGRADED') {
      return record;
    }

    const now = Date.now();

    // 1. Check resetAt ISO timestamp
    if (record.resetAt) {
      const resetTime = new Date(record.resetAt).getTime();
      if (now >= resetTime) {
        return { ...record, state: 'PROBING' };
      }
    }

    // 2. Check retryAfterMs
    if (record.retryAfterMs && record.lastError) {
      const expiryTime = record.lastError.timestamp + record.retryAfterMs;
      if (now >= expiryTime) {
        return { ...record, state: 'PROBING' };
      }
    }

    // 3. Fallback probing window for rate-limits without headers (exponential: 15s * 2^failures, max 5m)
    if (record.state === 'RATE_LIMITED' && record.lastError) {
      const backoffMs = Math.min(15_000 * Math.pow(2, Math.max(0, record.consecutiveFailures - 1)), 300_000);
      if (now >= record.lastError.timestamp + backoffMs) {
        return { ...record, state: 'PROBING' };
      }
    }

    return record;
  }

  private parseRetryAfter(header?: string): number | undefined {
    if (!header) return undefined;
    const trimmed = header.trim();
    // Seconds as integer
    const seconds = parseInt(trimmed, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }
    // HTTP Date
    const parsedDate = new Date(trimmed).getTime();
    if (!isNaN(parsedDate) && parsedDate > Date.now()) {
      return parsedDate - Date.now();
    }
    return undefined;
  }

  private parseResetAt(header?: string, retryAfterMs?: number): string | undefined {
    if (header) {
      const parsedDate = new Date(header);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString();
      }
    }
    if (retryAfterMs) {
      return new Date(Date.now() + retryAfterMs).toISOString();
    }
    return undefined;
  }

  // ─── Lifecycle Event Subscription ───────────────────────────────────────────

  subscribe(listener: HealthEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emitEvent(event: ProviderLifecycleEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[ProviderHealthManager] Error in event listener:', err);
      }
    }
  }
}

export const ProviderHealthManager = new ProviderHealthManagerImpl();
