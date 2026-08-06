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
   * @returns     Structured result for both the AI conversation and the caller
   */
  async execute(call: ToolCall): Promise<AIToolExecutionResult> {
    const toolDef = ToolRegistry.get(call.name);

    // Unknown tool — return an error result without invoking anything
    if (!toolDef) {
      const toolResult: ToolResult = {
        callId: call.id,
        name: call.name,
        output: `Error: Unknown tool "${call.name}". Available tools: ${ToolRegistry.getAll().map((t) => t.name).join(', ')}`,
        success: false,
      };
      return {
        toolResult,
        executionResult: { success: false, error: toolResult.output },
      };
    }

    // Determine the Tauri command to invoke
    const tauriCommand = toolDef.tauriCommand ?? call.name;

    // Build a human-readable command string for the approval dialog
    const commandStr = formatCommandStr(call.name, call.args);

    // Delegate to the security ToolExecutor
    const executionResult = await SecurityToolExecutor.execute(
      toolDef.toolGroup,
      tauriCommand,
      call.args,
      commandStr
    );

    const toolResult: ToolResult = {
      callId: call.id,
      name: call.name,
      output: executionResult.success
        ? (executionResult.output ?? 'Success')
        : (executionResult.error ?? 'Unknown error'),
      success: executionResult.success,
    };

    return { toolResult, executionResult };
  },

  /**
   * executeMany
   *
   * Processes multiple tool calls sequentially (not in parallel,
   * since each may require user confirmation).
   */
  async executeMany(calls: ToolCall[]): Promise<AIToolExecutionResult[]> {
    const results: AIToolExecutionResult[] = [];
    for (const call of calls) {
      results.push(await this.execute(call));
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
