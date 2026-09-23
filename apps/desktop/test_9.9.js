import { CapabilityRegistry } from './src/lib/ai/capabilities/CapabilityRegistry.js';
import { CapabilityProviderRegistry } from './src/lib/ai/capabilities/CapabilityProviderRegistry.js';
import { FilesystemProvider } from './src/lib/ai/capabilities/providers/FilesystemProvider.js';
import { PolicyEngine } from './src/lib/security/policy/PolicyEngine.js';
import { PolicyStore } from './src/lib/security/policy/PolicyStore.js';
import { setApprovalHandler } from './src/lib/security/ToolExecutor.js';
import { PlanEngine } from './src/lib/ai/Planner.js';
import { ResourceLockManager } from './src/lib/ai/scheduler/ResourceLockManager.js';
import * as fs from 'fs';
import * as path from 'path';
function assert(condition, message) {
    if (!condition)
        throw new Error(`Assertion failed: ${message}`);
}
async function runTests() {
    console.log("Starting 9.9 Scheduler & Lock Tests...");
    CapabilityProviderRegistry.clear();
    CapabilityRegistry.clear();
    CapabilityProviderRegistry.register(FilesystemProvider);
    PolicyStore.clear();
    const testRoot = fs.mkdtempSync(path.join(process.cwd(), 'rezel_test_sched_'));
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
    // Mock auto-approval for SecurityToolExecutor
    let mockApprove = true;
    let onApprovalRequested = null;
    setApprovalHandler((req) => {
        if (onApprovalRequested)
            onApprovalRequested();
        import('./src/lib/security/ToolExecutor.js').then(m => m.resolveApproval(req.id, mockApprove));
    });
    const originalEvaluate = PolicyEngine.evaluate;
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
    // Track concurrent executions
    let activeOps = 0;
    let maxActiveOps = 0;
    FileOperations.createFile = async (p) => {
        activeOps++;
        maxActiveOps = Math.max(maxActiveOps, activeOps);
        await new Promise(r => setTimeout(r, 100)); // simulate slow op
        fs.writeFileSync(p, "");
        activeOps--;
    };
    FileOperations.stat = async (p) => {
        if (fs.existsSync(p)) {
            const s = fs.statSync(p);
            return { isFile: s.isFile(), isDir: s.isDirectory(), size: s.size, modified: s.mtimeMs };
        }
        throw new Error('Not found');
    };
    FileOperations.deleteFile = async (p) => {
        if (fs.existsSync(p))
            fs.unlinkSync(p);
    };
    FileOperations.readText = async (p) => {
        activeOps++;
        maxActiveOps = Math.max(maxActiveOps, activeOps);
        await new Promise(r => setTimeout(r, 100)); // simulate slow op
        const res = fs.readFileSync(p, 'utf8');
        activeOps--;
        return res;
    };
    const events = [];
    const { planStateMachine } = await import('./src/lib/ai/PlanStateMachine.js');
    planStateMachine.setEventHandler((evt) => {
        events.push(evt);
    });
    try {
        console.log("--- A & D & J & K: Parallelism, independent resources, concurrency limits ---");
        maxActiveOps = 0;
        // Create 4 files concurrently. They write to independent files, so they shouldn't conflict.
        const steps = [];
        for (let i = 0; i < 4; i++) {
            steps.push({
                id: `step_${i}`, description: `create file ${i}`, toolName: 'fs.create_file',
                toolArgs: { path: `${testRootNormalized}/file${i}.txt` }, status: 'PENDING', attempts: 0
            });
        }
        const planA = {
            id: 'planA', workflowId: 'wfA', goal: 'Test', steps, status: 'PLANNED', createdAt: '', updatedAt: ''
        };
        await PlanEngine.execute(planA);
        assert(planA.status === 'SUCCEEDED', 'PlanA should succeed');
        // Since cap limit is 3, maxActiveOps should be exactly 3 (4th waits)
        // Actually, create_file doesn't have an explicit capability limit set in test, it uses DEFAULT 3
        assert(maxActiveOps <= 3, `Max active ops should be bounded by capability limits, got ${maxActiveOps}`);
        assert(maxActiveOps > 1, 'Steps should have executed concurrently');
        console.log("--- B: Dependency ordering ---");
        events.length = 0;
        const planB = {
            id: 'planB', workflowId: 'wfB', goal: 'Test', steps: [
                { id: 'b1', description: 's1', toolName: 'fs.create_file', toolArgs: { path: `${testRootNormalized}/b1.txt` }, status: 'PENDING', attempts: 0 },
                { id: 'b2', description: 's2', toolName: 'fs.create_file', toolArgs: { path: `${testRootNormalized}/b2.txt` }, dependsOn: ['b1'], status: 'PENDING', attempts: 0 }
            ], status: 'PLANNED', createdAt: '', updatedAt: ''
        };
        await PlanEngine.execute(planB);
        assert(planB.status === 'SUCCEEDED', 'PlanB should succeed');
        // B2 should have STEP_QUEUED, but wait for B1 to STEP_SUCCEEDED before STEP_READY
        const b1Done = events.findIndex(e => e.stepId === 'b1' && (e.type === 'STEP_COMPLETED' || e.type === 'STEP_SUCCEEDED'));
        const b2Ready = events.findIndex(e => e.stepId === 'b2' && e.type === 'STEP_READY');
        assert(b1Done !== -1 && b2Ready !== -1 && b1Done < b2Ready, 'b2 must become ready only after b1 completes');
        console.log("--- C: Conflicting writes (serialize) ---");
        maxActiveOps = 0;
        const planC = {
            id: 'planC', workflowId: 'wfC', goal: 'Test', steps: [
                { id: 'c1', description: 's1', toolName: 'fs.create_file', toolArgs: { path: `${testRootNormalized}/c1.txt` }, status: 'PENDING', attempts: 0 },
                { id: 'c2', description: 's2', toolName: 'fs.create_file', toolArgs: { path: `${testRootNormalized}/c1.txt` }, status: 'PENDING', attempts: 0 }
            ], status: 'PLANNED', createdAt: '', updatedAt: ''
        };
        await PlanEngine.execute(planC);
        assert(planC.status === 'SUCCEEDED', 'PlanC should succeed');
        assert(maxActiveOps === 1, 'Conflicting writes must serialize, max active ops should be 1');
        console.log("--- S: Parent/child resource conflict ---");
        maxActiveOps = 0;
        const planS = {
            id: 'planS', workflowId: 'wfS', goal: 'Test', steps: [
                { id: 's1', description: 's1', toolName: 'fs.create_folder', toolArgs: { path: `${testRootNormalized}/sub` }, status: 'PENDING', attempts: 0 },
                { id: 's2', description: 's2', toolName: 'fs.create_file', toolArgs: { path: `${testRootNormalized}/sub/file.txt` }, status: 'PENDING', attempts: 0 }
            ], status: 'PLANNED', createdAt: '', updatedAt: ''
        };
        FileOperations.createFolder = async (p) => {
            activeOps++;
            maxActiveOps = Math.max(maxActiveOps, activeOps);
            await new Promise(r => setTimeout(r, 100));
            fs.mkdirSync(p);
            activeOps--;
        };
        await PlanEngine.execute(planS);
        assert(planS.status === 'SUCCEEDED', 'PlanS should succeed');
        assert(maxActiveOps === 1, 'Parent and child writes must serialize');
        console.log("--- E, F, R: Lock release on success/failure ---");
        // Verify ResourceLockManager active locks
        assert(ResourceLockManager.activeLocks.length === 0, 'No leaked locks after successful workflows');
        const planF = {
            id: 'planF', workflowId: 'wfF', goal: 'Test', steps: [
                { id: 'f1', description: 's1', toolName: 'fs.create_file', toolArgs: { path: `invalid_path` }, status: 'PENDING', attempts: 0, maxRetries: 0 } // Will fail scope
            ], status: 'PLANNED', createdAt: '', updatedAt: ''
        };
        await PlanEngine.execute(planF);
        assert(planF.status === 'FAILED', 'PlanF should fail');
        assert(ResourceLockManager.activeLocks.length === 0, 'No leaked locks after failed workflow');
        console.log("--- I, T: Workflow isolation & Simultaneous workflows ---");
        const p1 = {
            id: 'planI1', workflowId: 'wfI1', goal: 'Test', steps: [
                { id: 'i1', description: 's1', toolName: 'fs.create_file', toolArgs: { path: `${testRootNormalized}/i1.txt` }, status: 'PENDING', attempts: 0 }
            ], status: 'PLANNED', createdAt: '', updatedAt: ''
        };
        const p2 = {
            id: 'planI2', workflowId: 'wfI2', goal: 'Test', steps: [
                { id: 'i2', description: 's2', toolName: 'fs.create_file', toolArgs: { path: `${testRootNormalized}/i2.txt` }, status: 'PENDING', attempts: 0 }
            ], status: 'PLANNED', createdAt: '', updatedAt: ''
        };
        await Promise.all([PlanEngine.execute(p1), PlanEngine.execute(p2)]);
        assert(p1.status === 'SUCCEEDED' && p2.status === 'SUCCEEDED', 'Both workflows should succeed');
        console.log("--- M: WAITING_FOR_USER releases lock ---");
        const originalEvaluateWait = PolicyEngine.evaluate;
        PolicyEngine.evaluate = async (ctx) => {
            if (ctx.workflowId === 'wfM') {
                return { decision: 'REQUIRE_APPROVAL', reason: 'mocked' };
            }
            return originalEvaluateWait(ctx);
        };
        const planM = {
            id: 'planM', workflowId: 'wfM', goal: 'Test', steps: [
                { id: 'm1', description: 's1', toolName: 'fs.create_file', toolArgs: { path: `${testRootNormalized}/m1.txt` }, status: 'PENDING', attempts: 0 }
            ], status: 'PLANNED', createdAt: '', updatedAt: ''
        };
        onApprovalRequested = () => {
            // At this exact moment, we are WAITING_FOR_USER
            assert(planM.steps[0].status === 'WAITING', 'Step should be waiting');
            assert(ResourceLockManager.activeLocks.length === 0, 'Locks should be released during WAITING_FOR_USER');
        };
        await PlanEngine.execute(planM);
        assert(planM.status === 'SUCCEEDED', 'PlanM should succeed');
        PolicyEngine.evaluate = originalEvaluateWait;
        onApprovalRequested = null;
        console.log("--- G & L: Cancellation logic ---");
        const planG = {
            id: 'planG', workflowId: 'wfG', goal: 'Test', steps: [
                { id: 'g1', description: 's1', toolName: 'fs.create_file', toolArgs: { path: `${testRootNormalized}/g1.txt` }, status: 'PENDING', attempts: 0 }
            ], status: 'PLANNED', createdAt: '', updatedAt: ''
        };
        PlanEngine.execute(planG);
        await new Promise(r => setTimeout(r, 20)); // let it start
        PlanEngine.cancel(planG);
        await new Promise(r => setTimeout(r, 200)); // wait for execution to end/fail
        assert(planG.status === 'CANCELLED', 'Plan should be cancelled');
        assert(ResourceLockManager.activeLocks.length === 0, 'No leaked locks after cancellation');
        console.log("--- N & O & P & Q: Rollback and Execution Constraints (From 9.8) remain intact ---");
        const { TransactionManager } = await import('./src/lib/ai/transactions/TransactionManager.js');
        // @ts-ignore
        assert(TransactionManager.records.has('wfA'), 'Transactions should still be registered');
        console.log("All 9.9 Scheduler & Lock Tests Passed!");
    }
    finally {
        fs.rmSync(testRoot, { recursive: true, force: true });
        setApprovalHandler(null);
    }
}
runTests().catch(e => {
    console.error("Test failed:", e);
    process.exit(1);
});
