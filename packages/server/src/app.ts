import { Hono, MiddlewareHandler } from 'hono';
import { cors } from 'hono/cors';
import { compress } from 'hono/compress';
import { serveStatic } from '@hono/node-server/serve-static';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { gunzipBuffer, isGzipPayload } from '@schema-memory/core';
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

/**
 * Middleware that transparently decompresses `Content-Encoding: gzip` request bodies
 * (inspired by Anthropic's request-body gzip optimization for large JSON/schema payloads).
 */
export const gunzipRequestMiddleware: MiddlewareHandler = async (c, next) => {
  const encoding = c.req.header('Content-Encoding')?.toLowerCase();
  if (encoding === 'gzip') {
    try {
      const rawBuffer = Buffer.from(await c.req.raw.arrayBuffer());
      const decompressed = isGzipPayload(rawBuffer)
        ? gunzipBuffer(rawBuffer)
        : rawBuffer;

      const headers = new Headers(c.req.raw.headers);
      headers.delete('content-encoding');
      headers.set('content-length', String(decompressed.byteLength));

      c.req.raw = new Request(c.req.raw.url, {
        method: c.req.raw.method,
        headers,
        body: new Uint8Array(decompressed),
      });
    } catch {
      return c.json({ error: 'Invalid gzip request body' }, 400);
    }
  }
  await next();
};

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
      allowHeaders: ['Content-Type', 'Content-Encoding', 'If-None-Match', 'Authorization'],
      exposeHeaders: ['ETag', 'Content-Encoding'],
    })
  );

  // Decompress incoming gzip request bodies
  app.use('/api/*', gunzipRequestMiddleware);

  // Compress outgoing HTTP responses (skipping SSE /events streams)
  const gzipResponseMiddleware = compress({ threshold: 512 });
  app.use('*', async (c, next) => {
    if (c.req.path.endsWith('/events')) {
      await next();
      return;
    }
    return gzipResponseMiddleware(c, next);
  });

  // Mount modular route handlers
  app.route('/', createRouter());

  // Static files & SPA fallback for web UI
  const webDist = findWebDistDir();
  if (webDist) {
    app.use('/assets/*', async (c, next) => {
      await next();
      if (c.res.status === 200) {
        c.header('Cache-Control', 'public, max-age=31536000, immutable');
      }
    });
    app.use('/assets/*', serveStatic({ root: webDist }));
    app.get('*', serveStatic({ path: resolve(webDist, 'index.html') }));
  }

  return app;
}

export type AppInstance = ReturnType<typeof createApp>;
