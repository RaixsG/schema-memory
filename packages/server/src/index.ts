import { serve } from '@hono/node-server';
import { createApp } from './app.js';

export * from './app.js';
export * from './security.js';
export * from './fs-browser.js';
export * from './schemas/projects.js';
export * from './schemas/fs.js';

export function startServer(options: { port?: number; host?: string } = {}): Promise<{
  server: any;
  port: number;
  url: string;
  close: () => Promise<void>;
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

        const close = () =>
          new Promise<void>((closeResolve) => {
            server.close(() => {
              closeResolve();
            });
          });

        resolve({ server, port: info.port, url, close });
      }
    );
  });
}

// Direct execution
if (process.argv[1]?.endsWith('server/dist/index.js')) {
  startServer().then(({ url, close }) => {
    console.log(`schema-memory server listening on ${url}`);

    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}, shutting down gracefully...`);
      await close();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  });
}
