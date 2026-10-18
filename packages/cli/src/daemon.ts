import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import {
  getRegistryDir,
  readIfExists,
  atomicWrite,
  ensureDir,
} from '@schema-memory/core';
import { rm } from 'node:fs/promises';
import { getPlatform } from './platform/index.js';

export interface DaemonState {
  pid: number;
  port: number;
  url: string;
  startedAt: string;
}

export function getDaemonStatePath(registryDir = getRegistryDir()): string {
  return resolve(registryDir, 'ui.json');
}

export async function readDaemonState(
  registryDir = getRegistryDir()
): Promise<DaemonState | null> {
  const file = getDaemonStatePath(registryDir);
  const raw = await readIfExists(file);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.port === 'number' && typeof parsed?.url === 'string') {
      return parsed as DaemonState;
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeDaemonState(
  state: DaemonState,
  registryDir = getRegistryDir()
): Promise<void> {
  await ensureDir(registryDir);
  await atomicWrite(
    getDaemonStatePath(registryDir),
    JSON.stringify(state, null, 2) + '\n'
  );
}

export async function clearDaemonState(
  registryDir = getRegistryDir()
): Promise<void> {
  const file = getDaemonStatePath(registryDir);
  await rm(file, { force: true });
}

export function isProcessAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    // EPERM means the process exists on the system but current process lacks permission to signal it
    return err?.code === 'EPERM';
  }
}

export async function checkServerHealth(
  url: string,
  timeoutMs = 1000
): Promise<boolean> {
  try {
    const res = await fetch(`${url}/healthz`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as any;
    return data?.service === 'schema-memory-server';
  } catch {
    return false;
  }
}

export async function findActiveDaemon(
  registryDir = getRegistryDir()
): Promise<DaemonState | null> {
  const state = await readDaemonState(registryDir);
  if (state) {
    const alive = state.pid > 0 ? isProcessAlive(state.pid) : true;
    const healthy = await checkServerHealth(state.url, 800);
    if (alive && healthy) {
      return state;
    }
    // Stale or dead process -> clean up and return null
    await clearDaemonState(registryDir);
    return null;
  }

  // Fallback check on standard port 4317 only for default registry dir
  if (registryDir === getRegistryDir()) {
    const defaultUrl = 'http://127.0.0.1:4317';
    if (await checkServerHealth(defaultUrl, 800)) {
      return {
        pid: 0,
        port: 4317,
        url: defaultUrl,
        startedAt: '',
      };
    }
  }

  return null;
}

export function openBrowser(targetUrl: string): void {
  getPlatform().openBrowser(targetUrl).catch(() => {});
}

export async function spawnDetached(options: {
  port?: number;
  open?: boolean;
  projectId?: string;
  cliDistPath?: string;
  registryDir?: string;
} = {}): Promise<DaemonState> {
  const currentFile = fileURLToPath(import.meta.url);
  const cliDistPath =
    options.cliDistPath || resolve(dirname(currentFile), '..', 'dist', 'index.js');

  const requestedPort = options.port || 4317;

  // If already running on requested port, reuse it
  const existingOnRequested = await checkServerHealth(
    `http://127.0.0.1:${requestedPort}`,
    400
  );
  if (existingOnRequested) {
    const url = `http://127.0.0.1:${requestedPort}`;
    const state: DaemonState = {
      pid: 0,
      port: requestedPort,
      url,
      startedAt: new Date().toISOString(),
    };
    await writeDaemonState(state, options.registryDir);
    if (options.open !== false) {
      const fullTarget = options.projectId
        ? `${url}/projects/${encodeURIComponent(options.projectId)}`
        : url;
      openBrowser(fullTarget);
    }
    return state;
  }

  const nodeBin = process.execPath;
  const args = [
    cliDistPath,
    'ui',
    '--foreground',
    '-p',
    String(requestedPort),
    '--no-open',
  ];

  const child = spawn(nodeBin, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });

  const pid = child.pid;
  if (!pid) {
    throw new Error('Failed to spawn detached UI daemon process (no PID returned).');
  }

  child.unref();

  // Wait for healthz to respond (poll up to 6 seconds)
  const maxWaitMs = 6000;
  const start = Date.now();
  let healthy = false;
  let healthyPort = requestedPort;

  while (Date.now() - start < maxWaitMs) {
    for (let offset = 0; offset <= 10; offset++) {
      const p = requestedPort + offset;
      if (await checkServerHealth(`http://127.0.0.1:${p}`, 250)) {
        healthy = true;
        healthyPort = p;
        break;
      }
    }
    if (healthy) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!healthy) {
    try {
      process.kill(pid);
    } catch {}
    throw new Error(
      `Daemon process spawned (PID ${pid}) but failed to respond to health check within ${maxWaitMs}ms.`
    );
  }

  const url = `http://127.0.0.1:${healthyPort}`;
  const state: DaemonState = {
    pid,
    port: healthyPort,
    url,
    startedAt: new Date().toISOString(),
  };
  await writeDaemonState(state, options.registryDir);

  if (options.open !== false) {
    const fullTarget = options.projectId
      ? `${url}/projects/${encodeURIComponent(options.projectId)}`
      : url;
    openBrowser(fullTarget);
  }

  return state;
}

export async function stopDaemon(
  registryDir = getRegistryDir()
): Promise<{ stopped: boolean; detail: string; pid?: number }> {
  const active = await findActiveDaemon(registryDir);
  const state = await readDaemonState(registryDir);

  if (!active && !state) {
    return { stopped: false, detail: 'No schema-memory UI is currently running.' };
  }

  const targetPid = active?.pid || state?.pid;
  if (targetPid && targetPid > 0) {
    await getPlatform().stopProcess(targetPid);
  }

  await clearDaemonState(registryDir);

  return {
    stopped: true,
    pid: targetPid,
    detail: targetPid
      ? `Stopped schema-memory UI (PID ${targetPid}).`
      : 'Cleared UI state.',
  };
}

export async function restartDaemon(options: {
  port?: number;
  open?: boolean;
  projectId?: string;
  cliDistPath?: string;
  registryDir?: string;
} = {}): Promise<DaemonState> {
  await stopDaemon(options.registryDir);
  await new Promise((r) => setTimeout(r, 600));
  return await spawnDetached(options);
}
