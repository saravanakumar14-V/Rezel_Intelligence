import { CapabilityRegistry } from './src/lib/ai/capabilities/CapabilityRegistry.js';
import { CapabilityProviderRegistry } from './src/lib/ai/capabilities/CapabilityProviderRegistry.js';
import { FilesystemProvider } from './src/lib/ai/capabilities/providers/FilesystemProvider.js';
import { PathGuard } from './src/lib/ai/capabilities/providers/filesystem/PathGuard.js';
import { AIToolExecutor } from './src/lib/ai/ToolExecutor.js';
import { ToolExecutor as SecurityToolExecutor } from './src/lib/security/ToolExecutor.js';

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log("Starting 9.6 Filesystem Automation Foundation Tests...");

  // Register Provider
  CapabilityProviderRegistry.clear();
  CapabilityRegistry.clear();
  CapabilityProviderRegistry.register(FilesystemProvider);

  // A. Provider registration & B. Discovery
  console.log("--- Test A & B: Capability Registration ---");
  const fsList = CapabilityRegistry.get('fs.list');
  const fsDelete = CapabilityRegistry.get('fs.delete');
  const fsCreateFile = CapabilityRegistry.get('fs.create_file');

  assert(!!fsList, "fs.list must be registered");
  assert(!!fsDelete, "fs.delete must be registered");
  assert(!!fsCreateFile, "fs.create_file must be registered");

  // R. LLM cannot change risk
  assert(fsList!.riskLevel === 'LOW', "fs.list risk must be LOW");
  assert(fsDelete!.riskLevel === 'HIGH', "fs.delete risk must be HIGH");

  // S. LLM cannot change retry policy
  assert(fsList!.retryPolicy === 'AUTO', "fs.list retry must be AUTO");
  assert(fsDelete!.retryPolicy === 'NEVER', "fs.delete retry must be NEVER");

  // Setup Real Filesystem Integration Test
  console.log("--- Real Filesystem Integration & Mock Setup ---");
  const testRoot = fs.mkdtempSync(path.join(process.cwd(), 'rezel_test_'));
  const testRootNormalized = testRoot.replace(/\\/g, '/');

  // Mock PathGuard to return our test scope
  PathGuard.getRustScope = async () => ({
    allowed_roots: [testRootNormalized],
    read_allowed: true,
    write_allowed: true,
    delete_allowed: true,
  });

  // Mock Tauri invoke to use Node fs for real integration testing of the provider logic
  const originalExecute = SecurityToolExecutor.execute;
  (SecurityToolExecutor as any).execute = async (tool: string, action: string, args: any, cmd: string, cb: any, executeImpl: any) => {
    
    // Simulate Tauri invocation if executeImpl is not provided (which FileOperations does, it calls invoke directly).
    // Wait, FilesystemProvider uses FileOperations which calls `invoke`. So AIToolExecutor will call SecurityToolExecutor with executeImpl wrapping `invoke`.
    if (executeImpl) {
      try {
        const raw = await executeImpl();
        return { success: true, output: typeof raw === 'string' ? raw : JSON.stringify(raw) };
      } catch (err: any) {
        return { success: false, error: err.message || String(err) };
      }
    }
    return { success: false, error: "Mocked Tauri IPC requires executeImpl or manual routing" };
  };

  // Mock `@tauri-apps/api/core` invoke
  // Since we are bundling, we can intercept FileOperations manually, or we can mock invoke globally if possible.
  // Actually, FileOperations is imported, we can't easily mock `invoke` if it's already resolved. 
  // Let's just mock FileOperations directly for the Node FS integration.
  const { FileOperations } = await import('./src/lib/ai/capabilities/providers/filesystem/FileOperations.js');
  
  FileOperations.list = async (p: string) => {
    const entries = fs.readdirSync(p, { withFileTypes: true });
    return entries.map(e => ({ name: e.name, path: path.join(p, e.name), isDir: e.isDirectory() }));
  };
  FileOperations.stat = async (p: string) => {
    const s = fs.statSync(p);
    return { isFile: s.isFile(), isDir: s.isDirectory(), size: s.size, modified: s.mtimeMs };
  };
  FileOperations.readText = async (p: string) => fs.readFileSync(p, 'utf-8');
  FileOperations.createFolder = async (p: string) => { fs.mkdirSync(p, { recursive: true }); };
  FileOperations.createFile = async (p: string) => { 
    if (fs.existsSync(p)) throw new Error("File already exists");
    fs.writeFileSync(p, ""); 
  };
  FileOperations.copy = async (s: string, d: string) => { fs.copyFileSync(s, d); };
  FileOperations.move = async (s: string, d: string) => { fs.renameSync(s, d); };
  FileOperations.deleteFile = async (p: string) => { 
    if (fs.statSync(p).isDirectory()) throw new Error("Cannot delete directory");
    fs.unlinkSync(p); 
  };
  FileOperations.search = async (p: string, pattern: string) => {
    const results = [];
    const files = fs.readdirSync(p);
    for (const file of files) {
      if (file.toLowerCase().includes(pattern.toLowerCase())) {
        results.push({ name: file, path: path.join(p, file), isDir: false });
      }
    }
    return results;
  };

  try {
    const context = { workflowId: 'w1', executionId: 'e1', scopes: [], metadata: {} };

    console.log("--- PathGuard Scope Rejection Tests ---");
    // L, M. Path traversal and outside scope rejection
    let traversalCaught = false;
    try { await fsCreateFile!.execute({ path: path.join(testRoot, '../escaped.txt') }, context); }
    catch (e: any) { traversalCaught = e.message.includes("escapes authorized filesystem scope") || e.message.includes("Path traversal (..)"); }
    assert(traversalCaught, "Path traversal must be rejected by PathGuard");

    // G & H: Create Folder and File
    console.log("--- Mutation Tests (Create) ---");
    const testFolder = path.join(testRoot, "my_folder");
    const testFile = path.join(testRoot, "my_file.txt");
    
    await fsCreateFile!.execute({ path: testFile }, context);
    assert(fs.existsSync(testFile), "File must be created on real filesystem");

    // Overwrite protection
    let overwriteCaught = false;
    try { await fsCreateFile!.execute({ path: testFile }, context); }
    catch (e) { overwriteCaught = true; }
    assert(overwriteCaught, "Overwrite must be protected");

    // C, D: Read operations
    console.log("--- Read Tests ---");
    const statResult = await fsList!.execute({ path: testRoot }, context);
    assert(Array.isArray(statResult) && statResult.length === 1, "fs.list must return the created file");

    // I, J: Copy and Move
    console.log("--- Move/Copy Tests ---");
    const copiedFile = path.join(testRoot, "copied.txt");
    await CapabilityRegistry.get('fs.copy')!.execute({ source: testFile, destination: copiedFile }, context);
    assert(fs.existsSync(copiedFile), "Copied file must exist");

    const movedFile = path.join(testRoot, "moved.txt");
    await CapabilityRegistry.get('fs.move')!.execute({ source: copiedFile, destination: movedFile }, context);
    assert(!fs.existsSync(copiedFile), "Source file must be gone after move");
    assert(fs.existsSync(movedFile), "Destination file must exist after move");

    // P, Q: Dual Path Validation
    console.log("--- Dual Path Validation Tests ---");
    let escapeMoveCaught = false;
    try { await CapabilityRegistry.get('fs.move')!.execute({ source: testFile, destination: "C:/Windows/System32/hack.txt" }, context); }
    catch(e) { escapeMoveCaught = true; }
    assert(escapeMoveCaught, "Destination path escape must be caught");

    let escapeCopyCaught = false;
    try { await CapabilityRegistry.get('fs.copy')!.execute({ source: "C:/Windows/win.ini", destination: path.join(testRoot, "hack.txt") }, context); }
    catch(e) { escapeCopyCaught = true; }
    assert(escapeCopyCaught, "Source path escape must be caught");

    // K: Delete
    console.log("--- Delete Tests ---");
    await fsDelete!.execute({ path: movedFile }, context);
    assert(!fs.existsSync(movedFile), "File must be deleted");

    // AA: Verification Failure
    console.log("--- Verification Failure Test ---");
    const verifyMove = CapabilityRegistry.get('fs.move')!.verify!;
    const vfResult = await verifyMove({ source: testFile, destination: "C:/imaginary.txt" }, null, context);
    assert(vfResult === 'FAILED' || vfResult === 'UNKNOWN', "Verification failure must be caught");

  } finally {
    (SecurityToolExecutor as any).execute = originalExecute;
    fs.rmSync(testRoot, { recursive: true, force: true });
  }

  console.log("All 9.6 tests passed successfully!");
}

runTests().catch(e => {
  console.error("Test failed:", e);
  process.exit(1);
});
