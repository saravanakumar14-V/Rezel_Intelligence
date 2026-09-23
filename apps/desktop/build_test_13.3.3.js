import { build } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  await build({
    configFile: false,
    clearScreen: false,
    resolve: {
      alias: {
        '@tauri-apps/api/core': path.resolve(__dirname, 'mock_tauri_core.ts'),
        '@tauri-apps/api/event': path.resolve(__dirname, 'mock_tauri_event.ts'),
      },
    },
    build: {
      lib: {
        entry: path.resolve(__dirname, 'test_13.3.3_adobe_layer_operations.ts'),
        formats: ['es'],
        fileName: () => 'test_13.3.3_adobe_layer_operations.js',
      },
      rollupOptions: {
        external: ['fs', 'path', 'crypto', 'events', 'url', 'child_process', 'ws'],
      },
      outDir: 'dist_test',
      emptyOutDir: false,
      target: 'node20',
      minify: false,
    },
  });
}

run().catch(console.error);
