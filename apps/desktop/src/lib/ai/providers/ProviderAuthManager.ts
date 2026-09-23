/**
 * Rezel OS — Provider Authorization & Key Manager (Milestone 11.2A)
 *
 * Secure multi-provider credential bridge and user authorization enforcement.
 * Enforces zero-surprise billing guarantees and paid-failover rules.
 */

import { invoke } from '@tauri-apps/api/core';
import type { ProviderVendor, UserProviderAuthorization } from './types';

const STORAGE_AUTH_PREFIX = 'rezel_auth_';
const MEMORY_KEYS = new Map<string, string>();

export class ProviderAuthManagerImpl {
  private authorizations = new Map<ProviderVendor, UserProviderAuthorization>();

  constructor() {
    this.initDefaultAuthorizations();
    this.migrateLegacyKey();
  }

  private initDefaultAuthorizations(): void {
    const defaultVendors: ProviderVendor[] = ['GEMINI', 'OPENAI', 'ANTHROPIC', 'OLLAMA', 'LOCAL'];
    const today = new Date().toISOString().split('T')[0];

    for (const vendor of defaultVendors) {
      const isLocal = vendor === 'OLLAMA' || vendor === 'LOCAL';
      this.authorizations.set(vendor, {
        vendor,
        enabled: isLocal || vendor === 'GEMINI',
        allowPaidFailover: false, // Strict default: NEVER silently bill secondary paid providers
        allowedForReasoning: true,
        allowedForAutomation: true,
        maxCostPerRequestUSD: 0.50,
        maxDailyCostUSD: 5.00,
        currentDailySpentUSD: 0,
        dailySpendResetDate: today,
      });
    }

    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      for (const [vendor, defaultAuth] of this.authorizations.entries()) {
        const stored = localStorage.getItem(`${STORAGE_AUTH_PREFIX}${vendor}`);
        if (stored) {
          const parsed = JSON.parse(stored);
          this.authorizations.set(vendor, {
            ...defaultAuth,
            ...parsed,
          });
        }
      }
    } catch {
      // Ignore storage errors in non-browser envs
    }
  }

  private saveToStorage(vendor: ProviderVendor): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const auth = this.authorizations.get(vendor);
      if (auth) {
        localStorage.setItem(`${STORAGE_AUTH_PREFIX}${vendor}`, JSON.stringify(auth));
      }
    } catch {
      // Ignore storage errors
    }
  }

  // ─── Keyring Credentials Bridge ─────────────────────────────────────────────

  async saveKey(vendor: ProviderVendor, apiKey: string): Promise<void> {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      throw new Error('API key cannot be empty');
    }

    MEMORY_KEYS.set(vendor, trimmed);

    try {
      if (vendor === 'GEMINI') {
        await invoke('save_api_key', { key: trimmed });
      } else if (vendor === 'OPENAI') {
        await invoke('save_search_api_key', { key: trimmed }).catch(() => {});
      }
    } catch {
      // In offline/test environments, memory storage remains active
    }

    // Enable provider automatically when valid key is provided
    this.updateAuthorization(vendor, { enabled: true });
  }

  async getKey(vendor: ProviderVendor): Promise<string | undefined> {
    // 1. In-memory check
    const inMem = MEMORY_KEYS.get(vendor);
    if (inMem) return inMem;

    // 2. Env variable check
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      if (vendor === 'GEMINI' && import.meta.env.VITE_GEMINI_API_KEY) return import.meta.env.VITE_GEMINI_API_KEY;
      if (vendor === 'OPENAI' && import.meta.env.VITE_OPENAI_API_KEY) return import.meta.env.VITE_OPENAI_API_KEY;
      if (vendor === 'ANTHROPIC' && import.meta.env.VITE_ANTHROPIC_API_KEY) return import.meta.env.VITE_ANTHROPIC_API_KEY;
    }

    // 3. Node process.env check
    if (typeof globalThis !== 'undefined' && (globalThis as any).process?.env) {
      const env = (globalThis as any).process.env;
      if (vendor === 'GEMINI' && env.VITE_GEMINI_API_KEY) return env.VITE_GEMINI_API_KEY;
      if (vendor === 'OPENAI' && env.VITE_OPENAI_API_KEY) return env.VITE_OPENAI_API_KEY;
      if (vendor === 'ANTHROPIC' && env.VITE_ANTHROPIC_API_KEY) return env.VITE_ANTHROPIC_API_KEY;
    }

    // 4. Tauri OS keyring check
    try {
      if (vendor === 'GEMINI') {
        const key = await invoke<string>('get_api_key');
        if (key) {
          MEMORY_KEYS.set(vendor, key);
          return key;
        }
      }
    } catch {
      // Key not present in keyring
    }

    return undefined;
  }

  async hasKey(vendor: ProviderVendor): Promise<boolean> {
    if (vendor === 'OLLAMA' || vendor === 'LOCAL') return true;
    const key = await this.getKey(vendor);
    return Boolean(key && key.length > 0);
  }

  async deleteKey(vendor: ProviderVendor): Promise<void> {
    MEMORY_KEYS.delete(vendor);
    try {
      if (vendor === 'GEMINI') {
        await invoke('delete_api_key');
      }
    } catch {
      // Ignore delete errors
    }
  }

  // ─── Authorization Policies & Cost Caps ─────────────────────────────────────

  getAuthorization(vendor: ProviderVendor): UserProviderAuthorization {
    this.refreshDailySpendCounter(vendor);
    return this.authorizations.get(vendor)!;
  }

  updateAuthorization(vendor: ProviderVendor, updates: Partial<UserProviderAuthorization>): UserProviderAuthorization {
    const current = this.getAuthorization(vendor);
    const updated: UserProviderAuthorization = {
      ...current,
      ...updates,
      vendor,
    };
    this.authorizations.set(vendor, updated);
    this.saveToStorage(vendor);
    return updated;
  }

  recordSpend(vendor: ProviderVendor, costUSD: number): void {
    if (costUSD <= 0) return;
    const auth = this.getAuthorization(vendor);
    this.updateAuthorization(vendor, {
      currentDailySpentUSD: auth.currentDailySpentUSD + costUSD,
    });
  }

  private refreshDailySpendCounter(vendor: ProviderVendor): void {
    const auth = this.authorizations.get(vendor);
    if (!auth) return;
    const today = new Date().toISOString().split('T')[0];
    if (auth.dailySpendResetDate !== today) {
      this.authorizations.set(vendor, {
        ...auth,
        currentDailySpentUSD: 0,
        dailySpendResetDate: today,
      });
      this.saveToStorage(vendor);
    }
  }

  private async migrateLegacyKey(): Promise<void> {
    try {
      const legacyKey = await this.getKey('GEMINI');
      if (legacyKey) {
        this.updateAuthorization('GEMINI', { enabled: true });
      }
    } catch {
      // Ignore migration errors
    }
  }
}

export const ProviderAuthManager = new ProviderAuthManagerImpl();
