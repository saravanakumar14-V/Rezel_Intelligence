/**
 * REZEL PHASE 17 — CONTROLLED AUTONOMY: SAFETY BUDGET MANAGER
 *
 * Deterministically tracks and limits execution, correction attempts, token consumption,
 * and wall-clock duration for autonomous goal pursuit.
 *
 * Invariant: Never allow unbound or infinite execution loops.
 */

import type { SafetyBudget, SafetyBudgetConfig } from './types';

export const DEFAULT_AUTONOMY_BUDGET: Required<SafetyBudgetConfig> = {
  maxOperations: 15,
  maxCorrections: 3,
  maxTokens: 50_000,
  maxDurationMs: 60_000, // 60 seconds
};

export class SafetyBudgetManager {
  private budget: SafetyBudget;

  constructor(config?: SafetyBudgetConfig) {
    this.budget = {
      maxOperations: config?.maxOperations ?? DEFAULT_AUTONOMY_BUDGET.maxOperations,
      maxCorrections: config?.maxCorrections ?? DEFAULT_AUTONOMY_BUDGET.maxCorrections,
      maxTokens: config?.maxTokens ?? DEFAULT_AUTONOMY_BUDGET.maxTokens,
      maxDurationMs: config?.maxDurationMs ?? DEFAULT_AUTONOMY_BUDGET.maxDurationMs,
      operationsUsed: 0,
      correctionsUsed: 0,
      tokensUsed: 0,
      startTime: Date.now(),
      durationMs: 0,
      exhausted: false,
    };
  }

  /**
   * Consumes an operation slot. Throws or returns false if budget is exceeded.
   */
  consumeOperation(count: number = 1): boolean {
    this.updateDuration();
    if (this.budget.exhausted) return false;

    if (this.budget.operationsUsed + count > this.budget.maxOperations) {
      this.budget.exhausted = true;
      this.budget.exhaustionReason = `Operation budget exhausted (${this.budget.operationsUsed + count}/${this.budget.maxOperations})`;
      return false;
    }

    this.budget.operationsUsed += count;
    return true;
  }

  /**
   * Consumes a correction slot. Throws or returns false if budget is exceeded.
   */
  consumeCorrection(count: number = 1): boolean {
    this.updateDuration();
    if (this.budget.exhausted) return false;

    if (this.budget.correctionsUsed + count > this.budget.maxCorrections) {
      this.budget.exhausted = true;
      this.budget.exhaustionReason = `Correction budget exhausted (${this.budget.correctionsUsed + count}/${this.budget.maxCorrections})`;
      return false;
    }

    this.budget.correctionsUsed += count;
    return true;
  }

  /**
   * Consumes tokens.
   */
  consumeTokens(tokens: number): boolean {
    this.updateDuration();
    if (this.budget.exhausted) return false;

    if (this.budget.tokensUsed + tokens > this.budget.maxTokens) {
      this.budget.exhausted = true;
      this.budget.exhaustionReason = `Token budget exhausted (${this.budget.tokensUsed + tokens}/${this.budget.maxTokens})`;
      return false;
    }

    this.budget.tokensUsed += tokens;
    return true;
  }

  /**
   * Evaluates time budget.
   */
  checkTimeBudget(): boolean {
    this.updateDuration();
    if (this.budget.durationMs > this.budget.maxDurationMs) {
      this.budget.exhausted = true;
      this.budget.exhaustionReason = `Time budget exceeded (${this.budget.durationMs}ms > ${this.budget.maxDurationMs}ms)`;
      return false;
    }
    return !this.budget.exhausted;
  }

  private updateDuration(): void {
    this.budget.durationMs = Date.now() - this.budget.startTime;
    if (this.budget.durationMs > this.budget.maxDurationMs) {
      this.budget.exhausted = true;
      this.budget.exhaustionReason = `Time budget exceeded (${this.budget.durationMs}ms > ${this.budget.maxDurationMs}ms)`;
    }
  }

  getSnapshot(): SafetyBudget {
    this.updateDuration();
    return { ...this.budget };
  }

  getRemaining(): {
    operations: number;
    corrections: number;
    tokens: number;
    durationMs: number;
  } {
    this.updateDuration();
    return {
      operations: Math.max(0, this.budget.maxOperations - this.budget.operationsUsed),
      corrections: Math.max(0, this.budget.maxCorrections - this.budget.correctionsUsed),
      tokens: Math.max(0, this.budget.maxTokens - this.budget.tokensUsed),
      durationMs: Math.max(0, this.budget.maxDurationMs - this.budget.durationMs),
    };
  }

  isExhausted(): boolean {
    this.updateDuration();
    return this.budget.exhausted;
  }

  getExhaustionReason(): string | undefined {
    return this.budget.exhaustionReason;
  }
}
