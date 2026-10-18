import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PlatformAdapter } from './types.js';
import { WindowsPlatformAdapter } from './windows.js';
import { DarwinPlatformAdapter } from './darwin.js';
import { LinuxPlatformAdapter } from './linux.js';

let platformInstance: PlatformAdapter | null = null;

/**
 * Returns the PlatformAdapter for the current operating system,
 * or allows overriding the OS for cross-platform unit testing.
 */
export function getPlatform(overrideOs?: string): PlatformAdapter {
  if (overrideOs) {
    if (overrideOs === 'win32' || overrideOs === 'windows') {
      return new WindowsPlatformAdapter();
    }
    if (overrideOs === 'darwin') {
      return new DarwinPlatformAdapter();
    }
    return new LinuxPlatformAdapter();
  }

  if (!platformInstance) {
    const currentOs = process.platform;
    if (currentOs === 'win32') {
      platformInstance = new WindowsPlatformAdapter();
    } else if (currentOs === 'darwin') {
      platformInstance = new DarwinPlatformAdapter();
    } else {
      platformInstance = new LinuxPlatformAdapter();
    }
  }

  return platformInstance;
}

// Convenience helpers matching previous API for backward compatibility
export const isWindows = process.platform === 'win32';

export function getBinDir(): string {
  return getPlatform().getBinDir();
}

export function isDirOnPath(dir: string): boolean {
  return getPlatform().isDirOnPath(dir);
}

export function findCommandOnPath(name: string): string | null {
  return getPlatform().findCommandOnPath(name);
}

export function normalizeDirForCompare(dir: string): string {
  return getPlatform().normalizeDirForCompare(dir);
}

export function isWithinDir(targetPath: string, dir: string): boolean {
  return getPlatform().isWithinDir(targetPath, dir);
}

export function detectEphemeralRunner(cliPath: string) {
  return getPlatform().detectEphemeralRunner(cliPath);
}

export function isEphemeralInstall(cliPath: string): boolean {
  return detectEphemeralRunner(cliPath) !== null;
}

export function fallbackShimExists(binDir: string): string | null {
  const candidates = isWindows
    ? [resolve(binDir, 'sm.cmd'), resolve(binDir, 'schema-memory.cmd')]
    : [resolve(binDir, 'sm'), resolve(binDir, 'schema-memory')];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export * from './types.js';
export {
  WindowsPlatformAdapter,
  DarwinPlatformAdapter,
  LinuxPlatformAdapter,
};
export {
  createWindowsShim,
  generateWindowsShimContent,
  isCorruptedShimContent,
} from './windows-shim.js';
