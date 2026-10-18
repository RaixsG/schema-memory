import { existsSync } from 'node:fs';
import { dirname, resolve, parse } from 'node:path';
import { homedir } from 'node:os';
import {
  listProjects,
  readConfig,
  normalizePathKey,
  type ProjectConfig,
} from '@schema-memory/core';

export interface DetectedProject {
  path: string;
  config: ProjectConfig;
  registered: boolean;
  /** Registered locally under this id (when `registered`). */
  registeredId?: string;
}

/**
 * Walks up from `cwd` (stopping at the user home or filesystem root) looking
 * for a repo that already has `.schema-memory/config.json`, and reports
 * whether it is registered in the local registry.
 */
export async function detectProjectFromCwd(
  cwd: string = process.cwd()
): Promise<DetectedProject | null> {
  const stopAt = normalizePathKey(homedir());
  const root = parse(resolve(cwd)).root;
  let dir = resolve(cwd);

  for (let depth = 0; depth < 30; depth += 1) {
    if (existsSync(resolve(dir, '.schema-memory', 'config.json'))) {
      let config: ProjectConfig | null = null;
      try {
        config = await readConfig(dir);
      } catch {
        return null;
      }
      if (!config) return null;
      const key = normalizePathKey(dir);
      const projects = await listProjects();
      const match = projects.find((p) => normalizePathKey(p.path) === key);
      return {
        path: dir,
        config,
        registered: !!match,
        registeredId: match?.id,
      };
    }
    if (normalizePathKey(dir) === stopAt || dir === root) return null;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}
