import { defineConfig } from 'vitest/config';

// Iframe chat application build (dist/index.html + assets).
export default defineConfig({
  define: {
    __API_URL__: JSON.stringify(process.env.WIDGET_API_URL ?? 'http://localhost:3001'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
