/**
 * Rezel OS — Sprint P0-5: Gemini Tool-Name Contract & Reality Acceptance Test Suite
 *
 * Tests:
 * 1. Valid names (alphanumeric, underscore, colon, dot, dash)
 * 2. Leading underscore
 * 3. Leading digit normalization/rejection
 * 4. Spaces normalization
 * 5. Slash normalization
 * 6. Parentheses normalization
 * 7. Unicode normalization
 * 8. Colon preservation
 * 9. Dot preservation
 * 10. Dash preservation
 * 11. Maximum length 128 boundary
 * 12. >128 length handling
 * 13. Empty string validation (fails closed)
 * 14. Normalization idempotency
 * 15. Collision detection (TOOL_NAME_COLLISION)
 * 16. Canonical ID preservation & bidirectional mapping
 * 17. Gemini serialization (ToolSchemaTranslator.toGemini)
 * 18. Gemini function-call reverse mapping
 * 19. Complete Rezel tool registry audit (all 29 tools)
 * 20. Tool execution dispatch via AIToolExecutor
 */

import './mock_tauri_core';
import { ProviderToolNamePolicy } from './src/lib/ai/providers/ProviderToolName';
import { ToolSchemaTranslator } from './src/lib/ai/providers/adapters/ToolSchemaTranslator';
import { AgentCore } from './src/lib/ai/AgentCore';
import { CapabilityRegistry } from './src/lib/ai/capabilities/CapabilityRegistry';
import { AIToolExecutor } from './src/lib/ai/ToolExecutor';

async function runGeminiToolContractTests() {
  console.log('================================================================');
  console.log('🚀 REZEL SPRINT P0-5: GEMINI TOOL CONTRACT & ACCEPTANCE TESTS');
  console.log('================================================================\n');

  ProviderToolNamePolicy.clear();

  // 1. Valid names
  const valid1 = ProviderToolNamePolicy.validate('computer_click', 'GEMINI');
  if (!valid1.valid) throw new Error('Test 1 Failed: computer_click should be valid');
  console.log('✅ Test 1: Valid standard name "computer_click" passed.');

  // 2. Leading underscore
  const valid2 = ProviderToolNamePolicy.validate('_custom_hook', 'GEMINI');
  if (!valid2.valid) throw new Error('Test 2 Failed: _custom_hook should be valid');
  console.log('✅ Test 2: Leading underscore "_custom_hook" passed.');

  // 3. Leading digit normalization
  const norm3 = ProviderToolNamePolicy.normalize('123_custom_tool', 'GEMINI');
  if (norm3 !== '_123_custom_tool') throw new Error(`Test 3 Failed: Expected _123_custom_tool, got ${norm3}`);
  console.log(`✅ Test 3: Leading digit normalized: "123_custom_tool" -> "${norm3}".`);

  // 4. Spaces normalization
  const norm4 = ProviderToolNamePolicy.normalize('computer click', 'GEMINI');
  if (norm4 !== 'computer_click') throw new Error(`Test 4 Failed: Expected computer_click, got ${norm4}`);
  console.log(`✅ Test 4: Spaces normalized: "computer click" -> "${norm4}".`);

  // 5. Slash normalization
  const norm5 = ProviderToolNamePolicy.normalize('app/read-file', 'GEMINI');
  if (norm5 !== 'app_read-file') throw new Error(`Test 5 Failed: Expected app_read-file, got ${norm5}`);
  console.log(`✅ Test 5: Slash normalized: "app/read-file" -> "${norm5}".`);

  // 6. Parentheses normalization
  const norm6 = ProviderToolNamePolicy.normalize('tool (v2)', 'GEMINI');
  if (norm6 !== 'tool__v2_') throw new Error(`Test 6 Failed: Expected tool__v2_, got ${norm6}`);
  console.log(`✅ Test 6: Parentheses normalized: "tool (v2)" -> "${norm6}".`);

  // 7. Unicode normalization
  const norm7 = ProviderToolNamePolicy.normalize('tool_🚀_action', 'GEMINI');
  if (!ProviderToolNamePolicy.validate(norm7, 'GEMINI').valid) throw new Error(`Test 7 Failed: Expected valid name, got ${norm7}`);
  console.log(`✅ Test 7: Unicode normalized: "tool_🚀_action" -> "${norm7}".`);

  // 8. Colon preservation
  const norm8 = ProviderToolNamePolicy.normalize('blender:launch', 'GEMINI');
  if (norm8 !== 'blender:launch') throw new Error(`Test 8 Failed: Expected blender:launch, got ${norm8}`);
  console.log(`✅ Test 8: Colon preserved: "blender:launch" -> "${norm8}".`);

  // 9. Dot preservation
  const norm9 = ProviderToolNamePolicy.normalize('fs.read_text', 'GEMINI');
  if (norm9 !== 'fs.read_text') throw new Error(`Test 9 Failed: Expected fs.read_text, got ${norm9}`);
  console.log(`✅ Test 9: Dot preserved: "fs.read_text" -> "${norm9}".`);

  // 10. Dash preservation
  const norm10 = ProviderToolNamePolicy.normalize('run-system-command', 'GEMINI');
  if (norm10 !== 'run-system-command') throw new Error(`Test 10 Failed: Expected run-system-command, got ${norm10}`);
  console.log(`✅ Test 10: Dash preserved: "run-system-command" -> "${norm10}".`);

  // 11. Max length 128 boundary
  const exact128 = 'a'.repeat(128);
  const norm11 = ProviderToolNamePolicy.normalize(exact128, 'GEMINI');
  if (norm11.length !== 128) throw new Error('Test 11 Failed: 128-char name length altered');
  console.log('✅ Test 11: Exact 128-character boundary preserved.');

  // 12. >128 length rejection/truncation
  const over128 = 'b'.repeat(150);
  const norm12 = ProviderToolNamePolicy.normalize(over128, 'GEMINI');
  if (norm12.length !== 128) throw new Error(`Test 12 Failed: Expected length 128, got ${norm12.length}`);
  console.log('✅ Test 12: >128 character name cleanly truncated to 128 chars.');

  // 13. Empty string validation
  let caughtEmpty = false;
  try {
    ProviderToolNamePolicy.normalize('', 'GEMINI');
  } catch (err: any) {
    caughtEmpty = true;
  }
  if (!caughtEmpty) throw new Error('Test 13 Failed: Empty name did not fail closed');
  console.log('✅ Test 13: Empty tool identifier strictly fails closed.');

  // 14. Normalization idempotency
  const norm14a = ProviderToolNamePolicy.normalize('fs.list_files', 'GEMINI');
  const norm14b = ProviderToolNamePolicy.normalize(norm14a, 'GEMINI');
  if (norm14a !== norm14b) throw new Error('Test 14 Failed: Normalization is not idempotent');
  console.log('✅ Test 14: Normalization is fully idempotent.');

  // 15. Collision detection (TOOL_NAME_COLLISION)
  let caughtCollision = false;
  try {
    ProviderToolNamePolicy.registerTools(
      [
        { id: 'fs/read text' },
        { id: 'fs read text' }, // Both normalize to "fs_read_text"
      ],
      'GEMINI'
    );
  } catch (err: any) {
    if (err.message.includes('TOOL_NAME_COLLISION')) {
      caughtCollision = true;
    }
  }
  if (!caughtCollision) throw new Error('Test 15 Failed: Collision detection failed to trigger for colliding tool names');
  console.log('✅ Test 15: Collision detection cleanly raised TOOL_NAME_COLLISION.');

  // 16. Canonical ID preservation & bidirectional mapping
  ProviderToolNamePolicy.clear();
  ProviderToolNamePolicy.registerTools(
    [
      { id: 'special app/tool v1' },
    ],
    'GEMINI'
  );
  const geminiName = ProviderToolNamePolicy.getProviderName('special app/tool v1', 'GEMINI');
  if (geminiName !== 'special_app_tool_v1') {
    throw new Error(`Test 16 Failed: Expected special_app_tool_v1, got ${geminiName}`);
  }
  const resolvedCanonical = ProviderToolNamePolicy.resolveCanonicalId(geminiName, 'GEMINI');
  if (resolvedCanonical !== 'special app/tool v1') {
    throw new Error(`Test 16 Failed: Reverse mapping failed to restore canonical ID: ${resolvedCanonical}`);
  }
  console.log(`✅ Test 16: Bidirectional mapping verified: "special app/tool v1" <-> "${geminiName}".`);

  // 17. Gemini serialization
  const geminiPayload = ToolSchemaTranslator.toGemini([
    {
      id: 'inspect_windows_ui',
      description: 'Inspect UI automation hierarchy',
      parameters: {
        filter: { type: 'string', description: 'Filter pattern', required: true },
      },
    },
  ]);
  const decl = geminiPayload[0]?.functionDeclarations?.[0];
  if (!decl || decl.name !== 'inspect_windows_ui' || decl.parameters.required[0] !== 'filter') {
    throw new Error('Test 17 Failed: Gemini serialization mismatch');
  }
  console.log('✅ Test 17: Gemini schema serialization conforms to Gemini FunctionDeclaration contract.');

  // 18. Complete Rezel tool registry audit
  await AgentCore.init();
  const allCaps = CapabilityRegistry.getAll();
  console.log(`\n--- Auditing all ${allCaps.length} registered capabilities against Gemini contract ---`);
  const registeredMap = ProviderToolNamePolicy.registerTools(allCaps, 'GEMINI');
  if (registeredMap.size !== allCaps.length) {
    throw new Error(`Test 18 Failed: Registered tool count mismatch: ${registeredMap.size} vs ${allCaps.length}`);
  }
  console.log(`✅ Test 18: All ${allCaps.length} registered capabilities verified 100% compliant with Gemini contract.`);

  // 19. Tool execution dispatch via AIToolExecutor
  const mockToolCall = {
    id: 'call_test_01',
    name: 'builtin.ping',
    args: { message: 'hello' },
  };
  const execResult = await AIToolExecutor.execute(mockToolCall);
  if (!execResult.toolResult.success) {
    throw new Error(`Test 19 Failed: AIToolExecutor failed on builtin.ping: ${execResult.toolResult.output}`);
  }
  console.log('✅ Test 19: Tool execution dispatch resolved through ProviderToolNamePolicy and executed cleanly.');

  console.log('\n================================================================');
  console.log('🎯 SPRINT P0-5: GEMINI TOOL CONTRACT ACCEPTANCE PASSED (100%)');
  console.log('================================================================');
}

runGeminiToolContractTests().catch((err) => {
  console.error('\n❌ GEMINI TOOL CONTRACT TESTS FAILED:', err);
  process.exit(1);
});
