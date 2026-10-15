import { serve } from '@hono/node-server';
import { createApp } from './app.js';

export * from './app.js';
export * from './security.js';
export * from './fs-browser.js';

export function startServer(options: { port?: number; host?: string } = {}): Promise<{
  server: any;
  port: number;
  url: string;
}> {
  const port = options.port || 4317;
  const host = options.host || '127.0.0.1';
  const app = createApp();

  return new Promise((resolve) => {
    const server = serve(
      {
        fetch: app.fetch,
        port,
        hostname: host,
      },
      (info) => {
        const url = `http://${host}:${info.port}`;
        resolve({ server, port: info.port, url });
      }
    );
  });
}

// Direct execution
if (process.argv[1]?.endsWith('server/dist/index.js')) {
  startServer().then(({ url }) => {
    console.log(`schema-memory server listening on ${url}`);
  });
}
