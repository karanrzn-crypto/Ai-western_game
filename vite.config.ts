import { defineConfig } from 'vite';
import { resolve } from 'path';

// Vite config for the visual demo of SceneStateManager.
// The actual library source lives in /src and is consumed directly via TS.
export default defineConfig({
  root: 'demo',
  server: {
    port: 5173,
    open: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: '../dist-demo',
    emptyOutDir: true,
  },
});
