import { build } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
      entry: path.resolve(__dirname, 'test_11.1_blender_identity.ts'),
      formats: ['es'],
      fileName: () => 'test_11.1_blender_identity.js',
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
