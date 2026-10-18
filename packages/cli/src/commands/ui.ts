import { startServer } from '@schema-memory/server';
import { exec } from 'node:child_process';

export async function uiCommand(options: {
  port?: string;
  open?: boolean;
  projectId?: string;
}): Promise<void> {
  const port = options.port ? parseInt(options.port, 10) : 4317;
  const { url } = await startServer({ port });
  const target = options.projectId
    ? `${url}/projects/${encodeURIComponent(options.projectId)}`
    : url;

  console.log(`\n🚀 schema-memory UI running at: ${target}`);
  console.log(`Press Ctrl+C to stop.\n`);

  if (options.open !== false) {
    const startCmd =
      process.platform === 'darwin'
        ? 'open'
        : process.platform === 'win32'
          ? 'start'
          : 'xdg-open';
    exec(`${startCmd} ${target}`);
  }
}
