import { resolve, normalize, sep } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { chmod, rm, symlink, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import type {
  PlatformAdapter,
  LinkCliResult,
  CliHealthResult,
  EphemeralRunner,
} from './types.js';

export abstract class BasePosixPlatformAdapter implements PlatformAdapter {
  abstract readonly name: 'darwin' | 'linux';
  readonly isWindows = false;

  getBinDir(): string {
    return resolve(homedir(), '.local', 'bin');
  }

  isDirOnPath(dir: string): boolean {
    const pathEnv = process.env.PATH || '';
    const target = this.normalizeDirForCompare(dir);
    const entries = pathEnv
      .split(':')
      .map((entry) => entry.trim())
      .filter(Boolean);
    return entries.some((entry) => this.normalizeDirForCompare(entry) === target);
  }

  findCommandOnPath(name: string): string | null {
    try {
      const res = spawnSync('which', [name], {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      if (res.status === 0 && res.stdout) {
        const line = res.stdout.split('\n')[0].trim();
        return line.length > 0 ? line : null;
      }
      return null;
    } catch {
      return null;
    }
  }

  normalizeDirForCompare(dir: string): string {
    let normalized = normalize(dir);
    if (normalized.endsWith(sep) && normalized.length > 1) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  }

  isWithinDir(targetPath: string, dir: string): boolean {
    const target = this.normalizeDirForCompare(targetPath);
    let base = this.normalizeDirForCompare(dir);
    if (target === base) return true;
    if (!base.endsWith(sep)) base += sep;
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
    await chmod(cliDistPath, 0o755);

    for (const name of ['sm', 'schema-memory']) {
      const linkPath = resolve(binDir, name);
      await rm(linkPath, { force: true });
      await symlink(cliDistPath, linkPath);
    }

    const detail = this.isDirOnPath(binDir)
      ? `${binDir} (already on PATH)`
      : `${binDir} (NOT on PATH)`;
    return { binDir, linked: true, detail };
  }

  async cleanCli(binDir: string): Promise<void> {
    for (const name of ['sm', 'schema-memory']) {
      await rm(resolve(binDir, name), { force: true });
    }
  }

  async checkCliHealth(binDir: string, onPath: string | null): Promise<CliHealthResult> {
    const candidate = existsSync(resolve(binDir, 'sm'))
      ? resolve(binDir, 'sm')
      : existsSync(resolve(binDir, 'schema-memory'))
        ? resolve(binDir, 'schema-memory')
        : null;

    if (onPath) {
      return {
        ok: true,
        detail: `Resolved on PATH: ${onPath}`,
      };
    }

    if (candidate) {
      return {
        ok: true,
        detail: `Found fallback shim at "${candidate}", but directory is not on PATH. Fix: run "npm i -g schema-memory" or ${this.getPathHint(binDir)}.`,
      };
    }

    return {
      ok: false,
      detail: `Not on PATH. Fix: run "npm i -g schema-memory" or ${this.getPathHint(binDir)}.`,
    };
  }

  async stopProcess(pid: number): Promise<boolean> {
    try {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        process.kill(pid, 'SIGTERM');
      }
      return true;
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ESRCH') return true;
      return false;
    }
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

  abstract openBrowser(url: string): Promise<void>;
  abstract getPathHint(binDir: string): string;
}
