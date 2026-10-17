import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { ProjectConfig } from './model.js';
import { atomicWrite, readIfExists } from './fsx.js';

const configCache = new Map<
  string,
  { mtimeMs: number; size: number; config: ProjectConfig }
>();

export function getConfigPath(projectPath: string): string {
  return resolve(projectPath, '.schema-memory', 'config.json');
}

export async function readConfig(
  projectPath: string
): Promise<ProjectConfig | null> {
  const filePath = getConfigPath(projectPath);
  try {
    const s = await stat(filePath);
    const cached = configCache.get(filePath);
    if (cached && cached.mtimeMs === s.mtimeMs && cached.size === s.size) {
      return structuredClone(cached.config);
    }
    const content = await readIfExists(filePath);
    if (!content) return null;
    const parsed = ProjectConfig.parse(JSON.parse(content));
    configCache.set(filePath, {
      mtimeMs: s.mtimeMs,
      size: s.size,
      config: parsed,
    });
    return structuredClone(parsed);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      configCache.delete(filePath);
      return null;
    }
    throw error;
  }
}

export async function writeConfig(
  projectPath: string,
  config: ProjectConfig
): Promise<void> {
  const filePath = getConfigPath(projectPath);
  configCache.delete(filePath);
  await atomicWrite(filePath, JSON.stringify(config, null, 2) + '\n');
}
