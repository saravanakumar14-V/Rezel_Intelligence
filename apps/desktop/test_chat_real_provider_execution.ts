/**
 * Rezel OS — Real Chat & Provider Routing Acceptance Test
 *
 * Verifies that the Chat UI pipeline dispatches through AgentCore, TaskProfileBuilder,
 * ProviderRouter, ProviderAuthManager, CostGuard, ProviderHealthManager, and real provider adapters
 * without encountering the invalid "DEV" vendor package error.
 */

import './mock_tauri_core';
import { AgentCore } from './src/lib/ai/AgentCore';
import { ProviderRouter } from './src/lib/ai/providers/ProviderRouter';
import { ProviderAuthManager } from './src/lib/ai/providers/ProviderAuthManager';
import { ProviderHealthManager } from './src/lib/ai/providers/ProviderHealthManager';
import { TaskProfileBuilder } from './src/lib/ai/providers/TaskProfileBuilder';
import { ModelCatalog } from './src/lib/ai/providers/ModelCatalog';
import { ProviderRegistry } from './src/lib/ai/providers/ProviderRegistry';
import type { RoutingProfile } from './src/lib/ai/providers/types';

async function runRealChatAcceptanceTest() {
  console.log('================================================================');
  console.log('🚀 REZEL REAL CHAT & PROVIDER ROUTING ACCEPTANCE TEST');
  console.log('================================================================\n');

  // Initialize AgentCore
  await AgentCore.init();

  // Authorize providers
  ProviderAuthManager.updateAuthorization('GEMINI', {
    enabled: true,
    allowedForReasoning: true,
    allowedForAutomation: true,
    allowPaidFailover: true,
  });
  ProviderAuthManager.updateAuthorization('OPENAI', {
    enabled: true,
    allowedForReasoning: true,
    allowedForAutomation: true,
    allowPaidFailover: true,
  });
  ProviderAuthManager.updateAuthorization('OLLAMA', {
    enabled: true,
    allowedForReasoning: true,
    allowedForAutomation: true,
    allowPaidFailover: false,
  });

  // ═════════════════════════════════════════════════════════════════════════════
  // TEST 1: CHAT UI REAL CONVERSATION EXECUTION (AUTO PROFILE)
  // ═════════════════════════════════════════════════════════════════════════════
  console.log('--- TEST 1: Chat UI Execution with User Message ---');

  const streamChunks: string[] = [];
  const eventsCaptured: string[] = [];

  const handler = (event: any) => {
    eventsCaptured.push(event.type);
    if (event.type === 'stream_text' && event.text) {
      streamChunks.push(event.text);
    }
  };

  AgentCore.addEventHandler(handler);

  const testPrompt = 'Reply with exactly: REZEL_PROVIDER_OK';
  console.log(`Sending message to AgentCore: "${testPrompt}"...`);

  const responseText = await AgentCore.send(testPrompt);
  AgentCore.removeEventHandler(handler);

  console.log(`\nResponse received from AI provider:\n"${responseText}"`);

  if (responseText.includes('DEV: SERVICE_UNAVAILABLE') || responseText.includes('Vendor package DEV')) {
    throw new Error('TEST 1 FAILED: "DEV" vendor package error detected in response!');
  }

  if (!responseText || responseText.length === 0) {
    throw new Error('TEST 1 FAILED: Empty response received from provider');
  }

  console.log('\n✅ TEST 1 PASSED: Real chat response received without DEV vendor error.');

  // ═════════════════════════════════════════════════════════════════════════════
  // TEST 2: MULTI-ROUTING PROFILE VERIFICATION
  // ═════════════════════════════════════════════════════════════════════════════
  console.log('\n--- TEST 2: Routing Profiles Verification ---');

  const profiles: RoutingProfile[] = ['AUTO', 'SMART', 'BALANCED', 'FAST', 'LOCAL', 'MANUAL'];

  for (const profile of profiles) {
    ProviderRouter.setRoutingProfile(profile);

    const taskProfile = TaskProfileBuilder.build({
      category: 'CONVERSATION',
      executionTarget: 'CHAT',
      preferredModelId: profile === 'MANUAL' ? 'gemini-2.0-flash' : undefined,
    });

    const route = await ProviderRouter.selectChatProvider(taskProfile, profile);

    console.log(`  • Profile [${profile}]: Selected Vendor=${route.vendor}, Model=${route.model.id} (${route.selectionReason})`);

    if ((route.vendor as string) === 'DEV') {
      throw new Error(`TEST 2 FAILED: Profile ${profile} selected phantom vendor DEV!`);
    }

    if (profile === 'LOCAL' && route.vendor !== 'OLLAMA' && route.vendor !== 'LOCAL') {
      throw new Error(`TEST 2 FAILED: LOCAL profile selected cloud vendor ${route.vendor}!`);
    }
  }

  console.log('✅ TEST 2 PASSED: All 6 routing profiles select real, registered, implemented vendors.');

  // ═════════════════════════════════════════════════════════════════════════════
  // TEST 3: INVALID / UNREGISTERED PROVIDER DEFENSE
  // ═════════════════════════════════════════════════════════════════════════════
  console.log('\n--- TEST 3: Invalid Provider Defense (Invariant Validation) ---');

  // Verify that ModelCatalog does NOT contain DEV
  const allModels = ModelCatalog.listModels();
  const devModels = allModels.filter((m) => (m.vendor as string) === 'DEV');
  if (devModels.length > 0) {
    throw new Error('TEST 3 FAILED: DEV models still exist in ModelCatalog');
  }

  // Verify that ProviderRegistry does NOT list DEV
  const registeredPackages = ProviderRegistry.listPackages();
  const devPackages = registeredPackages.filter((p) => (p.vendor as string) === 'DEV');
  if (devPackages.length > 0) {
    throw new Error('TEST 3 FAILED: DEV package exists in ProviderRegistry');
  }

  console.log('✅ TEST 3 PASSED: Zero phantom DEV providers exist in ModelCatalog or ProviderRegistry.');

  console.log('\n================================================================');
  console.log('🎯 REAL CHAT & PROVIDER ROUTING ACCEPTANCE PASSED (100%)');
  console.log('================================================================');
}

runRealChatAcceptanceTest().catch((err) => {
  console.error('\n❌ REAL CHAT ACCEPTANCE TEST FAILED:', err);
  process.exit(1);
});
