import { defineConfig } from 'vite';

// Relative asset paths so the built game runs from any folder or host
// (e.g. the hosted artifact link).
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 2000 },
});
