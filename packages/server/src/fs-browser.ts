import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, normalize, sep, parse } from 'node:path';
import { homedir, tmpdir } from 'node:os';

export interface DirectoryEntry {
  name: string;
  path: string;
  isGitRepo: boolean;
  hasSchemaMemory: boolean;
}

export interface PathPolicyOptions {
  platform?: NodeJS.Platform;
  home?: string;
  tmp?: string;
}

function normalizeForCompare(targetPath: string, platform: NodeJS.Platform): string {
  const normalized = normalize(resolve(targetPath));
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

/**
 * Directory roots the local folder browser is allowed to access, per OS:
 * - Windows: the user home, temp dir and every existing drive root (C:\, D:\, ...).
 * - macOS: the user home, /Volumes, /tmp and /private/tmp.
 * - Linux/other: the user home, /tmp, /mnt and /media.
 */
export function computeAllowedRoots(options: PathPolicyOptions = {}): string[] {
  const platform = options.platform ?? process.platform;
  const home = options.home ?? homedir();
  const tmp = options.tmp ?? tmpdir();
  const roots = new Set<string>();

  const add = (root: string) => roots.add(normalizeForCompare(root, platform));

  add(home);
  add(tmp);

  if (platform === 'win32') {
    for (let code = 65; code <= 90; code += 1) {
      const drive = `${String.fromCharCode(code)}:\\`;
      if (existsSync(drive)) add(drive);
    }
  } else if (platform === 'darwin') {
    add('/Volumes');
    add('/tmp');
    add('/private/tmp');
  } else {
    add('/tmp');
    add('/mnt');
    add('/media');
  }

  return [...roots];
}

/**
 * True when `targetPath` is `root` itself or lives inside it.
 * Comparisons are case-insensitive on Windows and separator-aware so that
 * e.g. `C:\Users\ana2` is not considered inside `C:\Users\ana`.
 */
export function isPathWithin(
  targetPath: string,
  root: string,
  platform: NodeJS.Platform = process.platform
): boolean {
  const target = normalizeForCompare(targetPath, platform);
  let base = normalizeForCompare(root, platform);
  if (target === base) return true;
  if (!base.endsWith(sep)) base += sep;
  return target.startsWith(base);
}

export function isPathAllowed(
  targetPath: string,
  options: PathPolicyOptions = {}
): boolean {
  const platform = options.platform ?? process.platform;
  const roots = computeAllowedRoots({
    platform,
    ...(options.home ? { home: options.home } : {}),
    ...(options.tmp ? { tmp: options.tmp } : {}),
  });
  return roots.some((root) => isPathWithin(targetPath, root, platform));
}

function listWindowsDrives(): string[] {
  const drives: string[] = [];
  for (let code = 65; code <= 90; code += 1) {
    const drive = `${String.fromCharCode(code)}:\\`;
    if (existsSync(drive)) drives.push(drive);
  }
  return drives;
}

export async function listDirectories(
  targetPath?: string
): Promise<{ current: string; parent: string | null; directories: DirectoryEntry[] }> {
  const current = normalize(resolve(targetPath || homedir()));

  if (!isPathAllowed(current)) {
    throw new Error('Path is outside allowed directories.');
  }

  const s = await stat(current);
  if (!s.isDirectory()) {
    throw new Error(`Path "${current}" is not a directory.`);
  }

  const entries = await readdir(current, { withFileTypes: true });
  const directories: DirectoryEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    if (entry.name.startsWith('.')) continue; // skip hidden folders like .git, .cache

    const fullPath = resolve(current, entry.name);
    try {
      const entryStat = await stat(fullPath);
      if (!entryStat.isDirectory()) continue;

      let isGitRepo = false;
      try {
        await stat(resolve(fullPath, '.git'));
        isGitRepo = true;
      } catch {
        // ignore
      }

      let hasSchemaMemory = false;
      try {
        await stat(resolve(fullPath, '.schema-memory'));
        hasSchemaMemory = true;
      } catch {
        // ignore
      }

      directories.push({
        name: entry.name,
        path: fullPath,
        isGitRepo,
        hasSchemaMemory,
      });
    } catch {
      // skip unreadable directories
    }
  }

  // On Windows, surface every drive root as a navigable entry when sitting
  // at the root of a drive (e.g. C:\) so users can switch to E:\ projects.
  if (process.platform === 'win32' && parse(current).root === current) {
    const currentDrive = current.toLowerCase();
    for (const drive of listWindowsDrives()) {
      if (drive.toLowerCase() === currentDrive) continue;
      directories.push({
        name: drive,
        path: drive,
        isGitRepo: false,
        hasSchemaMemory: false,
      });
    }
  }

  directories.sort((a, b) => a.name.localeCompare(b.name));

  const parent = resolve(current, '..');
  const parentAllowed = parent !== current && isPathAllowed(parent);

  return {
    current,
    parent: parentAllowed ? parent : null,
    directories,
  };
}
