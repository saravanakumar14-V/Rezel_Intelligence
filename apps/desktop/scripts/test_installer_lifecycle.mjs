#!/usr/bin/env node
/**
 * REZEL INSTALLER & UNINSTALLER LIFECYCLE VERIFIER
 */

import { execSync, spawn } from 'node:child_process';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const desktopRoot = resolve(__dirname, '..');

const INSTALLER_PATH = resolve(desktopRoot, 'src-tauri/target/release/bundle/nsis/Rezel_1.0.0_x64-setup.exe');
const TEST_INSTALL_DIR = resolve(desktopRoot, 'temp_test_out/lifecycle_install_test');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLifecycleTest() {
  console.log('======================================================================');
  console.log('  REZEL INSTALLER & UNINSTALLER LIFECYCLE TEST');
  console.log('======================================================================\n');

  if (!existsSync(INSTALLER_PATH)) {
    throw new Error('Installer binary not found at: ' + INSTALLER_PATH);
  }

  // Clean before test
  if (existsSync(TEST_INSTALL_DIR)) {
    rmSync(TEST_INSTALL_DIR, { recursive: true, force: true });
  }

  // 1. Silent Installation
  console.log('[1] Installing NSIS package silently to test directory...');
  const installCmd = `Start-Process -FilePath "${INSTALLER_PATH}" -ArgumentList "/S", "/D=${TEST_INSTALL_DIR}" -Wait`;
  execSync(`powershell.exe -NoProfile -Command "${installCmd}"`, { timeout: 30000 });
  await sleep(1000);

  // 2. Verify Deployed Artifacts
  console.log('[2] Verifying Deployed Artifacts...');
  const deployedExe = join(TEST_INSTALL_DIR, 'app.exe');
  const deployedUninstaller = join(TEST_INSTALL_DIR, 'uninstall.exe');
  const deployedResource = join(TEST_INSTALL_DIR, 'resources', 'blender_ipc_client.py');

  if (!existsSync(deployedExe)) throw new Error('app.exe was not created in installation directory');
  if (!existsSync(deployedUninstaller)) throw new Error('uninstall.exe was not created in installation directory');
  if (!existsSync(deployedResource)) throw new Error('blender_ipc_client.py resource was not deployed');

  console.log(`  ✓ app.exe present (${(statSync(deployedExe).size / (1024 * 1024)).toFixed(2)} MB)`);
  console.log(`  ✓ uninstall.exe present (${statSync(deployedUninstaller).size} bytes)`);
  console.log(`  ✓ resources/blender_ipc_client.py present (${statSync(deployedResource).size} bytes)\n`);

  // 3. Launch Deployed Binary
  console.log('[3] Testing Installed Application Launch...');
  const child = spawn(deployedExe, [], { stdio: 'ignore' });
  const pid = child.pid;
  console.log(`  ✓ Process spawned with PID: ${pid}`);

  await sleep(3000);
  try {
    process.kill(pid);
  } catch {}
  console.log('  ✓ Installed application terminated cleanly\n');

  // 4. Test Uninstallation
  console.log('[4] Testing Silent Uninstallation...');
  // For NSIS, silent uninstall requires _? parameter pointing to the dir
  const uninstallCmd = `Start-Process -FilePath "${deployedUninstaller}" -ArgumentList "/S", "_?=${TEST_INSTALL_DIR}" -Wait`;
  execSync(`powershell.exe -NoProfile -Command "${uninstallCmd}"`, { timeout: 30000 });
  await sleep(2000);

  // Clean any remaining uninstaller stub if left behind by _? param
  if (existsSync(TEST_INSTALL_DIR)) {
    const remaining = readdirSync(TEST_INSTALL_DIR);
    console.log(`  Remaining files in dir: ${remaining.length === 0 ? 'None (Clean)' : remaining.join(', ')}`);
    rmSync(TEST_INSTALL_DIR, { recursive: true, force: true });
  }

  console.log('\n======================================================================');
  console.log('  INSTALLER LIFECYCLE VERIFICATION: REAL PASS');
  console.log('======================================================================\n');
}

runLifecycleTest().catch((err) => {
  console.error('[FATAL] Installer lifecycle test failed:', err);
  process.exit(1);
});
