import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transformWithEsbuild } from 'vite';
import { defineConfig, type Plugin } from 'vitest/config';

const WIDGET_APP_URL = process.env.WIDGET_APP_URL ?? 'http://localhost:3002';

/**
 * Dev-only middleware: serves /embed.js (production artifact of
 * vite.embed.config.ts) by transpiling src/embed/embed.ts on the fly, so host
 * pages can use the same one-line embed snippet against the dev server.
 */
function devEmbedLoader(): Plugin {
  return {
    name: 'acs-dev-embed-loader',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/embed.js', (req, res, next) => {
        void (async () => {
          try {
            const entry = fileURLToPath(new URL('./src/embed/embed.ts', import.meta.url));
            const source = await readFile(entry, 'utf8');
            const result = await transformWithEsbuild(source, entry, {
              loader: 'ts',
              format: 'iife',
              define: { __WIDGET_APP_URL__: JSON.stringify(WIDGET_APP_URL) },
            });
            res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            res.end(result.code);
          } catch (error) {
            next(error);
          }
        })();
      });
    },
  };
}

// Iframe chat application build (dist/index.html + assets).
export default defineConfig({
  plugins: [devEmbedLoader()],
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
