import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so `dist/` can be served from any sub-path.
  base: './',
  server: { port: 5273, open: false },
  build: {
    target: 'es2019',
    outDir: 'dist',
    assetsInlineLimit: 0,
  },
});
