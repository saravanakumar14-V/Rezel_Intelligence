import { build } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  await build({
    configFile: false,
    clearScreen: false,
    cacheDir: 'node_modules/.vite-test-cache-102c-' + Date.now(),
    resolve: {
      alias: {
        '@tauri-apps/api/core': path.resolve(__dirname, 'mock_tauri_core.ts'),
        '@tauri-apps/api/event': path.resolve(__dirname, 'mock_tauri_event.ts')
      }
    },
    build: {
      lib: {
        entry: 'test_10.2c.ts',
        formats: ['es'],
        fileName: () => 'test_10.2c.js',
      },
      rollupOptions: {
        external: ['fs', 'path', 'crypto', '@tauri-apps/plugin-fs']
      },
      outDir: 'dist_test',
      target: 'node20',
      minify: false,
    }
  });
}

run().catch(console.error);
