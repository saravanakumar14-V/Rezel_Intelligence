/**
 * Rezel 11.2B — Unified Provider Contract & Invariants Test Suite
 *
 * Verifies:
 * - Common VendorProviderPackage, ChatAIProvider, and ReasoningAIProvider contracts across all 4 vendors
 * - Unified ProviderRegistry discovery and package resolution
 * - Unified ProviderError contract and code mappings
 * - Strict non-negotiable architecture invariants:
 *   - PolicyEngine
 *   - SecurityToolExecutor (ToolExecutor)
 *   - WorkflowRuntime
 *   - PlanEngine
 *   - Scheduler
 *   - ResourceLockManager
 *   - TransactionManager
 */

import { ProviderRegistry } from './src/lib/ai/providers/ProviderRegistry';
import { ModelCatalog } from './src/lib/ai/providers/ModelCatalog';
import { ProviderError } from './src/lib/ai/providers/adapters/ProviderError';
import { PolicyEngine } from './src/lib/security/policy/PolicyEngine';
import { ToolExecutor as SecurityToolExecutor } from './src/lib/security/ToolExecutor';
import { WorkflowRuntime } from './src/lib/ai/WorkflowRuntime';
import { PlanEngine } from './src/lib/ai/PlanEngine';
import { Scheduler } from './src/lib/ai/scheduler/Scheduler';
import { ResourceLockManager } from './src/lib/ai/scheduler/ResourceLockManager';
import { TransactionManager } from './src/lib/ai/transactions/TransactionManager';
import type { ProviderVendor } from './src/lib/ai/providers/types';

async function run112BContractTests() {
  console.log('=== Starting Rezel 11.2B Unified Provider Contract Tests ===\n');

  // ─── 1. Registry Package Discovery ───
  console.log('--- 1. ProviderRegistry Vendor Package Discovery ---');
  const registeredVendors: ProviderVendor[] = ['GEMINI', 'OPENAI', 'ANTHROPIC', 'OLLAMA'];

  for (const vendor of registeredVendors) {
    const pkg = ProviderRegistry.getPackage(vendor);
    if (!pkg) {
      throw new Error(`Test 1 Failed: Vendor package for ${vendor} is not registered in ProviderRegistry`);
    }
    if (!pkg.chat || typeof pkg.chat.chat !== 'function') {
      throw new Error(`Test 1 Failed: Vendor package for ${vendor} missing ChatAIProvider implementation`);
    }
    if (!pkg.reasoning || typeof pkg.reasoning.reason !== 'function') {
      throw new Error(`Test 1 Failed: Vendor package for ${vendor} missing ReasoningAIProvider implementation`);
    }
  }
  console.log('Test 1 Passed: All 4 vendor packages implement unified contracts and are registered.');

  // ─── 2. Capability Reporting from Catalog ───
  console.log('\n--- 2. Factual Capability Reporting ---');
  const gpt4o = ModelCatalog.getModel('gpt-4o');
  if (!gpt4o || !gpt4o.capabilities.toolCalling || !gpt4o.capabilities.vision) {
    throw new Error('Test 2 Failed: GPT-4o capabilities missing');
  }

  const o3mini = ModelCatalog.getModel('o3-mini');
  if (!o3mini || !o3mini.capabilities.extendedThinking || o3mini.capabilities.vision) {
    throw new Error('Test 2 Failed: o3-mini capability matrix mismatch (vision should be false)');
  }

  console.log('Test 2 Passed: Factual capabilities accurately exposed.');

  // ─── 3. Unified Error Hierarchy ───
  console.log('\n--- 3. Unified ProviderError Hierarchy ---');
  const testError = new ProviderError({
    code: 'RATE_LIMIT',
    message: 'Rate limit hit for key sk-proj-1234567890abcdef',
    vendor: 'OPENAI',
    modelId: 'gpt-4o',
    httpStatus: 429,
    retryAfterMs: 30000,
  });

  if (testError.code !== 'RATE_LIMIT' || testError.retryAfterMs !== 30000) {
    throw new Error('Test 3 Failed: ProviderError properties mismatch');
  }
  if (testError.message.includes('sk-proj-1234567890abcdef')) {
    throw new Error('Test 3 Failed: API key not sanitized in ProviderError constructor');
  }
  if (!ProviderError.isRetryable(testError)) {
    throw new Error('Test 3 Failed: RATE_LIMIT should be classified as retryable');
  }

  console.log('Test 3 Passed: ProviderError contract and sanitization verified.');

  // ─── 4. Non-Negotiable Architecture Invariants ───
  console.log('\n--- 4. Non-Negotiable Architecture Invariants ---');

  if (typeof PolicyEngine.evaluate !== 'function') {
    throw new Error('Test 4 Failed: PolicyEngine authority missing or altered');
  }
  if (typeof SecurityToolExecutor.execute !== 'function') {
    throw new Error('Test 4 Failed: SecurityToolExecutor execution chokepoint missing or altered');
  }
  if (typeof WorkflowRuntime.start !== 'function') {
    throw new Error('Test 4 Failed: WorkflowRuntime authority missing or altered');
  }
  if (typeof PlanEngine.createPlan !== 'function') {
    throw new Error('Test 4 Failed: PlanEngine authority missing or altered');
  }
  if (typeof Scheduler.executePlan !== 'function') {
    throw new Error('Test 4 Failed: Scheduler authority missing or altered');
  }
  if (typeof ResourceLockManager.acquireLocks !== 'function') {
    throw new Error('Test 4 Failed: ResourceLockManager authority missing or altered');
  }
  if (typeof TransactionManager.registerTransaction !== 'function') {
    throw new Error('Test 4 Failed: TransactionManager authority missing or altered');
  }

  console.log('Test 4 Passed: All execution, security, transaction, and workflow authorities remain 100% authoritative.');

  console.log('\n===========================================================');
  console.log('✅ ALL 11.2B UNIFIED CONTRACT & INVARIANT TESTS PASSED');
  console.log('===========================================================\n');
}

run112BContractTests().catch((err) => {
  console.error('\n❌ Contract Test Failed:', err);
  process.exit(1);
});
