import { readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, normalize, parse, win32 as pathWin32, posix as pathPosix } from 'node:path';
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

function getPathModule(platform: NodeJS.Platform) {
  return platform === 'win32' ? pathWin32 : pathPosix;
}

function normalizeForCompare(targetPath: string, platform: NodeJS.Platform): string {
  const p = getPathModule(platform);
  const normalized = p.normalize(p.resolve(targetPath));
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
  const p = getPathModule(platform);
  const target = normalizeForCompare(targetPath, platform);
  let base = normalizeForCompare(root, platform);
  if (target === base) return true;
  if (!base.endsWith(p.sep)) base += p.sep;
  return target.startsWith(base);
}

let cachedDefaultRoots: string[] | null = null;

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export function isPathAllowed(
  targetPath: string,
  options: PathPolicyOptions = {}
): boolean {
  const platform = options.platform ?? process.platform;
  const isDefault =
    options.platform === undefined &&
    options.home === undefined &&
    options.tmp === undefined;

  let roots: string[];
  if (isDefault) {
    if (!cachedDefaultRoots) {
      cachedDefaultRoots = computeAllowedRoots();
    }
    roots = cachedDefaultRoots;
  } else {
    roots = computeAllowedRoots({
      platform,
      ...(options.home ? { home: options.home } : {}),
      ...(options.tmp ? { tmp: options.tmp } : {}),
    });
  }
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
  const candidateEntries = entries.filter(
    (entry) =>
      (entry.isDirectory() || entry.isSymbolicLink()) &&
      !entry.name.startsWith('.')
  );

  const inspected = await Promise.all(
    candidateEntries.map(async (entry): Promise<DirectoryEntry | null> => {
      const fullPath = resolve(current, entry.name);
      try {
        if (entry.isSymbolicLink()) {
          const entryStat = await stat(fullPath);
          if (!entryStat.isDirectory()) return null;
        }

        const [isGitRepo, hasSchemaMemory] = await Promise.all([
          pathExists(resolve(fullPath, '.git')),
          pathExists(resolve(fullPath, '.schema-memory')),
        ]);

        return {
          name: entry.name,
          path: fullPath,
          isGitRepo,
          hasSchemaMemory,
        };
      } catch {
        return null;
      }
    })
  );

  const directories: DirectoryEntry[] = inspected.filter(
    (d): d is DirectoryEntry => d !== null
  );

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
