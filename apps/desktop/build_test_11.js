import { build } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testName = process.argv[2];

if (!testName || !/^test_11(?:\.0_b[1-9]|\.1_(?:mutation_truth|blender_identity)|R)$/.test(testName)) {
  throw new Error('Usage: node build_test_11.js test_11.0_b1|...|test_11.1_mutation_truth|test_11.1_blender_identity|test_11R');
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
      external: ['fs', 'path', 'crypto', 'events', 'url', 'child_process', 'ws'],
    },
    outDir: 'dist_test',
    emptyOutDir: false,
    target: 'node20',
    minify: false,
  },
});
