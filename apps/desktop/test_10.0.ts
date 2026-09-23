import { CapabilityRegistry } from './src/lib/ai/capabilities/CapabilityRegistry.js';
import { CapabilityProviderRegistry } from './src/lib/ai/capabilities/CapabilityProviderRegistry.js';
import { FilesystemProvider } from './src/lib/ai/capabilities/providers/FilesystemProvider.js';
import { PolicyEngine } from './src/lib/security/policy/PolicyEngine.js';
import { PolicyStore } from './src/lib/security/policy/PolicyStore.js';
import { setApprovalHandler } from './src/lib/security/ToolExecutor.js';
import { PlanEngine } from './src/lib/ai/Planner.js';
import type { Plan } from './src/lib/ai/types.js';
import { WorkflowRuntime } from './src/lib/ai/WorkflowRuntime.js';
import { WorkflowStore } from './src/lib/ai/persistence/WorkflowStore.js';
import { WorkflowRecoveryManager } from './src/lib/ai/persistence/WorkflowRecoveryManager.js';
import { TransactionManager } from './src/lib/ai/transactions/TransactionManager.js';
import { _mockFileSystem } from './mock_tauri_core.js'; // aliased in vite config
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

if (!globalThis.crypto) {
  (globalThis as any).crypto = crypto;
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function runTests() {
  console.log("Starting 10.0 Persistence & Crash Recovery Tests...");

  CapabilityProviderRegistry.clear();
  CapabilityRegistry.clear();
  CapabilityProviderRegistry.register(FilesystemProvider);
  PolicyStore.clear();

  const testRoot = fs.mkdtempSync(path.join(process.cwd(), 'rezel_test_persist_'));
  const testRootNormalized = testRoot.replace(/\\/g, '/');
  
  const activeScopes = [{
    allowedRoots: [testRootNormalized],
    deniedRoots: [],
    readAllowed: true,
    writeAllowed: true,
    deleteAllowed: true,
    maxAffectedItems: 100,
    maxAffectedBytes: 10000,
  }];

  let mockApprove = true;
  setApprovalHandler((req) => {
    import('./src/lib/security/ToolExecutor.js').then(m => m.resolveApproval(req.id, mockApprove));
  });

  PolicyEngine.evaluate = async (ctx) => {
    return { decision: 'ALLOW', reason: 'mocked' };
  };

  const { PathGuard } = await import('./src/lib/ai/capabilities/providers/filesystem/PathGuard.js');
  PathGuard.getRustScope = async () => ({
    allowed_roots: activeScopes[0].allowedRoots,
    read_allowed: true,
    write_allowed: true,
    delete_allowed: true
  });

  const { FileOperations } = await import('./src/lib/ai/capabilities/providers/filesystem/FileOperations.js');
  FileOperations.createFile = async (p: string) => {
    await new Promise(r => setTimeout(r, 10)); // simulate slow op
    fs.writeFileSync(p, "");
  };
  FileOperations.stat = async (p: string) => {
    if (fs.existsSync(p)) {
      const s = fs.statSync(p);
      return { isFile: s.isFile(), isDir: s.isDirectory(), size: s.size, modified: s.mtimeMs };
    }
    throw new Error('Not found');
  };
  FileOperations.deleteFile = async (p: string) => {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  };
  FileOperations.readText = async (p: string) => {
    return fs.readFileSync(p, 'utf8');
  };

  // --- Initialize Persistence ---
  await WorkflowRuntime.initialize();
  await TransactionManager.initialize();

  // Test A-E: Workflow survives save/load, Plan/Step state, Events, Transactions
  console.log("--- A-E: Workflow & Persistence survives save/load ---");
  
  const planA: Plan = {
    id: 'planA',
    goal: 'Test Persistence',
    status: 'PLANNED',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    steps: [
      {
        id: 'step1',
        description: 'Create file',
        toolName: 'fs.create_file',
        toolArgs: { path: `${testRootNormalized}/persist.txt`, content: 'hello' },
        status: 'PENDING',
        attempts: 0
      }
    ]
  };

  const workflowA = WorkflowRuntime.start(planA);
  
  // Wait for it to complete
  await new Promise<void>((resolve, reject) => {
    const check = () => {
      if (workflowA.status === 'SUCCEEDED') resolve();
      else if (workflowA.status === 'FAILED' || workflowA.status === 'CANCELLED') reject(new Error("Workflow failed unexpectedly"));
      else setTimeout(check, 10);
    };
    check();
  });

  // Verify it exists in mock filesystem
  const fileContent = _mockFileSystem['rezel_workflows.json'];
  assert(!!fileContent, "rezel_workflows.json should exist");
  
  const parsedStore = JSON.parse(fileContent);
  assert(parsedStore.workflows[workflowA.id]?.status === 'SUCCEEDED', "Workflow should be persisted as SUCCEEDED");
  assert(parsedStore.events[workflowA.id]?.length > 0, "Events should be persisted");
  assert(parsedStore.transactions[workflowA.id]?.length > 0, "Transactions should be persisted");

  // Reload simulation
  WorkflowStore['store'] = { version: 1, workflows: {}, events: {}, transactions: {} }; // Clear mem
  WorkflowStore['loaded'] = false;
  await WorkflowRuntime.initialize();
  
  const loadedWorkflow = WorkflowRuntime.get(workflowA.id);
  assert(loadedWorkflow?.status === 'SUCCEEDED', "Workflow should be SUCCEEDED after reload");
  assert(loadedWorkflow?.plan.steps[0].status === 'COMPLETED', "Step should be COMPLETED after reload");


  // Test F-H: Crash Recovery & UNKNOWN Semantics
  console.log("--- F-H: Crash Recovery & UNKNOWN Semantics ---");
  
  // Create a corrupt/interrupted state directly in the store
  const interruptedWorkflowId = 'wf_interrupted';
  parsedStore.workflows[interruptedWorkflowId] = {
    id: interruptedWorkflowId,
    status: 'RUNNING',
    plan: {
      id: 'plan_interrupted',
      status: 'RUNNING',
      steps: [
        {
          id: 'step_running',
          status: 'RUNNING',
          toolName: 'fs.create_file',
          attempts: 1
        }
      ]
    }
  };
  _mockFileSystem['rezel_workflows.json'] = JSON.stringify(parsedStore);

  // Clear mem and reload
  WorkflowStore['store'] = { version: 1, workflows: {}, events: {}, transactions: {} };
  WorkflowStore['loaded'] = false;
  await WorkflowRuntime.initialize();

  const recoveredInterrupted = WorkflowRuntime.get(interruptedWorkflowId);
  assert(recoveredInterrupted?.status === 'RECOVERY_REQUIRED', "Interrupted workflow should be RECOVERY_REQUIRED");
  assert(recoveredInterrupted?.plan.steps[0].status === 'FAILED', "Interrupted step should be marked FAILED");
  assert(recoveredInterrupted?.plan.steps[0].executionOutcome === 'UNKNOWN', "Interrupted step outcome should be UNKNOWN");


  // Test I: WAITING_FOR_USER
  console.log("--- I: WAITING_FOR_USER recovery ---");
  
  parsedStore.workflows['wf_waiting'] = {
    id: 'wf_waiting',
    status: 'WAITING_FOR_USER',
    plan: {
      id: 'plan_waiting',
      status: 'WAITING_FOR_USER',
      steps: [
        {
          id: 'step_waiting',
          status: 'WAITING',
          waitingReason: 'USER_CONFIRMATION',
          attempts: 1
        }
      ]
    }
  };
  _mockFileSystem['rezel_workflows.json'] = JSON.stringify(parsedStore);

  WorkflowStore['store'] = { version: 1, workflows: {}, events: {}, transactions: {} };
  WorkflowStore['loaded'] = false;
  await WorkflowRuntime.initialize();

  const recoveredWaiting = WorkflowRuntime.get('wf_waiting');
  assert(recoveredWaiting?.status === 'WAITING_FOR_USER', "Waiting workflow should remain WAITING_FOR_USER");
  assert(recoveredWaiting?.plan.steps[0].status === 'WAITING', "Waiting step should remain WAITING");


  console.log("All 10.0 Persistence & Recovery Tests Passed!");
}

runTests().then(() => {
  console.log("Success");
  process.exit(0);
}).catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
