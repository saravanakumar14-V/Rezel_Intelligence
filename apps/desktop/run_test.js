import { build } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testName = process.argv[2];

if (!testName) {
  throw new Error('Usage: node run_test.js <test_name_without_extension>');
}

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
      entry: path.resolve(__dirname, `${testName}.ts`),
      formats: ['es'],
      fileName: () => `${testName}.js`,
    },
    rollupOptions: {
      external: ['fs', 'path', 'crypto', 'events', 'url', 'child_process', 'ws', 'os', 'stream', 'util', 'buffer', 'assert'],
    },
    outDir: 'dist_test',
    emptyOutDir: false,
    target: 'node20',
    minify: false,
  },
});
