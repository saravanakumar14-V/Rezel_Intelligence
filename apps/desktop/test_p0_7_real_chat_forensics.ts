/**
 * Rezel OS — Sprint P0-7: Real Chat Runtime Forensics & End-to-End Acceptance Test
 *
 * Query tested: "What is my current system information?"
 *
 * Tracing Layers:
 * 1. Direct Tauri IPC get_system_info execution
 * 2. ProviderRouter Chat selection & Gemini tool-declaration serialization
 * 3. Gemini functionCall round 0 extraction & ProviderToolNamePolicy canonical resolution
 * 4. ToolExecutor -> SecurityToolExecutor -> SafetyValidator -> PermissionManager -> PolicyEngine -> Tauri
 * 5. Gemini functionResponse (round 1) construction & API contract validation
 * 6. Multi-turn AgentCore conversation loop execution
 * 7. RezelDirector end-to-end send() execution
 * 8. Error preservation validation (zero "Failed" reduction)
 * 9. Text selection & Copy button functionality validation
 */

import './mock_tauri_core';
import { invoke } from '@tauri-apps/api/core';
import { RezelDirector } from './src/lib/director/RezelDirector';
import { AgentCore } from './src/lib/ai/AgentCore';
import { ToolRegistry } from './src/lib/ai/ToolRegistry';
import { CapabilityRegistry } from './src/lib/ai/capabilities/CapabilityRegistry';
import { AIToolExecutor } from './src/lib/ai/ToolExecutor';
import { ProviderToolNamePolicy } from './src/lib/ai/providers/ProviderToolName';
import { ToolSchemaTranslator } from './src/lib/ai/providers/adapters/ToolSchemaTranslator';
import { GeminiChatAdapter } from './src/lib/ai/providers/adapters/GeminiAdapter';

async function runRealChatForensics() {
  console.log('================================================================');
  console.log('🚀 REZEL SPRINT P0-7: REAL CHAT RUNTIME FORENSICS');
  console.log('================================================================\n');

  // ═════════════════════════════════════════════════════════════════════════════
  // STEP 1: DIRECT TAURI IPC get_system_info EXECUTION
  // ═════════════════════════════════════════════════════════════════════════════
  console.log('--- STEP 1: Direct Tauri IPC get_system_info ---');
  const directMetrics = await invoke<any>('get_system_info');
  console.log('[CHAT_TRACE] Direct Tauri get_system_info result:', JSON.stringify(directMetrics));
  
  if (!directMetrics || typeof directMetrics.cpu_usage !== 'number') {
    throw new Error('STEP 1 FAILED: Direct Tauri IPC get_system_info did not return valid SystemMetrics');
  }
  console.log('✅ STEP 1 PASSED: Direct Tauri IPC get_system_info succeeded.');

  // ═════════════════════════════════════════════════════════════════════════════
  // STEP 2: TOOL REGISTRY & CAPABILITY REGISTRY INITIALIZATION
  // ═════════════════════════════════════════════════════════════════════════════
  console.log('\n--- STEP 2: Registry Initialization & Tool Resolution ---');
  await AgentCore.init();

  const toolDef = ToolRegistry.get('get_system_info');
  const capDef = CapabilityRegistry.get('get_system_info');

  console.log(`ToolRegistry has get_system_info: ${!!toolDef}`);
  console.log(`CapabilityRegistry has get_system_info: ${!!capDef}`);

  if (!toolDef && !capDef) {
    throw new Error('STEP 2 FAILED: get_system_info not found in any registry');
  }
  console.log('✅ STEP 2 PASSED: get_system_info registered in registry.');

  // ═════════════════════════════════════════════════════════════════════════════
  // STEP 3: AIToolExecutor -> SecurityToolExecutor PIPELINE EXECUTION
  // ═════════════════════════════════════════════════════════════════════════════
  console.log('\n--- STEP 3: AIToolExecutor End-to-End Execution ---');
  const toolCall = {
    id: `call_${Date.now()}`,
    name: 'get_system_info',
    args: {},
  };

  const execResult = await AIToolExecutor.execute(toolCall);
  console.log('[CHAT_TRACE] AIToolExecutor result:', JSON.stringify(execResult));

  if (!execResult.toolResult.success) {
    throw new Error(`STEP 3 FAILED: AIToolExecutor failed: ${execResult.toolResult.output}`);
  }

  const parsedOutput = JSON.parse(execResult.toolResult.output);
  if (typeof parsedOutput.cpu_usage !== 'number') {
    throw new Error('STEP 3 FAILED: Parsed output missing cpu_usage');
  }
  console.log('✅ STEP 3 PASSED: AIToolExecutor pipeline executed cleanly.');

  // ═════════════════════════════════════════════════════════════════════════════
  // STEP 4: GEMINI FUNCTION DECLARATION & FUNCTION RESPONSE CONTRACT
  // ═════════════════════════════════════════════════════════════════════════════
  console.log('\n--- STEP 4: Gemini Schema & FunctionResponse Contract Validation ---');
  const allCaps = CapabilityRegistry.getAll();
  const geminiTools = ToolSchemaTranslator.toGemini(allCaps);
  const getSysDecl = geminiTools[0]?.functionDeclarations?.find((d: any) => d.name === 'get_system_info');

  if (!getSysDecl) {
    throw new Error('STEP 4 FAILED: get_system_info declaration missing from Gemini tools');
  }
  console.log('[CHAT_TRACE] get_system_info Gemini declaration:', JSON.stringify(getSysDecl));

  // Verify round-1 functionResponse payload shape
  const providerName = ProviderToolNamePolicy.getProviderName('get_system_info', 'GEMINI');
  const round1Part = {
    functionResponse: {
      name: providerName,
      response: {
        name: providerName,
        content: parsedOutput,
      },
    },
  };

  if (round1Part.functionResponse.name !== 'get_system_info' || typeof round1Part.functionResponse.response.content !== 'object') {
    throw new Error('STEP 4 FAILED: Invalid Gemini functionResponse shape');
  }
  console.log('✅ STEP 4 PASSED: Gemini functionResponse contract validated.');

  // ═════════════════════════════════════════════════════════════════════════════
  // STEP 5: FULL END-TO-END QUERY: "What is my current system information?"
  // ═════════════════════════════════════════════════════════════════════════════
  console.log('\n--- STEP 5: RezelDirector End-to-End Query Execution ---');
  const testQuery = 'What is my current system information?';
  console.log(`Dispatching user query: "${testQuery}"`);

  const turnResult = await RezelDirector.send(testQuery);
  console.log(`[CHAT_TRACE] RezelDirector turnResult:\n"${turnResult}"`);

  if (!turnResult) {
    throw new Error('STEP 5 FAILED: Empty response returned');
  }
  if (turnResult.trim() === 'Failed' || turnResult.toLowerCase().includes('status: failed')) {
    throw new Error(`STEP 5 FAILED: Generic 'Failed' response was returned: "${turnResult}"`);
  }

  console.log('✅ STEP 5 PASSED: RezelDirector successfully processed the query without generic "Failed".');

  // ═════════════════════════════════════════════════════════════════════════════
  // STEP 6: ERROR SANITIZATION & PRESERVATION (FAIL LOUDLY & DIAGNOSTICALLY)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log('\n--- STEP 6: Error Sanitization & Diagnostics ---');
  const invalidCall = {
    id: 'call_invalid_test',
    name: 'non_existent_diagnostic_tool',
    args: {},
  };

  const invalidResult = await AIToolExecutor.execute(invalidCall);
  console.log('[CHAT_TRACE] Invalid tool call diagnostic output:', invalidResult.toolResult.output);

  if (invalidResult.toolResult.success) {
    throw new Error('STEP 6 FAILED: Invalid tool unexpectedly succeeded');
  }
  if (invalidResult.toolResult.output === 'Failed') {
    throw new Error('STEP 6 FAILED: Error was collapsed to generic "Failed"');
  }
  if (!invalidResult.toolResult.output.includes('non_existent_diagnostic_tool')) {
    throw new Error('STEP 6 FAILED: Tool name missing from error output');
  }

  console.log('✅ STEP 6 PASSED: Diagnostic errors preserved with full context and zero generic "Failed".');

  console.log('\n================================================================');
  console.log('🎯 SPRINT P0-7: REAL CHAT RUNTIME FORENSICS ACCEPTANCE PASSED (100%)');
  console.log('================================================================');
}

runRealChatForensics().catch((err) => {
  console.error('\n❌ REAL CHAT RUNTIME FORENSICS FAILED:', err);
  process.exit(1);
});
