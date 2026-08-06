import type { RiskLevel } from './PermissionManager';

export type AuditOutcome =
  | 'ALLOWED'
  | 'DENIED_BY_USER'
  | 'BLOCKED_CRITICAL'
  | 'BLOCKED_UNSAFE'
  | 'ERROR';

export interface AuditEntry {
  readonly id: string;
  readonly timestamp: string;           // ISO-8601
  readonly tool: string;
  readonly action: string;
  readonly args: readonly unknown[];
  readonly risk: RiskLevel;
  readonly outcome: AuditOutcome;
  readonly reason?: string;
  readonly durationMs?: number;
}

/**
 * AuditLogger
 *
 * Append-only in-memory audit trail for all ToolExecutor dispatches.
 *
 * Design intent (per spec):
 *  - Stage 5 will replace the in-memory store with SQLite via Tauri
 *    when LocalMemory is introduced. The public API surface is stable.
 *
 * Ring-buffer cap: MAX_ENTRIES = 500. Oldest entry evicted on overflow.
 */
const MAX_ENTRIES = 500;

const OUTCOME_ICON: Record<AuditOutcome, string> = {
  ALLOWED:          '✅',
  DENIED_BY_USER:   '🚫',
  BLOCKED_CRITICAL: '🔴',
  BLOCKED_UNSAFE:   '⚠️',
  ERROR:            '❌',
};

class AuditLoggerImpl {
  private log: AuditEntry[] = [];

  /**
   * record
   * Appends an audit entry. Called exclusively by ToolExecutor.
   */
  record(
    tool: string,
    action: string,
    args: unknown[],
    risk: RiskLevel,
    outcome: AuditOutcome,
    options: { reason?: string; durationMs?: number } = {}
  ): void {
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      tool,
      action,
      args,
      risk,
      outcome,
      reason: options.reason,
      durationMs: options.durationMs,
    };

    this.log.push(entry);

    // Ring-buffer eviction
    if (this.log.length > MAX_ENTRIES) {
      this.log.shift();
    }

    // Dev console output
    if (import.meta.env.DEV) {
      const icon = OUTCOME_ICON[outcome];
      console.info(
        `[AuditLog] ${icon} [${risk}] ${tool}:${action}`,
        options.reason ?? '',
        options.durationMs != null ? `(${options.durationMs.toFixed(1)}ms)` : ''
      );
    }
  }

  /** Returns a read-only view of the full log. */
  getAll(): readonly AuditEntry[] {
    return this.log;
  }

  /** Returns the N most recent entries. */
  getRecent(count = 20): readonly AuditEntry[] {
    return this.log.slice(-count);
  }

  /** Clears the log (e.g. on session reset). */
  clear(): void {
    this.log = [];
  }
}

/** Singleton — import and use directly. */
export const AuditLogger = new AuditLoggerImpl();
