import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile, lstat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getPlatform,
  DarwinPlatformAdapter,
  LinuxPlatformAdapter,
} from '../src/platform/index.js';

describe('POSIX Platform Adapters (Darwin & Linux)', () => {
  const darwinAdapter = new DarwinPlatformAdapter();
  const linuxAdapter = new LinuxPlatformAdapter();

  it('identifies platform names accurately', () => {
    expect(darwinAdapter.name).toBe('darwin');
    expect(darwinAdapter.isWindows).toBe(false);
    expect(getPlatform('darwin').name).toBe('darwin');

    expect(linuxAdapter.name).toBe('linux');
    expect(linuxAdapter.isWindows).toBe(false);
    expect(getPlatform('linux').name).toBe('linux');
  });

  it('provides OS-specific shell profile guidance for PATH', () => {
    const darwinHint = darwinAdapter.getPathHint('/Users/ana/.local/bin');
    expect(darwinHint).toContain('.zshrc');
    expect(darwinHint).toContain('export PATH=\\"/Users/ana/.local/bin:$PATH\\"');

    const linuxHint = linuxAdapter.getPathHint('/home/ana/.local/bin');
    expect(linuxHint).toContain('.bashrc');
    expect(linuxHint).toContain('export PATH=\\"/home/ana/.local/bin:$PATH\\"');
  });

  it('normalizes paths and checks contains using POSIX semantics', () => {
    expect(darwinAdapter.normalizeDirForCompare('/Users/Ana/app/')).toBe('/Users/Ana/app');
    expect(darwinAdapter.isWithinDir('/Users/Ana/app/child', '/Users/Ana/app')).toBe(true);
    // Case sensitivity in POSIX
    expect(darwinAdapter.isWithinDir('/users/ana/app/child', '/Users/Ana/app')).toBe(false);
  });

  it('checks if directory is on PATH using colon separator', () => {
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = '/usr/bin:/bin:/Users/ana/.local/bin:/usr/local/bin';
      expect(darwinAdapter.isDirOnPath('/Users/ana/.local/bin')).toBe(true);
      expect(darwinAdapter.isDirOnPath('/var/run')).toBe(false);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it('links CLI using chmod and symlinks', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'sm-posix-adapter-link-'));
    try {
      const binDir = join(tempDir, 'bin');
      const fakeDist = join(tempDir, 'fake-cli.js');
      await writeFile(fakeDist, '#!/usr/bin/env node\nconsole.log("ok");', 'utf-8');

      const result = await darwinAdapter.linkCli(fakeDist, binDir, { force: true });
      expect(result.linked).toBe(true);

      const smStat = await lstat(join(binDir, 'sm'));
      expect(smStat.isSymbolicLink()).toBe(true);

      const schemaMemoryStat = await lstat(join(binDir, 'schema-memory'));
      expect(schemaMemoryStat.isSymbolicLink()).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('cleans up symlinks during cleanCli', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'sm-posix-adapter-clean-'));
    try {
      const { existsSync } = await import('node:fs');
      await writeFile(join(tempDir, 'sm'), 'dummy', 'utf-8');
      await writeFile(join(tempDir, 'schema-memory'), 'dummy', 'utf-8');

      await darwinAdapter.cleanCli(tempDir);

      expect(existsSync(join(tempDir, 'sm'))).toBe(false);
      expect(existsSync(join(tempDir, 'schema-memory'))).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
