import { defineConfig } from 'vite';

// Dev server only (`npm run dev`). The production bundle is built by
// scripts/build.mjs (esbuild) into `site/` — see vercel.json / README.
// Entry point: index.html → ./game/playable-map.ts (resolved automatically).
export default defineConfig({
  server: {
    port: 5173,
  },
});
