/**
 * AI ToolExecutor
 *
 * Bridge between the AI layer and the Stage 4 security ToolExecutor.
 *
 * When the AI model returns a function call, this module:
 *  1. Resolves the tool definition from the ToolRegistry
 *  2. Maps the AI's arguments to Tauri command arguments
 *  3. Delegates to the security ToolExecutor (which handles
 *     SafetyValidator → PermissionManager → invoke → AuditLogger)
 *  4. Returns a structured ToolResult back to the AI conversation
 *
 * This separation ensures the AI never bypasses the security layer
 * and that all tool invocations are audited regardless of origin.
 */

import { ToolExecutor as SecurityToolExecutor } from '../security/ToolExecutor';
import type { ExecutionResult } from '../security/ToolExecutor';
import { ToolRegistry } from './ToolRegistry';
import { CapabilityRegistry } from './capabilities/CapabilityRegistry';
import { ProviderToolNamePolicy } from './providers/ProviderToolName';
import type { ToolCall, ToolResult } from './types';

export interface AIToolExecutionResult {
  toolResult: ToolResult;
  executionResult: ExecutionResult;
}

/**
 * AIToolExecutor
 *
 * Processes a single AI tool call through the security pipeline.
 */
export const AIToolExecutor = {
  /**
   * execute
   *
   * Takes a ToolCall from the AI model, resolves it against the registry,
   * and delegates to the security ToolExecutor.
   *
   * @param call  The function call object from the AI response
   * @param options Optional callbacks for execution lifecycle
   * @returns     Structured result for both the AI conversation and the caller
   */
  async execute(
    call: ToolCall,
    options?: { 
      onStatusChange?: (status: 'WAITING_FOR_USER' | 'RUNNING') => Promise<void> | void;
      signal?: AbortSignal;
    }
  ): Promise<AIToolExecutionResult> {
    const canonicalName = ProviderToolNamePolicy.resolveCanonicalId(call.name);
    console.info(`[TOOL_TRACE] { stage: 'canonical_resolution', providerName: '${call.name}', canonicalId: '${canonicalName}', success: true }`);

    let toolDef = ToolRegistry.get(canonicalName) || ToolRegistry.get(call.name);

    // If not in ToolRegistry, check CapabilityRegistry
    if (!toolDef) {
      const cap = CapabilityRegistry.get(canonicalName) || CapabilityRegistry.get(call.name);
      if (cap) {
        // We found a modern capability. Delegate to executeCapability.
        console.info(`[TOOL_TRACE] { stage: 'execute_capability', canonicalId: '${canonicalName}', toolGroup: '${cap.toolGroup}' }`);
        const res = await this.executeCapability(cap, call.args, {
          workflowId: 'direct',
          executionId: call.id,
          scopes: [],
          metadata: {},
          signal: options?.signal ?? new AbortController().signal,
          mode: 'EXECUTE'
        }, options);

        console.info(`[TOOL_TRACE] { stage: 'capability_result', canonicalId: '${canonicalName}', success: ${res.success}, error: ${res.error ? `'${res.error}'` : 'undefined'} }`);

        const toolResult: ToolResult = {
          callId: call.id,
          name: call.name,
          output: res.output,
          success: res.success,
          errorCode: res.error ? 'TOOL_EXECUTION_FAILED' : undefined,
        };
        return {
          toolResult,
          executionResult: { success: res.success, output: res.output, error: res.error, errorCode: toolResult.errorCode },
        };
      }
    }

    // Unknown tool — return an error result without invoking anything
    if (!toolDef) {
      console.warn(`[TOOL_TRACE] { stage: 'unknown_tool', canonicalId: '${canonicalName}', success: false, error: 'Unknown tool' }`);
      const availableTools = Array.from(new Set([
        ...ToolRegistry.getAll().map((t) => t.name),
        ...CapabilityRegistry.getAll().map((c) => c.id)
      ])).join(', ');
      
      const toolResult: ToolResult = {
        callId: call.id,
        name: call.name,
        output: `Error: Unknown tool "${call.name}". Available tools: ${availableTools}`,
        success: false,
        errorCode: 'TOOL_INVALID_ARGUMENT'
      };
      return {
        toolResult,
        executionResult: { success: false, error: toolResult.output, errorCode: 'TOOL_INVALID_ARGUMENT' },
      };
    }

    // Determine the Tauri command to invoke
    const tauriCommand = toolDef.tauriCommand ?? call.name;
    
    // Map arguments for IPC if required
    const executionArgs = toolDef.ipcClientId
      ? { clientId: toolDef.ipcClientId, command: call.name, args: call.args }
      : call.args;

    // Build a human-readable command string for the approval dialog
    const commandStr = formatCommandStr(call.name, call.args);

    console.info(`[TOOL_TRACE] { stage: 'security_executor_dispatch', canonicalId: '${canonicalName}', tauriCommand: '${tauriCommand}', toolGroup: '${toolDef.toolGroup}' }`);

    // Pass context to SecurityToolExecutor
    const context = {
      signal: options?.signal
    };

    // Delegate to the security ToolExecutor
    const executionResult = await SecurityToolExecutor.execute(
      toolDef.toolGroup,
      tauriCommand,
      executionArgs,
      commandStr,
      options?.onStatusChange,
      undefined,
      context
    );

    console.info(`[TOOL_TRACE] { stage: 'tool_execution_completed', canonicalId: '${canonicalName}', tauriCommand: '${tauriCommand}', success: ${executionResult.success}, error: ${executionResult.error ? `'${executionResult.error}'` : 'undefined'} }`);

    const toolResult: ToolResult = {
      callId: call.id,
      name: call.name,
      output: executionResult.success
        ? (executionResult.output ?? 'Success')
        : (executionResult.error ?? 'Unknown error'),
      success: executionResult.success,
      errorCode: executionResult.errorCode
    };

    return { toolResult, executionResult };
  },

  /**
   * executeCapability
   * 
   * Executes a registered capability using the trusted metadata from the CapabilityRegistry.
   * Preserves backward compatibility by bridging native executions through the same
   * SecurityToolExecutor path used by legacy tools.
   */
  async executeCapability(
    capability: any,
    args: Record<string, unknown>,
    context: any,
    options?: { onStatusChange?: (status: 'WAITING_FOR_USER' | 'RUNNING') => Promise<void> | void }
  ): Promise<{ success: boolean; output: string; error?: string }> {
    const commandStr = formatCommandStr(capability.id, args);
    
    // Use the executeImpl wrapper to route native JS logic through the Tauri-oriented
    // SecurityToolExecutor without bypassing any permission checks.
    const executionResult = await SecurityToolExecutor.execute(
      capability.toolGroup,
      capability.id,
      args,
      commandStr,
      options?.onStatusChange,
      () => capability.execute(args, context),
      context
    );

    return {
      success: executionResult.success,
      output: executionResult.success 
        ? (executionResult.output ?? 'Success') 
        : (executionResult.error ?? 'Unknown error'),
      error: executionResult.error,
    };
  },

  /**
   * dryRunCapability
   */
  async dryRunCapability(
    capability: any,
    args: Record<string, unknown>,
    context: any
  ): Promise<any> {
    if (capability.dryRun) {
      return await capability.dryRun(args, context);
    }
    return null;
  },

  /**
   * verifyCapability
   */
  async verifyCapability(
    capability: any,
    args: Record<string, unknown>,
    result: any,
    context: any
  ): Promise<'SUCCESS' | 'FAILED' | 'UNKNOWN'> {
    if (capability.verify) {
      return await capability.verify(args, result, context);
    }
    return 'UNKNOWN';
  },

  /**
   * executeMany
   *
   * Processes multiple tool calls sequentially (not in parallel,
   * since each may require user confirmation).
   */
  async executeMany(
    calls: ToolCall[],
    options?: { onStatusChange?: (status: 'WAITING_FOR_USER' | 'RUNNING') => Promise<void> | void }
  ): Promise<AIToolExecutionResult[]> {
    const results: AIToolExecutionResult[] = [];
    for (const call of calls) {
      results.push(await this.execute(call, options));
    }
    return results;
  },
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * formatCommandStr
 * Creates a human-readable string for the PermissionConfirmModal.
 */
function formatCommandStr(
  name: string,
  args: Record<string, unknown>
): string {
  const argStr = Object.entries(args)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(', ');
  return argStr ? `${name}(${argStr})` : name;
}
