import { invoke } from '@tauri-apps/api/core';
import { PermissionManager } from './PermissionManager';
import { SafetyValidator } from './SafetyValidator';
import { AuditLogger } from './AuditLogger';
import type { RiskLevel } from './PermissionManager';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ApprovalRequest {
  readonly id: string;
  readonly tool: string;
  readonly action: string;
  /** Human-readable representation of the command being executed. */
  readonly command?: string;
  readonly args: readonly unknown[];
  readonly risk: RiskLevel;
  readonly reason?: string;
}

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
}

// ─── Approval channel ─────────────────────────────────────────────────────────

type ApprovalHandler = (request: ApprovalRequest) => void;

/**
 * Module-level approval state.
 *
 * This intentionally lives outside React state to keep ToolExecutor
 * framework-agnostic. The React layer (HomeScreen) registers a handler
 * via `setApprovalHandler` and resolves decisions via `resolveApproval`.
 */
let approvalHandler: ApprovalHandler | null = null;
const pendingApprovals = new Map<string, (approved: boolean) => void>();

/**
 * setApprovalHandler
 *
 * Called once by HomeScreen's useEffect to register the UI callback that
 * shows PermissionConfirmModal. Pass null to deregister on unmount.
 */
export function setApprovalHandler(handler: ApprovalHandler | null): void {
  approvalHandler = handler;
}

/**
 * resolveApproval
 *
 * Called by PermissionConfirmModal when the user clicks Approve or Deny.
 * Resolves the suspended Promise inside `execute()`.
 */
export function resolveApproval(id: string, approved: boolean): void {
  const resolver = pendingApprovals.get(id);
  if (resolver) {
    pendingApprovals.delete(id);
    resolver(approved);
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * awaitApproval
 *
 * Creates a Promise that resolves when the user approves or denies via the
 * registered handler. Auto-denies (safe default) if no handler is registered.
 */
function awaitApproval(request: ApprovalRequest): Promise<boolean> {
  if (!approvalHandler) {
    console.warn('[ToolExecutor] No approval handler registered — auto-denying.');
    return Promise.resolve(false);
  }
  return new Promise<boolean>((resolve) => {
    pendingApprovals.set(request.id, resolve);
    // Non-null assertion: we just checked approvalHandler above
    approvalHandler!(request);
  });
}

// ─── ToolExecutor ─────────────────────────────────────────────────────────────

/**
 * ToolExecutor
 *
 * Central execution pipeline. Every Tauri command invocation — whether
 * triggered by the AI agent, a voice command, or direct UI action — must
 * pass through this gateway.
 *
 * Pipeline (per spec):
 *  1. SafetyValidator  — content-level pattern match (CRITICAL → auto-block)
 *  2. PermissionManager — classify risk tier, check session grants
 *  3. Human confirmation — for HIGH/CRITICAL that pass step 1
 *  4. invoke()          — Tauri backend command execution
 *  5. AuditLogger       — record outcome, timing, risk tier
 *
 * @param tool       Logical group name (e.g. 'system', 'shell', 'memory')
 * @param action     Tauri command name to invoke (e.g. 'run_system_command')
 * @param args       Arguments object passed directly to invoke()
 * @param commandStr Human-readable description shown in the approval modal
 */
export const ToolExecutor = {
  async execute(
    tool: string,
    action: string,
    args: Record<string, unknown> = {},
    commandStr?: string
  ): Promise<ExecutionResult> {
    const id = crypto.randomUUID();
    const start = performance.now();

    // ── Step 1: SafetyValidator ───────────────────────────────────────────────
    const validation = SafetyValidator.validate(commandStr ?? action);

    if (!validation.safe) {
      // CRITICAL — auto-block, never prompt
      AuditLogger.record(tool, action, [args], 'CRITICAL', 'BLOCKED_CRITICAL', {
        reason: validation.reason,
        durationMs: performance.now() - start,
      });
      return {
        success: false,
        error: `[Rezel Security] Blocked: ${validation.reason ?? 'critical command pattern detected'}`,
      };
    }

    // ── Step 2: PermissionManager — classify ──────────────────────────────────
    const { risk, alwaysConfirm } = PermissionManager.classify(tool, action);
    const preApproved = PermissionManager.isGranted(tool, action);

    // ── Step 3: Human confirmation ────────────────────────────────────────────
    const needsConfirmation =
      (risk === 'HIGH' || risk === 'CRITICAL' || alwaysConfirm) && !preApproved;

    if (needsConfirmation) {
      const request: ApprovalRequest = {
        id,
        tool,
        action,
        command: commandStr,
        args: Object.values(args),
        risk,
        reason: validation.reason,
      };

      const approved = await awaitApproval(request);

      if (!approved) {
        AuditLogger.record(tool, action, [args], risk, 'DENIED_BY_USER', {
          durationMs: performance.now() - start,
        });
        return { success: false, error: 'Action denied by user.' };
      }
    }

    // ── Step 4: Invoke Tauri backend ──────────────────────────────────────────
    try {
      const raw = await invoke<unknown>(action, args);
      const durationMs = performance.now() - start;

      AuditLogger.record(tool, action, [args], risk, 'ALLOWED', { durationMs });

      const output =
        typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);

      return { success: true, output };
    } catch (err: unknown) {
      const durationMs = performance.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);

      AuditLogger.record(tool, action, [args], risk, 'ERROR', {
        reason: errorMsg,
        durationMs,
      });

      return { success: false, error: errorMsg };
    }
  },
} as const;
