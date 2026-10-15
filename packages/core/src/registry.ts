import { homedir } from 'node:os';
import { resolve, relative } from 'node:path';
import { stat } from 'node:fs/promises';
import { z } from 'zod';
import { atomicWrite, readIfExists } from './fsx.js';

export const RegisteredProject = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  addedAt: z.string(),
});
export type RegisteredProject = z.infer<typeof RegisteredProject>;

export const RegistryData = z.array(RegisteredProject);

export function getRegistryDir(): string {
  return (
    process.env.SCHEMA_MEMORY_HOME || resolve(homedir(), '.schema-memory')
  );
}

export function getRegistryPath(): string {
  return resolve(getRegistryDir(), 'projects.json');
}

export async function listProjects(): Promise<RegisteredProject[]> {
  const content = await readIfExists(getRegistryPath());
  if (!content) return [];
  try {
    return RegistryData.parse(JSON.parse(content));
  } catch {
    return [];
  }
}

export async function registerProject(project: {
  id: string;
  name: string;
  path: string;
}): Promise<RegisteredProject> {
  const projects = await listProjects();
  const normalizedPath = resolve(project.path);
  const now = new Date().toISOString();

  const existingIdx = projects.findIndex(
    (p) => p.id === project.id || p.path === normalizedPath
  );

  const entry: RegisteredProject = {
    id: project.id,
    name: project.name,
    path: normalizedPath,
    addedAt: existingIdx >= 0 ? projects[existingIdx]!.addedAt : now,
  };

  if (existingIdx >= 0) {
    projects[existingIdx] = entry;
  } else {
    projects.push(entry);
  }

  await atomicWrite(getRegistryPath(), JSON.stringify(projects, null, 2) + '\n');
  return entry;
}

export async function unregisterProject(id: string): Promise<boolean> {
  const projects = await listProjects();
  const filtered = projects.filter((p) => p.id !== id);
  if (filtered.length === projects.length) {
    return false;
  }
  await atomicWrite(getRegistryPath(), JSON.stringify(filtered, null, 2) + '\n');
  return true;
}

export class AmbiguousProjectError extends Error {
  constructor(public projects: RegisteredProject[]) {
    super(
      `Multiple projects registered. Specify project by id or path: ${projects.map((p) => p.id).join(', ')}`
    );
    this.name = 'AmbiguousProjectError';
  }
}

export class ProjectMissingError extends Error {
  constructor(public project: RegisteredProject) {
    super(
      `Project "${project.id}" registered at "${project.path}" was not found on disk.`
    );
    this.name = 'ProjectMissingError';
  }
}

export async function resolveProject(options: {
  project?: string;
  cwd?: string;
}): Promise<RegisteredProject> {
  const projects = await listProjects();
  const { project, cwd = process.cwd() } = options;

  let matched: RegisteredProject | undefined;

  // 1. By project parameter (matches id or exact path)
  if (project) {
    const resolvedPath = resolve(project);
    matched = projects.find(
      (p) => p.id === project || p.path === resolvedPath
    );
    if (!matched) {
      throw new Error(`Project "${project}" not found in registry.`);
    }
  }

  // 2. By CWD matching project path (or subpath)
  if (!matched && cwd) {
    const resolvedCwd = resolve(cwd);
    const inCwd = projects.filter((p) => {
      const rel = relative(p.path, resolvedCwd);
      return !rel.startsWith('..') && !rel.startsWith('/');
    });

    if (inCwd.length > 0) {
      // Pick the deepest match if nested
      inCwd.sort((a, b) => b.path.length - a.path.length);
      matched = inCwd[0];
    }
  }

  // 3. If only one project is registered
  if (!matched && projects.length === 1) {
    matched = projects[0];
  }

  // 4. Multiple projects and none matched
  if (!matched) {
    if (projects.length === 0) {
      throw new Error(
        'No projects registered in schema-memory. Run "schema-memory add <path>" first.'
      );
    }
    throw new AmbiguousProjectError(projects);
  }

  // Check directory existence
  try {
    const s = await stat(matched.path);
    if (!s.isDirectory()) {
      throw new ProjectMissingError(matched);
    }
  } catch (err: any) {
    if (err instanceof ProjectMissingError) throw err;
    throw new ProjectMissingError(matched);
  }

  return matched;
}
