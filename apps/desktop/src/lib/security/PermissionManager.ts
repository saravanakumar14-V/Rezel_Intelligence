/**
 * PermissionManager
 *
 * Central authority for action risk classification and session-level
 * permission grants. All tool execution passes through this layer.
 *
 * Risk tier definitions:
 *  LOW      — read-only, no side effects (get_system_info, read_file)
 *  MEDIUM   — writes in user scope (write_note, create_folder)
 *  HIGH     — system-level or potentially destructive (run_system_command, system-path writes)
 *  CRITICAL — irreversible / dangerous (shutdown, format, delete_all)
 *
 * Architecture (per spec):
 *  SafetyValidator → PermissionManager → ToolExecutor → execution
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type PermissionLevel = 'READ_ONLY' | 'STANDARD' | 'ELEVATED' | 'SYSTEM';

interface RiskRule {
  /** Tested against `${tool}:${action}`. First match wins. */
  pattern: RegExp;
  risk: RiskLevel;
  /** When true: requires human confirmation even if previously session-granted. */
  alwaysConfirm: boolean;
}

/**
 * RISK_RULES
 *
 * Ordered top-to-bottom — first match wins.
 * Covers both tool identifiers and Tauri command action names.
 */
const RISK_RULES: readonly RiskRule[] = [
  // CRITICAL — irreversible / destructive operations
  { pattern: /shutdown|reboot|format|wipe|delete_all|rm_rf/i,     risk: 'CRITICAL', alwaysConfirm: true  },
  // HIGH — direct shell execution always requires confirmation
  { pattern: /run_system_command/i,                                 risk: 'HIGH',     alwaysConfirm: true  },
  // HIGH — writes to system-owned paths
  { pattern: /(?:write_file|write_app_file).*(?:system32|windows|program files)/i, risk: 'HIGH', alwaysConfirm: true },
  // HIGH — process management
  { pattern: /kill_process|create_process/i,                      risk: 'HIGH',     alwaysConfirm: true  },
  // MEDIUM — user-scope writes
  { pattern: /write_file|write_app_file|create_folder|delete_file/i, risk: 'MEDIUM', alwaysConfirm: false },
  // LOW — read-only informational queries
  { pattern: /get_system_info|read_file|read_app_file|get_api_key/i, risk: 'LOW',   alwaysConfirm: false },
];

const DEFAULT_RISK: RiskLevel = 'MEDIUM';

class PermissionManagerImpl {
  /** Session-level pre-approved `tool:action` keys. Not persisted. */
  private readonly granted = new Set<string>();

  private key(tool: string, action: string): string {
    return `${tool}:${action}`;
  }

  /**
   * classify
   * Returns the risk level and confirmation requirement for a tool+action.
   */
  classify(tool: string, action: string): { risk: RiskLevel; alwaysConfirm: boolean } {
    const subject = this.key(tool, action);
    for (const rule of RISK_RULES) {
      if (rule.pattern.test(subject)) {
        return { risk: rule.risk, alwaysConfirm: rule.alwaysConfirm };
      }
    }
    return { risk: DEFAULT_RISK, alwaysConfirm: false };
  }

  /**
   * isGranted
   * Returns true if the user has pre-approved this tool:action this session.
   */
  isGranted(tool: string, action: string): boolean {
    return this.granted.has(this.key(tool, action));
  }

  /**
   * grant
   * Session-approves a tool:action pair (user clicked "Always allow this session").
   */
  grant(tool: string, action: string): void {
    this.granted.add(this.key(tool, action));
  }

  /**
   * revoke
   * Removes a specific session grant.
   */
  revoke(tool: string, action: string): void {
    this.granted.delete(this.key(tool, action));
  }

  /**
   * revokeAll
   * Clears all session grants — e.g. on privilege de-escalation or logout.
   */
  revokeAll(): void {
    this.granted.clear();
  }

  /**
   * getGrantedKeys
   * Returns all session-granted tool:action keys. Read-only for Settings display.
   */
  getGrantedKeys(): readonly string[] {
    return Array.from(this.granted);
  }
}

/** Singleton — import and use directly. */
export const PermissionManager = new PermissionManagerImpl();
