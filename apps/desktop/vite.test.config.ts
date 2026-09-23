import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'test_9.5.ts',
      formats: ['es'],
      fileName: 'test_9.5_out'
    },
    rollupOptions: {
      // Treat tauri as external so it doesn't try to bundle it
      external: [/^@tauri-apps/]
    },
    target: 'esnext',
    emptyOutDir: false
  }
});
