import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getPlatform, WindowsPlatformAdapter } from '../src/platform/index.js';

describe('WindowsPlatformAdapter', () => {
  const adapter = new WindowsPlatformAdapter();

  it('identifies as windows platform', () => {
    expect(adapter.name).toBe('windows');
    expect(adapter.isWindows).toBe(true);
    expect(getPlatform('win32').name).toBe('windows');
  });

  it('normalizes paths with backslashes and lowercase for Windows comparison', () => {
    expect(adapter.normalizeDirForCompare('C:/Users/Ana/Projects')).toBe('c:\\users\\ana\\projects');
    expect(adapter.normalizeDirForCompare('E:\\dev\\app\\')).toBe('e:\\dev\\app');
  });

  it('accurately tests if a path is within another on Windows drives', () => {
    expect(adapter.isWithinDir('C:\\Users\\Ana\\App\\child', 'C:\\Users\\Ana\\App')).toBe(true);
    expect(adapter.isWithinDir('c:/users/ana/app/child', 'C:\\Users\\Ana\\App')).toBe(true);
    expect(adapter.isWithinDir('E:\\projects\\app', 'C:\\projects\\app')).toBe(false);
  });

  it('checks if directory is on PATH using semicolon separator and case-insensitivity', () => {
    const originalPath = process.env.PATH;
    try {
      process.env.PATH = 'C:\\Windows\\System32;C:\\Users\\Ana\\.local\\bin;D:\\tools';
      expect(adapter.isDirOnPath('c:\\users\\ana\\.local\\bin')).toBe(true);
      expect(adapter.isDirOnPath('C:/Users/Ana/.local/bin')).toBe(true);
      expect(adapter.isDirOnPath('C:\\Other\\Dir')).toBe(false);
    } finally {
      process.env.PATH = originalPath;
    }
  });

  it('formats Windows-specific PATH guidance with PowerShell command', () => {
    const hint = adapter.getPathHint('C:\\Users\\Ana\\.local\\bin');
    expect(hint).toContain('%USERPROFILE%\\.local\\bin');
    expect(hint).toContain('SetEnvironmentVariable');
  });

  it('links CLI using cross-drive aware Windows shims', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'sm-win-adapter-link-'));
    try {
      const binDir = join(tempDir, 'bin');
      const fakeDist = 'E:\\dev\\projects\\schema-memory\\packages\\cli\\dist\\index.js';

      const result = await adapter.linkCli(fakeDist, binDir);
      expect(result.linked).toBe(true);

      const smCmd = await readFile(join(binDir, 'sm.cmd'), 'utf-8');
      const smPs1 = await readFile(join(binDir, 'sm.ps1'), 'utf-8');
      const smSh = await readFile(join(binDir, 'sm'), 'utf-8');

      expect(smCmd).toContain(`"node" "${fakeDist}" %*`);
      expect(smPs1).toContain('$target="E:/dev/projects/schema-memory/packages/cli/dist/index.js"');
      expect(smSh).toContain('exec node "E:/dev/projects/schema-memory/packages/cli/dist/index.js" "$@"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('detects corrupted cross-drive shims during health check and provides fix', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'sm-win-adapter-health-'));
    try {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(tempDir, { recursive: true });

      const corruptedCmd =
        'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "node" "%dp0%\\E:\\dev\\projects\\dist\\index.js" %*';
      await writeFile(join(tempDir, 'sm.cmd'), corruptedCmd, 'utf-8');

      const health = await adapter.checkCliHealth(tempDir, null);
      expect(health.ok).toBe(false);
      expect(health.detail).toContain('Corrupted cross-drive shim detected');
      expect(health.detail).toContain('sm setup --cli-only');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('cleans up .cmd, .ps1, and extensionless shims', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'sm-win-adapter-clean-'));
    try {
      const { existsSync } = await import('node:fs');
      await writeFile(join(tempDir, 'sm.cmd'), 'dummy', 'utf-8');
      await writeFile(join(tempDir, 'sm.ps1'), 'dummy', 'utf-8');
      await writeFile(join(tempDir, 'sm'), 'dummy', 'utf-8');

      await adapter.cleanCli(tempDir);

      expect(existsSync(join(tempDir, 'sm.cmd'))).toBe(false);
      expect(existsSync(join(tempDir, 'sm.ps1'))).toBe(false);
      expect(existsSync(join(tempDir, 'sm'))).toBe(false);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
