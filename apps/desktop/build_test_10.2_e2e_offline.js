import { build } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  await build({
    configFile: false,
    clearScreen: false,
    cacheDir: 'node_modules/.vite-test-cache-102-' + Date.now(),
    resolve: {
      alias: {
        '@tauri-apps/api/core': path.resolve(__dirname, 'mock_tauri_e2e.ts'),
        '@tauri-apps/api/event': path.resolve(__dirname, 'mock_tauri_event.ts')
      }
    },
    build: {
      lib: {
        entry: 'test_10.2_e2e_offline.ts',
        formats: ['es'],
        fileName: () => 'test_10.2_e2e_offline.js',
      },
      rollupOptions: {
        external: ['fs', 'path', 'crypto', 'child_process', 'ws', 'uuid', '@tauri-apps/plugin-fs']
      },
      outDir: 'dist_test',
      target: 'node20',
      minify: false,
    }
  });
}

run().catch(console.error);
