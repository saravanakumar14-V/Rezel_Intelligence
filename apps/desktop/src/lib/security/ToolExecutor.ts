import { invoke } from '@tauri-apps/api/core';
import { PermissionManager } from './PermissionManager';
import { SafetyValidator } from './SafetyValidator';
import { AuditLogger } from './AuditLogger';
import type { RiskLevel } from './PermissionManager';
import { PolicyEngine } from './policy/PolicyEngine';
import type { PolicyEvaluationContext, ApprovalContext } from './policy/PolicyTypes';

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
  readonly approvalContext?: ApprovalContext;
}

export interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  errorCode?: string;
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

    // Auto-deny after 60 seconds to prevent pipeline stalls
    setTimeout(() => {
      if (pendingApprovals.has(request.id)) {
        console.warn(`[ToolExecutor] Approval timed out for request ${request.id}`);
        resolveApproval(request.id, false);
      }
    }, 60000);
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
    commandStr?: string,
    onStatusChange?: (status: 'WAITING_FOR_USER' | 'RUNNING') => Promise<void> | void,
    executeImpl?: () => Promise<unknown>,
    context?: any
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
        errorCode: 'TOOL_INVALID_ARGUMENT'
      };
    }

    // ── Step 2: PermissionManager & PolicyEngine (Dynamic Risk) ─────────────
    const { risk, alwaysConfirm } = PermissionManager.classify(tool, action);
    const preApproved = PermissionManager.isGranted(tool, action);

    let dynamicRisk = risk;
    let policyReason = validation.reason;
    let approvalContext: ApprovalContext | undefined;
    let policyRequiresApproval = false;

    console.log('[ToolExecutor] context is:', !!context, context);

    if (context) {
      const policyCtx: PolicyEvaluationContext = {
        capabilityId: action,
        toolGroup: tool,
        args,
        workflowId: context.workflowId,
        executionId: context.executionId,
        activeScopes: context.scopes || []
      };

      const decision = await PolicyEngine.evaluate(policyCtx);
      console.log('[ToolExecutor] Policy decision:', decision);

      if (decision.decision === 'DENY') {
        AuditLogger.record(tool, action, [args], 'CRITICAL', 'DENIED_BY_POLICY', {
          reason: decision.reason,
          durationMs: performance.now() - start,
        });
        return {
          success: false,
          error: `[Rezel Policy] Blocked: ${decision.reason}`,
          errorCode: 'TOOL_PERMISSION_DENIED'
        };
      }

      if (decision.decision === 'REQUIRE_APPROVAL') {
        policyRequiresApproval = true;
        approvalContext = decision.approvalContext;
        dynamicRisk = decision.approvalContext?.risk || 'HIGH';
      }
      policyReason = decision.reason;
    }

    // ── Step 3: Human confirmation ────────────────────────────────────────────
    const needsConfirmation =
      (dynamicRisk === 'HIGH' || dynamicRisk === 'CRITICAL' || alwaysConfirm || policyRequiresApproval) && !preApproved;

    if (needsConfirmation) {
      const request: ApprovalRequest = {
        id,
        tool,
        action,
        command: commandStr,
        args: Object.values(args),
        risk: dynamicRisk,
        reason: policyReason,
        approvalContext
      };

      await onStatusChange?.('WAITING_FOR_USER');
      const approved = await awaitApproval(request);
      await onStatusChange?.('RUNNING');

      if (!approved) {
        AuditLogger.record(tool, action, [args], risk, 'DENIED_BY_USER', {
          durationMs: performance.now() - start,
        });
        return { success: false, error: 'Action denied by user.', errorCode: 'TOOL_PERMISSION_DENIED' };
      }
    }

    // Check cancellation before invoking
    const signal = context?.signal as AbortSignal | undefined;
    if (signal?.aborted) {
      return { success: false, error: 'Execution cancelled', errorCode: 'TOOL_CANCELLED' };
    }

    // ── Step 4: Invoke execution with timeout ─────────────────────────────────
    try {
      const timeoutMs = context?.timeoutMs ?? 60000;
      
      const executePromise = executeImpl ? executeImpl() : invoke<unknown>(action, args);
      
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('TOOL_TIMEOUT')), timeoutMs);
      });

      const cancelPromise = new Promise<never>((_, reject) => {
        if (!signal) return;
        const onAbort = () => reject(new Error('TOOL_CANCELLED'));
        if (signal.aborted) onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
      });

      const raw = await Promise.race([executePromise, timeoutPromise, cancelPromise]).finally(() => {
        clearTimeout(timeoutId);
      });

      const durationMs = performance.now() - start;

      AuditLogger.record(tool, action, [args], dynamicRisk, 'ALLOWED', { durationMs });

      // If the AI updated the API key, force GeminiProvider to reload it
      if (action === 'save_api_key' || action === 'delete_api_key') {
        const { GeminiProvider } = await import('../ai/GeminiProvider');
        GeminiProvider.clearApiKey();
      }

      const output =
        typeof raw === 'string' ? raw : (raw !== undefined ? JSON.stringify(raw, null, 2) : 'Success');

      return { success: true, output };
    } catch (err: unknown) {
      const durationMs = performance.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      
      let errorCode = 'TOOL_EXECUTION_FAILED';
      if (errorMsg === 'TOOL_TIMEOUT') errorCode = 'TOOL_TIMEOUT';
      if (errorMsg === 'TOOL_CANCELLED') errorCode = 'TOOL_CANCELLED';

      AuditLogger.record(tool, action, [args], dynamicRisk, 'ERROR', {
        reason: errorMsg,
        durationMs,
      });

      return { success: false, error: errorMsg, errorCode };
    }
  },
} as const;
