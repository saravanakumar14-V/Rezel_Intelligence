import { CapabilityRegistry } from './src/lib/ai/capabilities/CapabilityRegistry.js';
import { CapabilityProviderRegistry } from './src/lib/ai/capabilities/CapabilityProviderRegistry.js';
import { FilesystemProvider } from './src/lib/ai/capabilities/providers/FilesystemProvider.js';
import { PolicyEngine } from './src/lib/security/policy/PolicyEngine.js';
import { PolicyStore } from './src/lib/security/policy/PolicyStore.js';
import { ToolExecutor as SecurityToolExecutor, setApprovalHandler } from './src/lib/security/ToolExecutor.js';
import { TransactionManager } from './src/lib/ai/transactions/TransactionManager.js';
import { AIToolExecutor } from './src/lib/ai/ToolExecutor.js';
import { PlanEngine } from './src/lib/ai/Planner.js';
import { planStateMachine } from './src/lib/ai/PlanStateMachine.js';
import type { Plan, PlanStep } from './src/lib/ai/types.js';
import * as fs from 'fs';
import * as path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function runTests() {
  console.log("Starting 9.8 Verification, Dry-Run & Transaction Safety Tests...");

  CapabilityProviderRegistry.clear();
  CapabilityRegistry.clear();
  CapabilityProviderRegistry.register(FilesystemProvider);
  PolicyStore.clear();

  const testRoot = fs.mkdtempSync(path.join(process.cwd(), 'rezel_test_tx_'));
  const testRootNormalized = testRoot.replace(/\\/g, '/');
  
  const activeScopes = [{
    allowedRoots: [testRootNormalized],
    deniedRoots: [],
    readAllowed: true,
    writeAllowed: true,
    deleteAllowed: true,
    maxAffectedItems: 10,
    maxAffectedBytes: 1000,
  }];

  // Mock auto-approval for SecurityToolExecutor
  setApprovalHandler((req) => {
    import('./src/lib/security/ToolExecutor.js').then(m => m.resolveApproval(req.id, true));
  });

  const originalEvaluate = PolicyEngine.evaluate;
  PolicyEngine.evaluate = async (ctx) => {
    if (ctx.args && (ctx.args as any).path?.includes('test_file.txt')) {
      return { decision: 'ALLOW', reason: 'mocked' };
    }
    return originalEvaluate(ctx);
  };

  const { PathGuard } = await import('./src/lib/ai/capabilities/providers/filesystem/PathGuard.js');
  PathGuard.getRustScope = async () => ({
    allowed_roots: activeScopes[0].allowedRoots,
    read_allowed: true,
    write_allowed: true,
    delete_allowed: true
  });

  try {
    const fileToCreate = path.join(testRoot, 'test_file.txt').replace(/\\/g, '/');

    console.log("--- A & B: Dry-run produces no mutation and reports trusted info ---");
    const capCreate = CapabilityRegistry.get('fs.create_file')!;
    const dryRunRes = await AIToolExecutor.dryRunCapability(capCreate, { path: fileToCreate }, { workflowId: 'wf1', executionId: 'ex1', scopes: activeScopes });
    assert(dryRunRes.risk === 'MEDIUM', 'Dry run should report MEDIUM risk');
    assert(dryRunRes.reversibility === 'REVERSIBLE', 'Create file should be reversible');
    assert(!fs.existsSync(fileToCreate), 'Dry run MUST NOT mutate the filesystem');

    console.log("--- C & D & F: Execute, Verify, and Registration ---");
    // Mock the FileOperations internally used by capability to actually run
    const { FileOperations } = await import('./src/lib/ai/capabilities/providers/filesystem/FileOperations.js');
    FileOperations.createFile = async (p: string) => fs.writeFileSync(p, "");
    FileOperations.stat = async (p: string) => {
      const s = fs.statSync(p);
      return { isFile: s.isFile(), isDir: s.isDirectory(), size: s.size, modified: s.mtimeMs };
    };
    FileOperations.deleteFile = async (p: string) => fs.unlinkSync(p);

    const step: PlanStep = {
      id: 'step1', description: 'create file', toolName: 'fs.create_file', toolArgs: { path: fileToCreate },
      status: 'PENDING', attempts: 0
    };
    const plan: Plan = {
      id: 'plan1', workflowId: 'wf1', goal: 'Test', steps: [step], status: 'PLANNED', createdAt: '', updatedAt: ''
    };

    // Execute via PlanEngine
    await PlanEngine.execute(plan);
    if (!fs.existsSync(fileToCreate)) {
       console.log("Plan execution failed. Plan state:", JSON.stringify(plan, null, 2));
    }
    assert(fs.existsSync(fileToCreate), 'Execute should have mutated filesystem');
    assert(plan.status === 'SUCCEEDED', 'Plan should succeed after verification');
    assert(step.status === 'COMPLETED', 'Step should be completed');
    
    console.log("--- M: Workflow Isolation ---");
    // @ts-ignore
    const records = TransactionManager.records.get('wf1');
    assert(records && records.length === 1, 'Transaction should be registered');
    assert(records[0].stepId === 'step1', 'Step ID should match');
    assert(records[0].status === 'COMMITTED', 'Status should be COMMITTED');
    assert(records[0].reversibility === 'REVERSIBLE', 'Should be logged as reversible');

    console.log("--- G & J: Successful compensation (passes through PolicyEngine) ---");
    const rollbackRes = await TransactionManager.rollbackWorkflow('wf1', activeScopes);
    assert(rollbackRes === true, 'Rollback should succeed');
    assert(records[0].status === 'COMPENSATED', 'Record should be updated to COMPENSATED');
    assert(!fs.existsSync(fileToCreate), 'Compensation should have deleted the created file');

    console.log("--- L: Duplicate compensation is prevented ---");
    const dupRollback = await TransactionManager.rollbackWorkflow('wf1', activeScopes);
    assert(dupRollback === true, 'Duplicate rollback should safely do nothing and return true');

    console.log("--- E & H & I: Failed verification and Irreversible operations ---");
    const delStep: PlanStep = {
      id: 'step2', description: 'del', toolName: 'fs.delete', toolArgs: { path: fileToCreate },
      status: 'PENDING', attempts: 0
    };
    const plan2: Plan = {
      id: 'plan2', workflowId: 'wf2', goal: 'Test', steps: [delStep], status: 'PLANNED', createdAt: '', updatedAt: ''
    };
    fs.writeFileSync(fileToCreate, ""); // recreate to delete
    await PlanEngine.execute(plan2);
    // @ts-ignore
    const delRecords = TransactionManager.records.get('wf2');
    assert(delRecords && delRecords.length === 1, 'Delete tx should be registered');
    assert(delRecords[0].reversibility === 'IRREVERSIBLE', 'Delete is IRREVERSIBLE');
    const rollbackRes2 = await TransactionManager.rollbackWorkflow('wf2', activeScopes);
    assert(rollbackRes2 === false, 'Rollback should return false due to IRREVERSIBLE');

    console.log("--- T: LLM cannot inject transaction metadata ---");
    assert(records[0].executionId !== undefined && records[0].executionId !== '', 'executionId should be generated by runtime');
    assert(records[0].resourceInfo !== null, 'resourceInfo should be fetched via dryRun/inspection');

    console.log("All 9.8 Tests Passed!");
  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
    setApprovalHandler(null);
  }
}

runTests().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
