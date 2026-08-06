import type { RiskLevel } from './PermissionManager';

export interface ValidationResult {
  /** false → auto-deny (CRITICAL); true → safe to continue pipeline */
  safe: boolean;
  risk: RiskLevel;
  reason?: string;
}

/**
 * DANGER_PATTERNS
 *
 * Content-level analysis of raw command strings — independent of which
 * tool or permission scope is being used.
 *
 * CRITICAL entries set `safe: false` → ToolExecutor auto-blocks and
 * never presents a confirmation dialog.
 *
 * HIGH entries set `safe: true` but trigger human confirmation.
 */
const DANGER_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  risk: RiskLevel;
  reason: string;
}> = [
  // Windows — irreversibly destructive
  { pattern: /rm\s+-[rR][fF]|del\s+\/[fsqFSQ]/,     risk: 'CRITICAL', reason: 'Recursive/force delete detected' },
  { pattern: /format\s+[a-zA-Z]:/,                    risk: 'CRITICAL', reason: 'Drive format command detected' },
  { pattern: /shutdown\s*\/[srhSRH]/,                 risk: 'CRITICAL', reason: 'System shutdown/reboot detected' },
  { pattern: /reg\s+delete/i,                         risk: 'CRITICAL', reason: 'Registry deletion detected' },
  { pattern: /cipher\s*\/w/i,                         risk: 'CRITICAL', reason: 'Disk wipe command detected' },
  { pattern: /rd\s+\/s\s+\/q/i,                       risk: 'CRITICAL', reason: 'Silent recursive directory removal detected' },
  // High-risk — system modification / remote execution
  { pattern: /net\s+user|net\s+localgroup/i,           risk: 'HIGH',     reason: 'Account management command detected' },
  { pattern: /sc\s+(create|delete|start|stop)/i,       risk: 'HIGH',     reason: 'Service control detected' },
  { pattern: /powershell[^|]*(-enc|-bypass|-nop)/i,    risk: 'HIGH',     reason: 'Obfuscated PowerShell detected' },
  { pattern: /(curl|wget)[^|]*\|\s*(bash|sh|cmd|powershell)/i, risk: 'HIGH', reason: 'Remote code execution pattern detected' },
  { pattern: /taskkill\s+\/f/i,                        risk: 'HIGH',     reason: 'Force process termination detected' },
];

/**
 * SafetyValidator
 *
 * Analyses raw command strings against known-dangerous patterns.
 * This is a content filter — PermissionManager handles role/scope gating.
 *
 * Evaluation order:
 *  1. Iterate DANGER_PATTERNS top-to-bottom; first match returns.
 *  2. No match → LOW risk, safe: true.
 */
export const SafetyValidator = {
  validate(command: string): ValidationResult {
    for (const entry of DANGER_PATTERNS) {
      if (entry.pattern.test(command)) {
        return {
          // CRITICAL patterns are auto-denied; everything else proceeds to confirmation
          safe: entry.risk !== 'CRITICAL',
          risk: entry.risk,
          reason: entry.reason,
        };
      }
    }
    return { safe: true, risk: 'LOW' };
  },
} as const;
