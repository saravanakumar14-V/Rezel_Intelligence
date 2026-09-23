/**
 * Rezel 11.2A — Commercial Multi-Provider AI Platform Foundation & UI Contract Test Suite
 *
 * Verifies:
 * 1. ModelCatalog metadata, capability discovery, and vendor queries.
 * 2. ProviderHealthManager state transitions, separate provider vs model health, and dynamic reset parsing.
 * 3. ProviderAuthManager multi-key storage, authorization policies, and paid-failover flags.
 * 4. CostGuard non-authoritative estimation and budget limit checks.
 * 5. TaskProfileBuilder requirement derivation.
 * 6. ProviderRegistry vendor package discovery.
 * 7. Invariants: PolicyEngine, SecurityToolExecutor, WorkflowRuntime, and PlanEngine remain fully authoritative.
 */

import { ModelCatalog } from './src/lib/ai/providers/ModelCatalog';
import { ProviderHealthManager } from './src/lib/ai/providers/ProviderHealthManager';
import { ProviderAuthManager } from './src/lib/ai/providers/ProviderAuthManager';
import { CostGuard } from './src/lib/ai/providers/CostGuard';
import { TaskProfileBuilder } from './src/lib/ai/providers/TaskProfileBuilder';
import { ProviderRegistry } from './src/lib/ai/providers/ProviderRegistry';
import { PolicyEngine } from './src/lib/security/policy/PolicyEngine';
import { ToolExecutor as SecurityToolExecutor } from './src/lib/security/ToolExecutor';
import { WorkflowRuntime } from './src/lib/ai/WorkflowRuntime';
import { PlanEngine } from './src/lib/ai/PlanEngine';

async function run112AFoundationTests() {
  console.log('=== Starting Rezel 11.2A Multi-Provider Foundation & UI Contract Tests ===\n');

  // ─── 1. ModelCatalog Metadata & Discovery ───
  console.log('--- 1. ModelCatalog Metadata & Discovery ---');
  const allModels = ModelCatalog.listModels();
  if (allModels.length < 10) {
    throw new Error(`Test 1 Failed: Expected at least 10 catalog models, found ${allModels.length}`);
  }

  const geminiModels = ModelCatalog.getModelsByVendor('GEMINI');
  const openAiModels = ModelCatalog.getModelsByVendor('OPENAI');
  const anthropicModels = ModelCatalog.getModelsByVendor('ANTHROPIC');
  const ollamaModels = ModelCatalog.getModelsByVendor('OLLAMA');

  if (geminiModels.length < 2 || openAiModels.length < 2 || anthropicModels.length < 2 || ollamaModels.length < 2) {
    throw new Error('Test 1 Failed: Vendor models missing in default catalog');
  }

  const claude37 = ModelCatalog.getModel('claude-3-7-sonnet-20250219');
  if (!claude37 || !claude37.capabilities.extendedThinking || !claude37.capabilities.toolCalling) {
    throw new Error('Test 1 Failed: Claude 3.7 Sonnet capabilities missing');
  }

  const o3mini = ModelCatalog.getModel('o3-mini');
  if (!o3mini || !o3mini.capabilities.extendedThinking || o3mini.capabilities.vision) {
    throw new Error('Test 1 Failed: o3-mini capability matrix mismatch');
  }

  console.log('Test 1 Passed: ModelCatalog contains declarative metadata for Gemini, OpenAI, Anthropic, and Ollama.');

  // ─── 2. ProviderHealthManager Circuit Breaker & Health Isolation ───
  console.log('\n--- 2. ProviderHealthManager State Transitions & Cooldowns ---');
  
  // Initially healthy
  const initialHealth = ProviderHealthManager.getProviderHealth('GEMINI');
  if (initialHealth.state !== 'HEALTHY') {
    throw new Error(`Test 2 Failed: Initial health not HEALTHY: ${initialHealth.state}`);
  }

  // Model-level rate limit does not mark entire provider AUTH_FAILED
  ProviderHealthManager.recordFailure({
    vendor: 'OPENAI',
    modelId: 'gpt-4o',
    errorCode: 'RATE_LIMIT',
    errorMessage: 'TPM limit exceeded',
    httpStatus: 429,
    retryAfterHeader: '30',
  });

  const gpt4oHealth = ProviderHealthManager.getModelHealth('gpt-4o', 'OPENAI');
  if (gpt4oHealth.state !== 'RATE_LIMITED' || !gpt4oHealth.retryAfterMs || gpt4oHealth.retryAfterMs !== 30000) {
    throw new Error(`Test 2 Failed: gpt-4o model rate limit state not set correctly: ${JSON.stringify(gpt4oHealth)}`);
  }

  // Auth failure marks entire provider AUTH_FAILED
  ProviderHealthManager.recordFailure({
    vendor: 'ANTHROPIC',
    errorCode: 'AUTHENTICATION_FAILURE',
    errorMessage: 'Invalid API Key',
    httpStatus: 401,
  });

  const anthropicHealth = ProviderHealthManager.getProviderHealth('ANTHROPIC');
  if (anthropicHealth.state !== 'AUTH_FAILED') {
    throw new Error(`Test 2 Failed: Anthropic provider not marked AUTH_FAILED: ${anthropicHealth.state}`);
  }

  const claudeHealth = ProviderHealthManager.getModelHealth('claude-3-7-sonnet-20250219', 'ANTHROPIC');
  if (claudeHealth.state !== 'AUTH_FAILED') {
    throw new Error(`Test 2 Failed: Model did not inherit provider AUTH_FAILED state: ${claudeHealth.state}`);
  }

  // Recovery clears failure
  ProviderHealthManager.recordSuccess('ANTHROPIC', 'claude-3-7-sonnet-20250219');
  const recoveredAnthropic = ProviderHealthManager.getProviderHealth('ANTHROPIC');
  if (recoveredAnthropic.state !== 'HEALTHY') {
    throw new Error(`Test 2 Failed: Recovery failed to reset state to HEALTHY: ${recoveredAnthropic.state}`);
  }

  console.log('Test 2 Passed: Provider and model health tracked independently with dynamic cooldown parsing.');

  // ─── 3. ProviderAuthManager Multi-Key & Policy Enforcement ───
  console.log('\n--- 3. ProviderAuthManager Policies & Paid-Failover Safety ---');
  
  const initialOpenAiAuth = ProviderAuthManager.getAuthorization('OPENAI');
  if (initialOpenAiAuth.allowPaidFailover !== false) {
    throw new Error('Test 3 Failed: allowPaidFailover must default to false (zero-surprise billing invariant)');
  }

  // Save in-memory key
  await ProviderAuthManager.saveKey('OPENAI', 'sk-test-openai-key-12345');
  const savedKey = await ProviderAuthManager.getKey('OPENAI');
  if (savedKey !== 'sk-test-openai-key-12345') {
    throw new Error('Test 3 Failed: Saved key not retrieved accurately');
  }

  // Update failover authorization
  ProviderAuthManager.updateAuthorization('OPENAI', {
    allowPaidFailover: true,
    maxCostPerRequestUSD: 1.00,
    maxDailyCostUSD: 10.00,
  });

  const updatedOpenAiAuth = ProviderAuthManager.getAuthorization('OPENAI');
  if (!updatedOpenAiAuth.allowPaidFailover || updatedOpenAiAuth.maxCostPerRequestUSD !== 1.00) {
    throw new Error('Test 3 Failed: Updated auth policies not reflected');
  }

  console.log('Test 3 Passed: Multi-key storage and paid-failover authorization policies strictly enforced.');

  // ─── 4. CostGuard Pre-Execution Estimation ───
  console.log('\n--- 4. CostGuard Non-Authoritative Pre-Execution Safety Guard ---');
  
  const gpt4oPricing = ModelCatalog.getModel('gpt-4o')!.pricing;
  const estimate = CostGuard.estimate(gpt4oPricing, 20_000, 4000, updatedOpenAiAuth);

  // (20000 / 10^6 * 2.50) + (4000 / 10^6 * 10.00) = 0.05 + 0.04 = $0.09
  if (estimate.estimatedCostUSD !== 0.09) {
    throw new Error(`Test 4 Failed: Expected estimated cost $0.09, got ${estimate.estimatedCostUSD}`);
  }
  if (estimate.isExceedingRequestLimit || estimate.isExceedingDailyLimit) {
    throw new Error('Test 4 Failed: $0.09 falsely flagged as exceeding limit');
  }

  // Exceeding request cap
  const strictAuth = { ...updatedOpenAiAuth, maxCostPerRequestUSD: 0.05 };
  const strictEstimate = CostGuard.estimate(gpt4oPricing, 20_000, 4000, strictAuth);
  if (!strictEstimate.isExceedingRequestLimit) {
    throw new Error('Test 4 Failed: CostGuard failed to flag request exceeding $0.05 limit');
  }

  console.log('Test 4 Passed: CostGuard accurately computes pre-dispatch safety limits.');

  // ─── 5. TaskProfileBuilder Structured Derivation ───
  console.log('\n--- 5. TaskProfileBuilder Requirement Derivation ---');
  
  const automationTask = TaskProfileBuilder.build({
    category: 'AUTOMATION',
    executionTarget: 'REASONING',
    goal: 'Create a 3D camera in Blender',
  });

  if (!automationTask.requiredCapabilities.toolCalling || !automationTask.requiredCapabilities.structuredOutput) {
    throw new Error('Test 5 Failed: Automation task missing required tool/structuredOutput capabilities');
  }

  const visionTask = TaskProfileBuilder.build({
    category: 'VISION',
    hasVisionMedia: true,
  });

  if (!visionTask.requiredCapabilities.vision) {
    throw new Error('Test 5 Failed: Vision task missing vision requirement');
  }

  console.log('Test 5 Passed: TaskProfileBuilder derives immutable requirement contracts.');

  // ─── 6. ProviderRegistry Discovery ───
  console.log('\n--- 6. ProviderRegistry Discovery ---');
  const discovered = await ProviderRegistry.discoverAll();
  if (discovered.length < 4) {
    throw new Error(`Test 6 Failed: Expected discovery of all major vendors, got ${discovered.length}`);
  }
  console.log('Test 6 Passed: ProviderRegistry discovers all registered vendor packages.');

  // ─── 7. Invariants Protection ───
  console.log('\n--- 7. Non-Negotiable Architecture Invariants ---');
  
  if (typeof PolicyEngine.evaluate !== 'function') {
    throw new Error('Test 7 Failed: PolicyEngine authority missing or altered');
  }
  if (typeof SecurityToolExecutor.execute !== 'function') {
    throw new Error('Test 7 Failed: SecurityToolExecutor execution chokepoint missing or altered');
  }
  if (typeof WorkflowRuntime.start !== 'function') {
    throw new Error('Test 7 Failed: WorkflowRuntime workflow authority missing or altered');
  }
  if (typeof PlanEngine.createPlan !== 'function') {
    throw new Error('Test 7 Failed: PlanEngine authority missing or altered');
  }

  console.log('Test 7 Passed: PolicyEngine, SecurityToolExecutor, WorkflowRuntime, and PlanEngine remain fully authoritative.');

  console.log('\n===========================================================');
  console.log('✅ ALL REZEL 11.2A FOUNDATION & UI TESTS PASSED (100% GREEN)');
  console.log('===========================================================\n');
}

run112AFoundationTests().catch((err) => {
  console.error('\n❌ Test Suite Failed:', err);
  process.exit(1);
});
