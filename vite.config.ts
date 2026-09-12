import { defineConfig } from 'vite';
import { resolve } from 'path';

// Standard Vite layout: index.html at project root, entry script at ./demo/main.ts.
// The library source lives in /src and is consumed directly via TS source.
//
// Vercel auto-detects Vite and runs `vite build`, output to `dist/`.
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Three.js + OrbitControls examples module pulls in a lot of small
    // chunks. Keep sourcemaps off in production for a leaner deploy.
    sourcemap: false,
  },
  server: {
    port: 5173,
    open: true,
  },
});
