import { CapabilityRegistry } from './src/lib/ai/capabilities/CapabilityRegistry.js';
import { CapabilityProviderRegistry } from './src/lib/ai/capabilities/CapabilityProviderRegistry.js';
import { FilesystemProvider } from './src/lib/ai/capabilities/providers/FilesystemProvider.js';
import { PolicyEngine } from './src/lib/security/policy/PolicyEngine.js';
import { PolicyStore } from './src/lib/security/policy/PolicyStore.js';
import { TrustedResourceInspector } from './src/lib/security/policy/TrustedResourceInspector.js';
import { ToolExecutor as SecurityToolExecutor } from './src/lib/security/ToolExecutor.js';

import * as fs from 'fs';
import * as path from 'path';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function runTests() {
  console.log("Starting 9.7 Policy Engine Tests...");

  CapabilityProviderRegistry.clear();
  CapabilityRegistry.clear();
  CapabilityProviderRegistry.register(FilesystemProvider);
  PolicyStore.clear();

  const testRoot = fs.mkdtempSync(path.join(process.cwd(), 'rezel_test_policy_'));
  const testRootNormalized = testRoot.replace(/\\/g, '/');
  
  // Set up some mock files for testing
  fs.mkdirSync(path.join(testRoot, 'bulk_dir'));
  for(let i=0; i<15; i++) {
    fs.writeFileSync(path.join(testRoot, 'bulk_dir', `file_${i}.txt`), "data");
  }
  const largeFile = path.join(testRoot, 'large.txt');
  fs.writeFileSync(largeFile, "x".repeat(1000));

  const protectedRoot = path.join(testRoot, 'protected_windows');
  fs.mkdirSync(protectedRoot);

  const activeScopes = [{
    allowedRoots: [testRootNormalized],
    deniedRoots: [protectedRoot.replace(/\\/g, '/')],
    readAllowed: true,
    writeAllowed: true,
    deleteAllowed: true,
    maxAffectedItems: 10,
    maxAffectedBytes: 500,
  }];

  // Mock FileOperations for TrustedResourceInspector
  const { FileOperations } = await import('./src/lib/ai/capabilities/providers/filesystem/FileOperations.js');
  FileOperations.stat = async (p: string) => {
    const s = fs.statSync(p);
    return { isFile: s.isFile(), isDir: s.isDirectory(), size: s.size, modified: s.mtimeMs };
  };
  FileOperations.search = async (p: string) => {
    const files = fs.readdirSync(p);
    return files.map(f => ({ name: f, path: path.join(p, f), isDir: false }));
  };

  try {
    const createContext = (capabilityId: string, args: Record<string, any>) => ({
      capabilityId,
      toolGroup: 'fs',
      args,
      activeScopes
    });

    console.log("--- Contextual Read (A) ---");
    const resA = await PolicyEngine.evaluate(createContext('fs.read_text', { path: path.join(testRoot, 'large.txt') }));
    assert(resA.decision === 'ALLOW', "Read within scope should be allowed");

    console.log("--- Write allowed inside scope (B) ---");
    const resB = await PolicyEngine.evaluate(createContext('fs.create_file', { path: path.join(testRoot, 'new.txt') }));
    assert(resB.decision === 'ALLOW', "Write within scope should be allowed");

    console.log("--- Write outside scope denied (C) ---");
    const resC = await PolicyEngine.evaluate(createContext('fs.create_file', { path: 'C:/Windows/System32/hack.exe' }));
    assert(resC.decision === 'DENY', "Write outside scope should be denied");

    // Create a small file for test D
    const smallFile = path.join(testRoot, 'small.txt');
    fs.writeFileSync(smallFile, "test");

    console.log("--- Delete requires approval (D) ---");
    const resD = await PolicyEngine.evaluate(createContext('fs.delete', { path: smallFile }));
    assert(resD.decision === 'REQUIRE_APPROVAL', "Delete file should require approval");
    assert(resD.approvalContext!.risk === 'HIGH', "Delete risk should be HIGH");

    console.log("--- Protected path denied (E) ---");
    const resE = await PolicyEngine.evaluate(createContext('fs.create_file', { path: path.join(protectedRoot, 'sys.dll') }));
    assert(resE.decision === 'DENY', "Write to protected path should be denied");

    console.log("--- Bulk operation threshold (F) ---");
    // Dir with 15 files > maxAffectedItems 10
    const resF = await PolicyEngine.evaluate(createContext('fs.delete', { path: path.join(testRoot, 'bulk_dir') }));
    assert(resF.decision === 'DENY' || resF.decision === 'REQUIRE_APPROVAL', "Bulk delete exceeding items should be restricted");
    assert(resF.reason.includes('exceeds threshold'), "Should cite item threshold");

    console.log("--- Byte-size threshold (G) ---");
    // largeFile size is 1000 > maxAffectedBytes 500
    // Actually, fs.delete on a single file checks maxAffectedBytes? Yes.
    const resG = await PolicyEngine.evaluate(createContext('fs.delete', { path: largeFile }));
    assert(resG.decision === 'DENY' || resG.decision === 'REQUIRE_APPROVAL', "Delete exceeding bytes should be restricted");
    assert(resG.reason.includes('exceeds threshold'), "Should cite byte threshold");

    console.log("--- LLM metadata rejection (H) ---");
    // Pass fake args pretending it's small
    const resH = await PolicyEngine.evaluate(createContext('fs.delete', { path: path.join(testRoot, 'bulk_dir'), affectedItems: 1, affectedBytes: 1 }));
    assert(resH.reason.includes('15') || resH.reason.includes('threshold'), "Engine must use trusted inspection of 15 items, ignoring fake args");

    console.log("--- Policy integration with SecurityToolExecutor (K, L) ---");
    let executed = false;
    const executeImpl = async () => { executed = true; return "done"; };

    // DENY should block
    const execRes1 = await SecurityToolExecutor.execute('fs', 'fs.create_file', { path: 'C:/Windows/hack.exe' }, '', undefined, executeImpl, { scopes: activeScopes });
    console.log('execRes1:', execRes1, 'executed:', executed);
    assert(!executed, "ToolExecutor must block on DENY");
    assert(execRes1.success === false, "Execution result must be false on DENY");

    console.log("All 9.7 Policy Engine tests passed successfully!");

  } finally {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
}

runTests().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
