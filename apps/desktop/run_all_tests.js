import { build } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const tests = [
  '9.4', '9.5', '9.6', '9.7', '9.8', '9.9',
  '10.0', '10.1', '10.2', '10.2c', '10.2e', '10.2_e2e_offline', '10.3a', '10.4a', '10.5', '10.6', '10R', '10.7', '10.8', '10.9', '10.10'
];

async function runTests() {
  for (const test of tests) {
    console.log(`\n========================================`);
    console.log(`Building and running test_${test}`);
    console.log(`========================================\n`);

    try {
      await build({
        root: __dirname,
        build: {
          outDir: 'dist_test',
          lib: {
            entry: path.resolve(__dirname, `test_${test}.ts`),
            formats: ['es'],
            fileName: () => `test_${test}.js`
          },
          rollupOptions: {
            external: [
              'fs', 'path', 'crypto', 'events', 'url', 'child_process', 'ws'
            ]
          },
          emptyOutDir: false, // Don't clear between tests if we share chunks
        },
        resolve: {
          alias: {
            '@tauri-apps/api/core': path.resolve(__dirname, test.includes('e2e_offline') ? 'mock_tauri_e2e.ts' : 'mock_tauri_core.ts'),
            '@tauri-apps/api/event': path.resolve(__dirname, 'mock_tauri_event.ts')
          }
        },
        logLevel: 'error'
      });
      
      await new Promise((resolve, reject) => {
        const p = spawn('node', [`dist_test/test_${test}.js`], { stdio: 'inherit' });
        p.on('close', code => {
          if (code === 0) resolve(null);
          else reject(new Error(`Test ${test} failed with code ${code}`));
        });
        p.on('error', reject);
      });
      
    } catch (e) {
      console.error(`\nTest ${test} failed!`, e);
      process.exit(1);
    }
  }
  
  console.log("\nALL TESTS PASSED!\n");
}

runTests();
