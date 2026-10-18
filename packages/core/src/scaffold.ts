import { resolve, basename } from 'node:path';
import { stat, rm } from 'node:fs/promises';
import { ProjectConfig, Dialect } from './model.js';
import { atomicWrite, readIfExists, ensureDir, removeIfExists } from './fsx.js';
import { detectStack } from './stack.js';
import {
  registerProject,
  unregisterProject,
  listProjects,
  normalizePathKey,
} from './registry.js';
import { writeConfig, readConfig } from './config.js';
import { parseSchema } from './dbml.js';
import { countAdrsStatus } from './adr.js';

export interface ScaffoldAction {
  op: 'create' | 'modify';
  file: string;
  preview: string;
  diff?: string;
}

/** Summary of a project whose `.schema-memory/` already exists in the repo. */
export interface ExistingProjectInfo {
  id: string;
  name: string;
  dialect: Dialect;
  createdAt: string;
  tablesCount: number;
  adrCount: number;
  hasSchema: boolean;
}

export interface ScaffoldPlan {
  path: string;
  defaultId: string;
  defaultName: string;
  alreadyAdded: boolean;
  /**
   * `new`: repo has no `.schema-memory/config.json` yet (full scaffold).
   * `adopt`: repo is already configured; only register it locally.
   */
  mode: 'new' | 'adopt';
  existing?: ExistingProjectInfo;
  registry: {
    /** True when this exact path is already in the local registry. */
    registered: boolean;
    /** Local registry entry with the same id but a DIFFERENT path. */
    conflict?: { id: string; path: string };
  };
  /** True when schema.dbml is missing or defines no tables yet. */
  needsBootstrap: boolean;
  stack: string[];
  actions: ScaffoldAction[];
  warnings: string[];
}

export type ConflictResolution = 'replace' | 'new';

/**
 * Thrown when adopting a configured repo whose `id` is already registered
 * locally for a different path. Callers must choose `replace` or `new`.
 */
export class ProjectConflictError extends Error {
  constructor(
    public id: string,
    public existingPath: string
  ) {
    super(
      `Project id "${id}" is already registered at "${existingPath}". Choose to replace that path or register this one as a new project.`
    );
    this.name = 'ProjectConflictError';
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
}

export function formatManagedBlock(projectId: string): string {
  return [
    '<!-- schema-memory:begin -->',
    `## schema-memory (proyecto: ${projectId})`,
    `Este repositorio gestiona su esquema de base de datos en \`.schema-memory/\` vía MCP (\`schema-memory\` / \`schema-memory-mcp\`).`,
    `- Pasa siempre \`project: "${projectId}"\` al invocar cualquier herramienta MCP (\`get_decisions\`, \`get_schema\`, \`get_pending_changes\`, \`import_schema\`, \`draft_adr\`, \`confirm_change\`, \`check_drift\`).`,
    '- Antes de cambiar tablas/columnas/relaciones: llama a `get_decisions` (historial del porqué) y `get_schema`.',
    '- Nunca modifiques código o migraciones de esquema sin un `confirm_change(userConfirmed=true)` aprobado por el usuario.',
    '- Si el código cambió por fuera: llama a `check_drift`.',
    '- **Aislamiento estricto:** Interactúa con `schema-memory` ÚNICAMENTE a través de sus herramientas MCP. NUNCA busques, inspecciones ni analices el código fuente de la herramienta `schema-memory`; analiza únicamente los archivos de este proyecto.',
    '- **Fail-fast si falta MCP:** Si las herramientas MCP (`get_schema`, `import_schema`, etc.) no están cargadas en tu sesión actual, DETENTE de inmediato sin buscar en el sistema de archivos y pide al usuario ejecutar `sm setup` (o `pnpm sm setup`) y recargar la sesión del agente.',
    '<!-- schema-memory:end -->',
  ].join('\n');
}

export function updateAgentsMdContent(
  original: string | null,
  projectId: string
): { content: string; diff: string; created: boolean } {
  const block = formatManagedBlock(projectId);
  if (!original) {
    return {
      content: block + '\n',
      diff: `+ ${block.split('\n').join('\n+ ')}`,
      created: true,
    };
  }

  const beginMarker = '<!-- schema-memory:begin -->';
  const endMarker = '<!-- schema-memory:end -->';
  const beginIdx = original.indexOf(beginMarker);
  const endIdx = original.indexOf(endMarker);

  if (beginIdx !== -1 && endIdx !== -1 && endIdx >= beginIdx) {
    const afterEnd = endIdx + endMarker.length;
    const before = original.slice(0, beginIdx).trimEnd();
    const after = original.slice(afterEnd).trimStart();
    const newContent = `${before ? before + '\n\n' : ''}${block}${after ? '\n\n' + after : ''}\n`;
    return {
      content: newContent,
      diff: `~ Replaced schema-memory block (id: ${projectId})`,
      created: false,
    };
  }

  const trimmed = original.trimEnd();
  const newContent = `${trimmed ? trimmed + '\n\n' : ''}${block}\n`;
  return {
    content: newContent,
    diff: `+ ${block.split('\n').join('\n+ ')}`,
    created: false,
  };
}

async function summarizeExisting(
  absPath: string,
  config: ProjectConfig
): Promise<{ info: ExistingProjectInfo; needsBootstrap: boolean }> {
  const schemaRaw = await readIfExists(
    resolve(absPath, '.schema-memory', 'schema.dbml')
  );
  let tablesCount = 0;
  if (schemaRaw && schemaRaw.trim()) {
    try {
      tablesCount = parseSchema(schemaRaw).tables.length;
    } catch {
      tablesCount = 0;
    }
  }
  const adrCounts = await countAdrsStatus(absPath);
  return {
    info: {
      id: config.id,
      name: config.name,
      dialect: config.dialect,
      createdAt: config.createdAt,
      tablesCount,
      adrCount: adrCounts.totalAdrs,
      hasSchema: tablesCount > 0,
    },
    needsBootstrap: tablesCount === 0,
  };
}

export async function planAddProject(repoPath: string): Promise<ScaffoldPlan> {
  const absPath = resolve(repoPath);
  const s = await stat(absPath);
  if (!s.isDirectory()) {
    throw new Error(`Path "${absPath}" is not a directory.`);
  }

  const defaultName = basename(absPath);
  const defaultId = slugify(defaultName);
  const warnings: string[] = [];

  let existingConfig: ProjectConfig | null = null;
  try {
    existingConfig = await readConfig(absPath);
  } catch {
    warnings.push(
      'Existing .schema-memory/config.json is invalid and will be regenerated.'
    );
  }
  const alreadyAdded = existingConfig !== null;
  const mode: 'new' | 'adopt' = alreadyAdded ? 'adopt' : 'new';
  const stack = await detectStack(absPath);

  // Check git repo
  try {
    await stat(resolve(absPath, '.git'));
  } catch {
    warnings.push('The folder is not a Git repository root.');
  }

  // Registry state (local machine) for this path / id
  const projects = await listProjects();
  const pathKey = normalizePathKey(absPath);
  const registered = projects.some((p) => normalizePathKey(p.path) === pathKey);
  const effectiveId = existingConfig?.id ?? defaultId;
  const conflictEntry = projects.find(
    (p) => p.id === effectiveId && normalizePathKey(p.path) !== pathKey
  );

  let existing: ExistingProjectInfo | undefined;
  let needsBootstrap = true;
  if (existingConfig) {
    const summary = await summarizeExisting(absPath, existingConfig);
    existing = summary.info;
    needsBootstrap = summary.needsBootstrap;
  }

  const actions: ScaffoldAction[] = [];

  if (!alreadyAdded) {
    actions.push({
      op: 'create',
      file: '.schema-memory/config.json',
      preview: 'Project metadata and dialect configuration',
    });
    actions.push({
      op: 'create',
      file: '.schema-memory/schema.dbml',
      preview: 'Initial canonical DBML schema file',
    });
    actions.push({
      op: 'create',
      file: '.schema-memory/layout.json',
      preview: 'Visual canvas node positions',
    });
    actions.push({
      op: 'create',
      file: '.schema-memory/.gitignore',
      preview: 'Ignores pending/ and temporary files',
    });
  }

  const agentsPath = resolve(absPath, 'AGENTS.md');
  const existingAgents = await readIfExists(agentsPath);
  const { diff, content: nextAgents, created } = updateAgentsMdContent(
    existingAgents,
    effectiveId
  );

  // In adopt mode only touch AGENTS.md when the managed block is missing/stale.
  if (!alreadyAdded || nextAgents !== existingAgents) {
    actions.push({
      op: created ? 'create' : 'modify',
      file: 'AGENTS.md',
      preview: created
        ? 'Creates AGENTS.md with schema-memory rules'
        : 'Injects managed schema-memory rules block',
      diff,
    });
  }

  return {
    path: absPath,
    defaultId,
    defaultName,
    alreadyAdded,
    mode,
    existing,
    registry: {
      registered,
      ...(conflictEntry
        ? { conflict: { id: conflictEntry.id, path: conflictEntry.path } }
        : {}),
    },
    needsBootstrap,
    stack,
    actions,
    warnings,
  };
}

/**
 * Registers an already-configured repo (cloned with its `.schema-memory/`)
 * in the local registry WITHOUT overwriting any file of the repo except the
 * managed AGENTS.md block (and `config.id` when registering as `new`).
 *
 * If the config `id` is registered locally for a different path, a
 * {@link ProjectConflictError} is thrown unless `resolveConflict` is given:
 * - `replace`: the registry entry is repointed to this path.
 * - `new`: a fresh `<id>-N` is generated and written to the repo `config.json`.
 */
export async function adoptProject(
  plan: ScaffoldPlan,
  options: { resolveConflict?: ConflictResolution } = {}
): Promise<ProjectConfig> {
  const absPath = plan.path;
  const config = await readConfig(absPath);
  if (!config) {
    throw new Error(`No .schema-memory/config.json found in "${absPath}".`);
  }

  const projects = await listProjects();
  const pathKey = normalizePathKey(absPath);
  const conflict = projects.find(
    (p) => p.id === config.id && normalizePathKey(p.path) !== pathKey
  );

  let finalConfig = config;
  if (conflict) {
    if (!options.resolveConflict) {
      throw new ProjectConflictError(conflict.id, conflict.path);
    }
    if (options.resolveConflict === 'new') {
      let counter = 2;
      let newId = `${slugify(config.id)}-${counter}`;
      while (projects.some((p) => p.id === newId)) {
        counter += 1;
        newId = `${slugify(config.id)}-${counter}`;
      }
      finalConfig = { ...config, id: newId };
      await writeConfig(absPath, finalConfig);
    }
    // 'replace': keep config.id; registerProject below repoints the entry.
  }

  // Keep the managed AGENTS.md block in sync with the (possibly new) id.
  const agentsPath = resolve(absPath, 'AGENTS.md');
  const existingAgents = await readIfExists(agentsPath);
  const { content: updatedAgents } = updateAgentsMdContent(
    existingAgents,
    finalConfig.id
  );
  if (updatedAgents !== existingAgents) {
    await atomicWrite(agentsPath, updatedAgents);
  }

  await registerProject({
    id: finalConfig.id,
    name: finalConfig.name,
    path: absPath,
  });

  return finalConfig;
}

export async function applyAddProject(
  plan: ScaffoldPlan,
  options: {
    id?: string;
    name?: string;
    dialect?: Dialect;
    installProjectSkill?: boolean;
    resolveConflict?: ConflictResolution;
  }
): Promise<ProjectConfig> {
  // Never overwrite an existing repo configuration: adopt it instead.
  if (plan.mode === 'adopt') {
    return adoptProject(plan, { resolveConflict: options.resolveConflict });
  }

  const absPath = plan.path;
  const name = options.name || plan.defaultName;

  // Resolve ID collisions: prefer options.id, then options.name, then plan.defaultId
  const candidateId = options.id || (options.name ? slugify(options.name) : plan.defaultId);
  const existingProjects = await listProjects();
  let id = slugify(candidateId);
  let counter = 2;
  while (
    existingProjects.some(
      (p) => p.id === id && p.path !== absPath
    )
  ) {
    id = `${slugify(options.id || plan.defaultId)}-${counter++}`;
  }

  const dialect: Dialect = options.dialect || 'postgres';
  const agentsPath = resolve(absPath, 'AGENTS.md');
  const existingAgents = await readIfExists(agentsPath);
  const { content: updatedAgents, created: createdAgentsMd } =
    updateAgentsMdContent(existingAgents, id);

  const config: ProjectConfig = {
    version: 1,
    id,
    name,
    dialect,
    stack: plan.stack,
    createdAgentsMd,
    createdAt: new Date().toISOString(),
  };

  const smDir = resolve(absPath, '.schema-memory');

  try {
    await ensureDir(smDir);
    await ensureDir(resolve(smDir, 'adr'));
    await ensureDir(resolve(smDir, 'pending'));

    // Write config
    await writeConfig(absPath, config);

    // Initial schema.dbml if missing
    const schemaPath = resolve(smDir, 'schema.dbml');
    const existingDbml = await readIfExists(schemaPath);
    if (!existingDbml) {
      const initialDbml = [
        `// Database schema for ${name}`,
        `// Canonical source managed by schema-memory`,
        '',
      ].join('\n');
      await atomicWrite(schemaPath, initialDbml);
    }

    // Initial layout.json if missing
    const layoutPath = resolve(smDir, 'layout.json');
    if (!(await readIfExists(layoutPath))) {
      await atomicWrite(layoutPath, '{}\n');
    }

    // Gitignore for .schema-memory
    const gitignorePath = resolve(smDir, '.gitignore');
    await atomicWrite(gitignorePath, 'pending/\n*.tmp*\n');

    // Update AGENTS.md
    await atomicWrite(agentsPath, updatedAgents);

    // Optional project-level skill
    if (options.installProjectSkill) {
      const skillDir = resolve(
        absPath,
        '.agents',
        'skills',
        'schema-memory-project'
      );
      await ensureDir(skillDir);
      const skillContent = [
        '---',
        'name: schema-memory-project',
        `description: Schema workflow rules for ${name} (${plan.stack.join(', ') || 'neutral'}).`,
        '---',
        '',
        `# ${name} Database Schema Runbook`,
        '',
        `Detected stack: ${plan.stack.join(', ') || 'generic'}`,
        'Always consult decisions before altering schema tables.',
      ].join('\n');
      await atomicWrite(resolve(skillDir, 'SKILL.md'), skillContent);
    }

    // Register project globally
    await registerProject({ id, name, path: absPath });

    return config;
  } catch (error) {
    // Rollback if something failed
    await unregisterProject(id);
    throw error;
  }
}

export async function removeProject(
  id: string,
  options: { deleteData?: boolean } = {}
): Promise<{ unlinked: boolean; dataDeleted: boolean }> {
  const projects = await listProjects();
  const project = projects.find((p) => p.id === id);
  if (!project) {
    throw new Error(`Project "${id}" is not registered.`);
  }

  const absPath = project.path;
  const config = await readConfig(absPath);

  // 1. Revert AGENTS.md
  const agentsPath = resolve(absPath, 'AGENTS.md');
  const existingAgents = await readIfExists(agentsPath);
  if (existingAgents) {
    const beginMarker = '<!-- schema-memory:begin -->';
    const endMarker = '<!-- schema-memory:end -->';
    const beginIdx = existingAgents.indexOf(beginMarker);
    const endIdx = existingAgents.indexOf(endMarker);

    if (beginIdx !== -1 && endIdx !== -1) {
      const before = existingAgents.slice(0, beginIdx).trimEnd();
      const after = existingAgents.slice(endIdx + endMarker.length).trimStart();
      const cleaned = `${before}${before && after ? '\n\n' : ''}${after}`.trim();

      if (!cleaned && config?.createdAgentsMd) {
        // We created AGENTS.md and now it's empty -> delete it
        await removeIfExists(agentsPath);
      } else {
        await atomicWrite(agentsPath, cleaned ? cleaned + '\n' : '');
      }
    }
  }

  // 2. Unregister
  await unregisterProject(id);

  // 3. Delete .schema-memory data directory if requested
  let dataDeleted = false;
  if (options.deleteData) {
    const smDir = resolve(absPath, '.schema-memory');
    await removeIfExists(smDir);
    dataDeleted = true;
  }

  return { unlinked: true, dataDeleted };
}
