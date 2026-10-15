import { resolve } from 'node:path';
import { ProjectConfig } from './model.js';
import { atomicWrite, readIfExists } from './fsx.js';

export function getConfigPath(projectPath: string): string {
  return resolve(projectPath, '.schema-memory', 'config.json');
}

export async function readConfig(
  projectPath: string
): Promise<ProjectConfig | null> {
  const filePath = getConfigPath(projectPath);
  const content = await readIfExists(filePath);
  if (!content) return null;
  return ProjectConfig.parse(JSON.parse(content));
}

export async function writeConfig(
  projectPath: string,
  config: ProjectConfig
): Promise<void> {
  const filePath = getConfigPath(projectPath);
  await atomicWrite(filePath, JSON.stringify(config, null, 2) + '\n');
}
