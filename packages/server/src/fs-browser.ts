import { readdir, stat } from 'node:fs/promises';
import { resolve, normalize } from 'node:path';
import { homedir, tmpdir } from 'node:os';

export interface DirectoryEntry {
  name: string;
  path: string;
  isGitRepo: boolean;
  hasSchemaMemory: boolean;
}

export function isPathAllowed(targetPath: string): boolean {
  const norm = normalize(resolve(targetPath));
  const userHome = normalize(homedir());
  const volumes = '/Volumes';
  const temp = normalize(tmpdir());

  return (
    norm.startsWith(userHome) ||
    norm.startsWith(volumes) ||
    norm.startsWith(temp) ||
    norm.startsWith('/tmp')
  );
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

  directories.sort((a, b) => a.name.localeCompare(b.name));

  const parent = resolve(current, '..');
  const parentAllowed = parent !== current && isPathAllowed(parent);

  return {
    current,
    parent: parentAllowed ? parent : null,
    directories,
  };
}
