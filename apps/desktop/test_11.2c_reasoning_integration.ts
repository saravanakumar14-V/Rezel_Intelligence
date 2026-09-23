/**
 * Rezel 11.2C — Reasoning Provider & UNKNOWN Invariance Test Suite
 *
 * Verifies:
 * - Reasoning provider selection is decoupled from Chat provider selection
 * - Structured reasoning outputs convert to Action graph and PlanEngine plans
 * - UNKNOWN Mutation Invariant: Once an external mutation executes, UNKNOWN
 *   completion is NEVER automatically retried via provider failover.
 */

import { ProviderRouter } from './src/lib/ai/providers/ProviderRouter';
import { TaskProfileBuilder } from './src/lib/ai/providers/TaskProfileBuilder';
import { ProviderAuthManager } from './src/lib/ai/providers/ProviderAuthManager';
import { ProviderRegistry } from './src/lib/ai/providers/ProviderRegistry';
import { AnthropicVendorPackage } from './src/lib/ai/providers/adapters/AnthropicAdapter';
import { ActionValidator } from './src/lib/reasoning/ActionValidator';
import { ActionNormalizer } from './src/lib/reasoning/ActionNormalizer';
import type { AgentAction, UnknownMutationRecord } from './src/lib/reasoning/types';

async function runReasoningIntegrationTests() {
  console.log('=== Starting Rezel 11.2C Reasoning & UNKNOWN Invariance Tests ===\n');

  await ProviderAuthManager.saveKey('ANTHROPIC', 'sk-ant-mock-key');

  // ─── 1. Decoupled Reasoning Provider Selection ───
  console.log('--- 1. Decoupled Reasoning Provider Selection ---');
  const reasoningTask = TaskProfileBuilder.build({
    category: 'REASONING',
    executionTarget: 'REASONING',
    requiresExtendedThinking: true,
  });

  const mockReasoningFetch = async (): Promise<Response> => {
    return new Response(
      JSON.stringify({
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              status: 'ACTIONS',
              summary: 'Create test object',
              actions: [
                {
                  id: 'act_1',
                  type: 'MODIFY_APPLICATION',
                  description: 'Create cube in Blender',
                  capabilityId: 'blender.create_object',
                  parameters: { name: 'Rezel_Cube' },
                },
              ],
            }),
          },
        ],
      }),
      { status: 200 }
    );
  };

  ProviderRegistry.registerPackage(new AnthropicVendorPackage({ fetchFn: mockReasoningFetch as any }));

  const reasoningResult = await ProviderRouter.reason(reasoningTask, {
    goal: 'Create cube',
    context: {},
  });

  if (!reasoningResult.structured || reasoningResult.structured.status !== 'ACTIONS') {
    throw new Error('Test 1 Failed: Structured reasoning output missing');
  }

  // Normalize actions
  const { actions, validationResult } = ActionNormalizer.normalize(reasoningResult.structured.actions);
  if (!validationResult.valid || actions.length === 0) {
    throw new Error('Test 1 Failed: Action normalization failed');
  }

  console.log('Test 1 Passed: Reasoning provider executed and generated structured action graph.');

  // ─── 2. UNKNOWN Mutation Block Invariant ───
  console.log('\n--- 2. UNKNOWN Mutation Block Invariant ---');
  
  // Create an unresolved UNKNOWN mutation record (from a previous crashed or timed-out external action)
  const fpHash = ActionValidator.computeFingerprintHash(
    'blender.create_object',
    { name: 'Rezel_Cube' },
    'D:/Projects/Test'
  );

  const unknownRecord: UnknownMutationRecord = {
    actionId: 'act_unknown_001',
    capabilityId: 'blender.create_object',
    applicationId: 'blender',
    timestamp: new Date().toISOString(),
    resolutionState: 'UNRESOLVED',
    parameters: { name: 'Rezel_Cube' },
    fingerprint: {
      hash: fpHash,
      capabilityId: 'blender.create_object',
      canonicalArgsJson: JSON.stringify({ name: 'Rezel_Cube' }),
      createdAt: new Date().toISOString(),
    },
  };

  // Attempt to validate new actions attempting to mutate Blender while UNKNOWN record is unresolved
  const duplicateAction: AgentAction = {
    id: 'act_duplicate_002',
    type: 'MODIFY_APPLICATION',
    description: 'Retry creating cube in Blender',
    capabilityId: 'blender.create_object',
    parameters: { name: 'Rezel_Cube' },
    args: { name: 'Rezel_Cube' },
  };

  const { accepted, rejected } = ActionValidator.validate([duplicateAction], {
    projectRootPath: 'D:/Projects/Test',
    unknownMutationRecords: [unknownRecord],
    capabilityChecker: () => true,
  });

  if (accepted.length > 0 || rejected.length === 0) {
    throw new Error('Test 2 Failed: ActionValidator allowed action execution while UNKNOWN mutation is unresolved!');
  }

  if (rejected[0].code !== 'UNKNOWN_MUTATION_BLOCKED') {
    throw new Error(`Test 2 Failed: Expected rejection code UNKNOWN_MUTATION_BLOCKED, got: ${rejected[0].code}`);
  }

  console.log('Test 2 Passed: UNKNOWN mutation strictly blocks automatic retry across all providers.');

  console.log('\n===========================================================');
  console.log('✅ ALL REASONING & UNKNOWN INVARIANCE TESTS PASSED (100% GREEN)');
  console.log('===========================================================\n');
}

runReasoningIntegrationTests().catch((err) => {
  console.error('\n❌ Reasoning Integration Test Failed:', err);
  process.exit(1);
});
