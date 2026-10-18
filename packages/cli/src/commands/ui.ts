import { startServerWithFallback } from '@schema-memory/server';
import {
  findActiveDaemon,
  spawnDetached,
  openBrowser,
  writeDaemonState,
  clearDaemonState,
} from '../daemon.js';

export async function uiCommand(options: {
  port?: string;
  open?: boolean;
  projectId?: string;
  foreground?: boolean;
}): Promise<void> {
  const port = options.port ? parseInt(options.port, 10) : 4317;

  // Foreground execution: run in this process (used by detached daemon or dev mode)
  if (options.foreground) {
    const { url, port: actualPort, close } = await startServerWithFallback({ port });
    const target = options.projectId
      ? `${url}/projects/${encodeURIComponent(options.projectId)}`
      : url;

    await writeDaemonState({
      pid: process.pid,
      port: actualPort,
      url,
      startedAt: new Date().toISOString(),
    });

    const cleanup = async () => {
      await clearDaemonState();
      await close();
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    console.log(`\n🚀 schema-memory UI running at: ${target}`);
    console.log(`Press Ctrl+C to stop.\n`);

    if (options.open !== false) {
      openBrowser(target);
    }
    return;
  }

  // Default execution: check if active, reuse or spawn background daemon
  const active = await findActiveDaemon();
  if (active) {
    const target = options.projectId
      ? `${active.url}/projects/${encodeURIComponent(options.projectId)}`
      : active.url;
    console.log(`\n🚀 schema-memory UI is already running at: ${target}`);
    if (options.open !== false) {
      openBrowser(target);
    }
    return;
  }

  console.log('\n🚀 Starting schema-memory UI daemon in background...');
  const state = await spawnDetached({
    port,
    open: options.open,
    projectId: options.projectId,
  });

  const target = options.projectId
    ? `${state.url}/projects/${encodeURIComponent(options.projectId)}`
    : state.url;

  console.log(`✅ schema-memory UI is ready at: ${target} (PID ${state.pid})`);
  console.log('   Run "sm stop" to stop or "sm status" to inspect.\n');
}
