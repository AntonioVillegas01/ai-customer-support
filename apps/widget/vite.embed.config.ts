import { defineConfig } from 'vite';

// Host-page loader: a single dependency-free IIFE served as /embed.js.
export default defineConfig({
  define: {
    __WIDGET_APP_URL__: JSON.stringify(process.env.WIDGET_APP_URL ?? 'http://localhost:3002'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/embed/embed.ts',
      name: 'AcsWidget',
      formats: ['iife'],
      fileName: () => 'embed.js',
    },
  },
});
