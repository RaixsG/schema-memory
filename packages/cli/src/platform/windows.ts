import { win32, resolve } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { readFile, rm, mkdir } from 'node:fs/promises';
import { spawn, spawnSync, execSync } from 'node:child_process';
import type {
  PlatformAdapter,
  LinkCliResult,
  CliHealthResult,
  EphemeralRunner,
} from './types.js';
import {
  createWindowsShim,
  isCorruptedShimContent,
} from './windows-shim.js';

export class WindowsPlatformAdapter implements PlatformAdapter {
  readonly name = 'windows' as const;
  readonly isWindows = true;

  getBinDir(): string {
    const userProfile = process.env.USERPROFILE || homedir();
    return resolve(userProfile, '.local', 'bin');
  }

  isDirOnPath(dir: string): boolean {
    const pathEnv = process.env.PATH || '';
    const target = this.normalizeDirForCompare(dir);
    const entries = pathEnv
      .split(';')
      .map((entry) => entry.trim().replace(/^"|"$/g, ''))
      .filter(Boolean);
    return entries.some((entry) => this.normalizeDirForCompare(entry) === target);
  }

  findCommandOnPath(name: string): string | null {
    try {
      const res = spawnSync('where', [name], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        shell: true,
      });
      if (res.status === 0 && res.stdout) {
        const line = res.stdout.split(/\r?\n/)[0].trim();
        return line.length > 0 ? line : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  normalizeDirForCompare(dir: string): string {
    // Semantic comparisons always use Windows rules, even when this adapter is
    // exercised from a POSIX test runner.
    let normalized = win32.normalize(dir);
    if (normalized.endsWith(win32.sep) && normalized.length > 3) {
      normalized = normalized.slice(0, -1);
    }
    return normalized.toLowerCase();
  }

  isWithinDir(targetPath: string, dir: string): boolean {
    const target = this.normalizeDirForCompare(targetPath);
    let base = this.normalizeDirForCompare(dir);
    if (target === base) return true;
    if (!base.endsWith(win32.sep)) base += win32.sep;
    return target.startsWith(base);
  }

  async linkCli(
    cliDistPath: string,
    binDir: string,
    options?: { force?: boolean }
  ): Promise<LinkCliResult> {
    const onPath = this.findCommandOnPath('sm') ?? this.findCommandOnPath('schema-memory');

    if (!options?.force && onPath && !this.isWithinDir(onPath, binDir)) {
      return {
        binDir,
        linked: false,
        detail: `already available on PATH (${onPath})`,
      };
    }

    await mkdir(binDir, { recursive: true });

    for (const name of ['sm', 'schema-memory']) {
      const target = resolve(binDir, name);
      await createWindowsShim(cliDistPath, target);
    }

    const detail = this.isDirOnPath(binDir)
      ? `${binDir} (already on PATH)`
      : `${binDir} (NOT on PATH)`;
    return { binDir, linked: true, detail };
  }

  async cleanCli(binDir: string): Promise<void> {
    for (const name of ['sm', 'schema-memory']) {
      await rm(resolve(binDir, name), { force: true });
      await rm(resolve(binDir, `${name}.cmd`), { force: true });
      await rm(resolve(binDir, `${name}.ps1`), { force: true });
    }
  }

  async checkCliHealth(binDir: string, onPath: string | null): Promise<CliHealthResult> {
    const fallbackCandidates = [
      resolve(binDir, 'sm.cmd'),
      resolve(binDir, 'schema-memory.cmd'),
      resolve(binDir, 'sm.ps1'),
      resolve(binDir, 'sm'),
    ];
    const fallbackShim = fallbackCandidates.find((c) => existsSync(c)) ?? null;

    // Inspect candidate files for corrupted cross-drive path concatenation
    const inspectFiles = [
      onPath,
      fallbackShim,
      resolve(binDir, 'sm.cmd'),
      resolve(binDir, 'sm.ps1'),
      resolve(binDir, 'sm'),
      resolve(binDir, 'schema-memory.cmd'),
      resolve(binDir, 'schema-memory.ps1'),
      resolve(binDir, 'schema-memory'),
    ].filter((p): p is string => Boolean(p && existsSync(p)));

    for (const file of inspectFiles) {
      try {
        const content = await readFile(file, 'utf-8');
        if (isCorruptedShimContent(content)) {
          return {
            ok: false,
            detail: `Corrupted cross-drive shim detected at "${file}". Run "sm setup --cli-only" (or "pnpm sm setup --cli-only") to repair.`,
          };
        }
      } catch {
        // ignore read error
      }
    }

    if (onPath) {
      return {
        ok: true,
        detail: `Resolved on PATH: ${onPath}`,
      };
    }

    if (fallbackShim) {
      return {
        ok: true,
        detail: `Found fallback shim at "${fallbackShim}", but directory is not on PATH. Fix: run "npm i -g schema-memory" or ${this.getPathHint(binDir)}.`,
      };
    }

    return {
      ok: false,
      detail: `Not on PATH. Fix: run "npm i -g schema-memory" or ${this.getPathHint(binDir)}.`,
    };
  }

  async stopProcess(pid: number): Promise<boolean> {
    try {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async openBrowser(url: string): Promise<void> {
    try {
      const sanitizedUrl = url.replace(/"/g, '%22');
      const child = spawn('cmd.exe', ['/c', 'start', '""', sanitizedUrl], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.unref();
    } catch {
      // browser launch is best-effort
    }
  }

  getPathHint(binDir: string): string {
    return `add "%USERPROFILE%\\.local\\bin" to PATH (or run: [Environment]::SetEnvironmentVariable("Path", $env:Path + ";${binDir}", "User"))`;
  }

  detectEphemeralRunner(cliPath: string): EphemeralRunner | null {
    const normalized = cliPath.toLowerCase().replace(/\\/g, '/');
    if (normalized.includes('/.bun/install/cache/') || normalized.includes('/bunx/')) {
      return 'bunx';
    }
    if (normalized.includes('/pnpm/dlx/') || normalized.includes('/dlx-') || normalized.includes('/.pnpm-store/')) {
      return 'pnpm-dlx';
    }
    if (normalized.includes('/_npx/') || normalized.includes('/npm-cache/_npx')) {
      return 'npx';
    }
    return null;
  }
}
