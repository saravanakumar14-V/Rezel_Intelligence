import { defineConfig } from 'vite';
export default defineConfig({
  build: {
    lib: {
      entry: 'test_9.8.ts',
      name: 'TestSuite',
      fileName: 'test',
      formats: ['cjs']
    },
    outDir: 'temp_test_out',
    rollupOptions: {
      external: ['crypto', 'path', 'fs', 'os', 'events', '@tauri-apps/api', '@tauri-apps/api/core', '@tauri-apps/api/event']
    },
    emptyOutDir: true,
    minify: false
  }
});
