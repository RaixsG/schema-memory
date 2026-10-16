import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serveStatic } from '@hono/node-server/serve-static';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { securityMiddleware } from './security.js';
import { projectsRouter } from './routes/projects.js';
import { fsRouter } from './routes/fs.js';

function findWebDistDir(): string | null {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(currentDir, 'web'),
      resolve(currentDir, '../web'),
      resolve(currentDir, '../../../apps/web/dist'),
      resolve(currentDir, '../../apps/web/dist'),
      resolve(currentDir, '../apps/web/dist'),
      resolve(process.cwd(), 'apps/web/dist'),
    ];
    for (const c of candidates) {
      if (existsSync(resolve(c, 'index.html'))) {
        return c;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function createRouter() {
  return new Hono()
    .get('/healthz', (c) => c.json({ status: 'ok', service: 'schema-memory-server' }))
    .route('/api/projects', projectsRouter)
    .route('/api/fs', fsRouter);
}

export type AppRouter = ReturnType<typeof createRouter>;

export function createApp() {
  const app = new Hono();

  // Central error handler
  app.onError((err, c) => {
    console.error('Unhandled API error:', err);
    return c.json(
      {
        error: err.message || 'Internal server error',
      },
      500
    );
  });

  // Security & CORS
  app.use('*', securityMiddleware);
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return '*';
        if (
          origin.startsWith('http://127.0.0.1') ||
          origin.startsWith('http://localhost')
        ) {
          return origin;
        }
        return null;
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Mount modular route handlers
  app.route('/', createRouter());

  // Static files & SPA fallback for web UI
  const webDist = findWebDistDir();
  if (webDist) {
    app.use('/assets/*', serveStatic({ root: webDist }));
    app.get('*', serveStatic({ path: resolve(webDist, 'index.html') }));
  }

  return app;
}

export type AppInstance = ReturnType<typeof createApp>;
