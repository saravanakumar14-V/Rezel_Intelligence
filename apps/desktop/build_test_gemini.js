import { build } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  await build({
    configFile: false,
    clearScreen: false,
    cacheDir: 'node_modules/.vite-test-cache-10-0-' + Date.now(),
    resolve: {
      alias: {
        '@tauri-apps/api/core': path.resolve(__dirname, 'mock_tauri_core.ts')
      }
    },
    build: {
      lib: {
        entry: 'test_gemini.ts',
        formats: ['es'],
        fileName: () => 'test_gemini.js',
      },
      rollupOptions: {
        external: ['fs', 'path', 'crypto']
      },
      outDir: 'dist_test',
      target: 'node20',
      minify: false,
    }
  });
}

run().catch(console.error);
