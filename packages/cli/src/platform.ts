import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { parse, resolve, sep } from 'node:path';

export const isWindows = process.platform === 'win32';

/**
 * Returns the first path where `command` resolves on PATH (via `where` on
 * Windows / `which` elsewhere), or null when it is not available.
 */
export function findCommandOnPath(command: string): string | null {
  const finder = isWindows ? 'where' : 'which';
  try {
    const output = execFileSync(finder, [command], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
      windowsHide: true,
    })
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return output[0] ?? null;
  } catch {
    return null;
  }
}

/** Directory where `sm setup` places fallback shims (Unix) or .cmd shims (Windows). */
export function getBinDir(): string {
  return resolve(homedir(), '.local', 'bin');
}

function normalizeDirForCompare(dir: string): string {
  let normalized = resolve(dir);
  const root = parse(normalized).root;
  if (normalized.endsWith(sep) && normalized !== root) {
    normalized = normalized.slice(0, -1);
  }
  return isWindows ? normalized.toLowerCase() : normalized;
}

/** True when `dir` is part of the current PATH. */
export function isDirOnPath(dir: string): boolean {
  const target = normalizeDirForCompare(dir);
  const pathValue = process.env.PATH || process.env.Path || '';
  const entries = pathValue
    .split(isWindows ? ';' : ':')
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
  return entries.some((entry) => normalizeDirForCompare(entry) === target);
}

/** True when `targetPath` is `dir` itself or lives inside it. */
export function isWithinDir(targetPath: string, dir: string): boolean {
  const target = normalizeDirForCompare(targetPath);
  let base = normalizeDirForCompare(dir);
  if (target === base) return true;
  if (!base.endsWith(sep)) base += sep;
  return target.startsWith(base);
}

export type EphemeralRunner = 'npx' | 'bunx' | 'pnpm-dlx';

/**
 * Identifies which ephemeral package runner (npx, bunx, pnpm dlx) launched the CLI,
 * or returns null when running from a permanent global/local installation.
 */
export function detectEphemeralRunner(cliPath: string): EphemeralRunner | null {
  const normalized = cliPath.toLowerCase().replace(/\\/g, '/');
  if (
    normalized.includes('/.bun/install/cache/') ||
    normalized.includes('/bunx/')
  ) {
    return 'bunx';
  }
  if (
    normalized.includes('/pnpm/dlx/') ||
    normalized.includes('/dlx-') ||
    normalized.includes('/.pnpm-store/')
  ) {
    return 'pnpm-dlx';
  }
  if (
    normalized.includes('/_npx/') ||
    normalized.includes('/npm-cache/_npx')
  ) {
    return 'npx';
  }
  return null;
}

/** True when the CLI is running from a throwaway cache directory (npx / pnpm dlx / bunx). */
export function isEphemeralInstall(cliPath: string): boolean {
  return detectEphemeralRunner(cliPath) !== null;
}

/** True when a previous `sm setup` fallback shim exists in `binDir`. */
export function fallbackShimExists(binDir: string): string | null {
  const candidates = isWindows
    ? [resolve(binDir, 'sm.cmd'), resolve(binDir, 'schema-memory.cmd')]
    : [resolve(binDir, 'sm'), resolve(binDir, 'schema-memory')];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
