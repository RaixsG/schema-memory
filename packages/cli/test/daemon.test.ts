import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  readDaemonState,
  writeDaemonState,
  clearDaemonState,
  isProcessAlive,
  findActiveDaemon,
  stopDaemon,
  type DaemonState,
} from '../src/daemon.js';
import { startServer, startServerWithFallback } from '@schema-memory/server';

describe('Daemon Management (ui.json, process liveness, stop & fallback)', () => {
  it('writes, reads, and clears daemon state in ui.json', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'sm-daemon-test-'));
    try {
      expect(await readDaemonState(tempDir)).toBeNull();

      const state: DaemonState = {
        pid: 12345,
        port: 4317,
        url: 'http://127.0.0.1:4317',
        startedAt: new Date().toISOString(),
      };

      await writeDaemonState(state, tempDir);
      const read = await readDaemonState(tempDir);
      expect(read).toEqual(state);

      await clearDaemonState(tempDir);
      expect(await readDaemonState(tempDir)).toBeNull();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('handles corrupted ui.json gracefully', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'sm-daemon-corrupt-'));
    try {
      await mkdir(tempDir, { recursive: true });
      await writeFile(join(tempDir, 'ui.json'), '{ invalid json', 'utf-8');

      expect(await readDaemonState(tempDir)).toBeNull();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('correctly checks process liveness with isProcessAlive', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
    expect(isProcessAlive(0)).toBe(false);
    expect(isProcessAlive(-1)).toBe(false);
    expect(isProcessAlive(99999999)).toBe(false);
  });

  it('clears stale dead daemon state on findActiveDaemon', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'sm-daemon-stale-'));
    try {
      const staleState: DaemonState = {
        pid: 99999999, // definitely dead PID
        port: 59999,
        url: 'http://127.0.0.1:59999',
        startedAt: new Date().toISOString(),
      };
      await writeDaemonState(staleState, tempDir);

      const active = await findActiveDaemon(tempDir);
      // Stale state should be pruned
      expect(active).toBeNull();
      expect(await readDaemonState(tempDir)).toBeNull();
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('stopDaemon returns stopped: false when no daemon is active', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'sm-daemon-empty-'));
    try {
      const result = await stopDaemon(tempDir);
      expect(result.stopped).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('startServerWithFallback binds to an available port', async () => {
    const testPort = 4455;
    const first = await startServer({ port: testPort });
    try {
      expect(first.port).toBe(testPort);

      // Attempt to bind on the same port with fallback enabled -> should increment port
      const second = await startServerWithFallback({ port: testPort });
      try {
        expect(second.port).toBe(testPort + 1);
      } finally {
        await second.close();
      }
    } finally {
      await first.close();
    }
  });
});
