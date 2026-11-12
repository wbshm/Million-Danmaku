import { defineConfig } from 'vite';

// base './' so the build works from any sub-path (/toy/<slug>/) and from file://.
export default defineConfig({
  base: './',
  build: { assetsInlineLimit: 0, target: 'es2020' },
});
