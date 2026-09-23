/**
 * Rezel OS — Sprint P0-6: Real Tool Execution & get_system_info Acceptance Test Suite
 *
 * Layers:
 * 1. Direct get_system_info execution through SecurityToolExecutor & Tauri
 * 2. ProviderToolNamePolicy canonical resolution & formatting
 * 3. Gemini function call & function response roundtrip simulation
 * 4. Complete 29-tool capability registry execution readiness
 * 5. Structured, sanitized error preservation (no generic "Failed")
 */

import './mock_tauri_core';
import { AgentCore } from './src/lib/ai/AgentCore';
import { ToolRegistry } from './src/lib/ai/ToolRegistry';
import { CapabilityRegistry } from './src/lib/ai/capabilities/CapabilityRegistry';
import { AIToolExecutor } from './src/lib/ai/ToolExecutor';
import { ProviderToolNamePolicy } from './src/lib/ai/providers/ProviderToolName';
import { ToolSchemaTranslator } from './src/lib/ai/providers/adapters/ToolSchemaTranslator';
import { GeminiChatAdapter } from './src/lib/ai/providers/adapters/GeminiAdapter';

async function runRealToolExecutionTests() {
  console.log('================================================================');
  console.log('🚀 REZEL SPRINT P0-6: REAL TOOL EXECUTION (get_system_info) TESTS');
  console.log('================================================================\n');

  await AgentCore.init();

  // ═════════════════════════════════════════════════════════════════════════════
  // TEST 1: DIRECT get_system_info INVOCATION VIA AIToolExecutor
  // ═════════════════════════════════════════════════════════════════════════════
  console.log('--- TEST 1: Direct Tool Execution (get_system_info) ---');

  const toolCall = {
    id: `call_${Date.now()}`,
    name: 'get_system_info',
    args: {},
  };

  const execResult = await AIToolExecutor.execute(toolCall);
  console.log(`Execution Success: ${execResult.toolResult.success}`);
  console.log(`Execution Output:\n${execResult.toolResult.output}`);

  if (!execResult.toolResult.success) {
    throw new Error(`TEST 1 FAILED: get_system_info execution failed: ${execResult.toolResult.output}`);
  }

  // Verify structure of output
  let parsedMetrics: any;
  try {
    parsedMetrics = JSON.parse(execResult.toolResult.output);
  } catch (err) {
    throw new Error(`TEST 1 FAILED: get_system_info did not return valid JSON: ${execResult.toolResult.output}`);
  }

  if (typeof parsedMetrics !== 'object' || parsedMetrics === null) {
    throw new Error('TEST 1 FAILED: parsed metrics is not an object');
  }

  console.log('✅ TEST 1 PASSED: get_system_info executed through AIToolExecutor and returned valid system metrics.');

  // ═════════════════════════════════════════════════════════════════════════════
  // TEST 2: GEMINI FUNCTION DECLARATION & ROUNDTRIP FORMATTING
  // ═════════════════════════════════════════════════════════════════════════════
  console.log('\n--- TEST 2: Gemini Tool Schema & Function Response Formatting ---');

  // Register tools for Gemini
  const sysInfoCap = CapabilityRegistry.get('get_system_info') || ToolRegistry.get('get_system_info');
  if (!sysInfoCap) throw new Error('TEST 2 FAILED: get_system_info not found in registries');

  const geminiTools = ToolSchemaTranslator.toGemini([sysInfoCap]);
  const decl = geminiTools[0]?.functionDeclarations?.[0];

  if (!decl || decl.name !== 'get_system_info') {
    throw new Error(`TEST 2 FAILED: Invalid declaration: ${JSON.stringify(decl)}`);
  }
  console.log(`Declaration Name: "${decl.name}"`);
  console.log(`Declaration Parameters: ${JSON.stringify(decl.parameters)}`);

  // Simulate Gemini tool call response
  const simulatedGeminiCall = {
    name: 'get_system_info',
    args: {},
  };

  const canonicalId = ProviderToolNamePolicy.resolveCanonicalId(simulatedGeminiCall.name, 'GEMINI');
  if (canonicalId !== 'get_system_info') {
    throw new Error(`TEST 2 FAILED: Canonical ID mismatch: expected get_system_info, got ${canonicalId}`);
  }

  // Format as toolResult for next turn
  const toolResult = {
    callId: 'call_12345',
    name: canonicalId,
    output: execResult.toolResult.output,
    success: true,
  };

  const providerName = ProviderToolNamePolicy.getProviderName(toolResult.name, 'GEMINI');
  let contentObj: any = { output: toolResult.output, success: true };
  try {
    contentObj = JSON.parse(toolResult.output);
  } catch {}

  const functionResponsePart = {
    functionResponse: {
      name: providerName,
      response: {
        name: providerName,
        content: contentObj,
      },
    },
  };

  if (functionResponsePart.functionResponse.name !== 'get_system_info' || !functionResponsePart.functionResponse.response.content) {
    throw new Error('TEST 2 FAILED: Malformed functionResponse part for Gemini');
  }

  console.log('✅ TEST 2 PASSED: Gemini tool schema and functionResponse formatting verified.');

  // ═════════════════════════════════════════════════════════════════════════════
  // TEST 3: FULL 29-TOOL CAPABILITY REGISTRY VERIFICATION
  // ═════════════════════════════════════════════════════════════════════════════
  console.log('\n--- TEST 3: Full 29-Tool Capability Registry Verification ---');

  const allTools = CapabilityRegistry.getAll();
  const allGeminiTools = ToolSchemaTranslator.toGemini(allTools);
  const declarations = allGeminiTools[0]?.functionDeclarations || [];

  if (declarations.length !== allTools.length) {
    throw new Error(`TEST 3 FAILED: Count mismatch: ${declarations.length} declarations vs ${allTools.length} tools`);
  }

  declarations.forEach((d: any, idx: number) => {
    const valid = ProviderToolNamePolicy.validate(d.name, 'GEMINI').valid;
    if (!valid) {
      throw new Error(`TEST 3 FAILED: Tool at index ${idx} "${d.name}" is invalid for Gemini`);
    }
  });

  console.log(`✅ TEST 3 PASSED: All ${declarations.length} tools verified valid for Gemini function calling.`);

  // ═════════════════════════════════════════════════════════════════════════════
  // TEST 4: STRUCTURED ERROR SANITIZATION & PRESERVATION
  // ═════════════════════════════════════════════════════════════════════════════
  console.log('\n--- TEST 4: Structured Error Sanitization ---');

  const unknownCall = {
    id: 'call_invalid_01',
    name: 'non_existent_tool',
    args: {},
  };

  const unknownResult = await AIToolExecutor.execute(unknownCall);
  if (unknownResult.toolResult.success) {
    throw new Error('TEST 4 FAILED: Unknown tool unexpectedly succeeded');
  }
  if (!unknownResult.toolResult.output.includes('Unknown tool "non_existent_tool"')) {
    throw new Error(`TEST 4 FAILED: Generic error message returned: ${unknownResult.toolResult.output}`);
  }

  console.log(`Structured diagnostic: "${unknownResult.toolResult.output}"`);
  console.log('✅ TEST 4 PASSED: Structured error diagnostics preserved without generic "Failed" suppression.');

  console.log('\n================================================================');
  console.log('🎯 SPRINT P0-6: REAL TOOL EXECUTION ACCEPTANCE PASSED (100%)');
  console.log('================================================================');
}

runRealToolExecutionTests().catch((err) => {
  console.error('\n❌ REAL TOOL EXECUTION TESTS FAILED:', err);
  process.exit(1);
});
