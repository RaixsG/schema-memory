import { resolve } from 'node:path';
import {
  PendingChange,
  AdrDraft,
  SchemaChange,
  SchemaModel,
} from './model.js';
import { atomicWrite, readIfExists, removeIfExists, ensureDir } from './fsx.js';
import { hashDbml } from './hash.js';
import { parseSchema, validateDbml } from './dbml.js';
import { serializeDbml } from './serialize.js';
import { diffSchemas, affectedOf } from './diff.js';

export interface PendingDetails {
  change: PendingChange;
  changes: SchemaChange[];
  affects: string[];
  stale: boolean;
  draft: AdrDraft | null;
}

export interface PendingStatus {
  hasPending: boolean;
  stale: boolean;
}

function getPendingDir(projectPath: string): string {
  return resolve(projectPath, '.schema-memory', 'pending');
}

function getChangePath(projectPath: string): string {
  return resolve(getPendingDir(projectPath), 'change.json');
}

function getDraftPath(projectPath: string): string {
  return resolve(getPendingDir(projectPath), 'adr-draft.json');
}

function getSchemaPath(projectPath: string): string {
  return resolve(projectPath, '.schema-memory', 'schema.dbml');
}

export async function getPendingStatus(
  projectPath: string
): Promise<PendingStatus> {
  const changeContent = await readIfExists(getChangePath(projectPath));
  if (!changeContent) {
    return { hasPending: false, stale: false };
  }

  try {
    const parsed = JSON.parse(changeContent) as { baseHash?: string };
    if (!parsed.baseHash) {
      return { hasPending: true, stale: false };
    }
    const currentDbml = (await readIfExists(getSchemaPath(projectPath))) || '';
    const currentHash = hashDbml(currentDbml);
    return {
      hasPending: true,
      stale: currentHash !== parsed.baseHash,
    };
  } catch {
    return { hasPending: false, stale: false };
  }
}

export async function savePending(
  projectPath: string,
  options: {
    proposedDbml?: string;
    model?: SchemaModel;
    source: 'ui' | 'agent';
    note?: string;
  }
): Promise<PendingDetails> {
  let dbml = options.proposedDbml;
  if (!dbml && options.model) {
    dbml = serializeDbml(options.model);
  }
  if (dbml === undefined) {
    throw new Error('Either proposedDbml or model must be provided.');
  }

  const validation = validateDbml(dbml);
  if (!validation.ok) {
    const first = validation.errors[0];
    throw new Error(
      `Invalid proposed DBML: ${first?.message} (line ${first?.line}, column ${first?.column})`
    );
  }

  const [currentDbmlRaw, existingRaw, draftContent] = await Promise.all([
    readIfExists(getSchemaPath(projectPath)),
    readIfExists(getChangePath(projectPath)),
    readIfExists(getDraftPath(projectPath)),
  ]);

  const currentDbml = currentDbmlRaw || '';
  const baseHash = hashDbml(currentDbml);
  const now = new Date().toISOString();

  let createdAt = now;
  if (existingRaw) {
    try {
      const parsed = JSON.parse(existingRaw);
      if (parsed.createdAt) createdAt = parsed.createdAt;
    } catch {
      // ignore
    }
  }

  const pending: PendingChange = {
    version: 1,
    baseHash,
    proposedDbml: dbml,
    source: options.source,
    note: options.note,
    createdAt,
    updatedAt: now,
  };

  await ensureDir(getPendingDir(projectPath));
  await atomicWrite(
    getChangePath(projectPath),
    JSON.stringify(pending, null, 2) + '\n'
  );

  const beforeModel = parseSchema(currentDbml);
  const afterModel = options.model ?? parseSchema(dbml);
  const changes = diffSchemas(beforeModel, afterModel);
  const affects = affectedOf(changes);

  let draft: AdrDraft | null = null;
  if (draftContent) {
    try {
      draft = AdrDraft.parse(JSON.parse(draftContent));
    } catch {
      // ignore corrupt draft
    }
  }

  return {
    change: pending,
    changes,
    affects,
    stale: false,
    draft,
  };
}

export async function saveAdrDraft(
  projectPath: string,
  draft: AdrDraft
): Promise<AdrDraft> {
  const validated = AdrDraft.parse(draft);
  await ensureDir(getPendingDir(projectPath));
  await atomicWrite(
    getDraftPath(projectPath),
    JSON.stringify(validated, null, 2) + '\n'
  );
  return validated;
}

export async function clearPending(projectPath: string): Promise<void> {
  await Promise.all([
    removeIfExists(getChangePath(projectPath)),
    removeIfExists(getDraftPath(projectPath)),
  ]);
}

export async function getPending(
  projectPath: string
): Promise<PendingDetails | null> {
  const changeContent = await readIfExists(getChangePath(projectPath));
  if (!changeContent) return null;

  const [currentDbmlRaw, draftContent] = await Promise.all([
    readIfExists(getSchemaPath(projectPath)),
    readIfExists(getDraftPath(projectPath)),
  ]);

  const change = PendingChange.parse(JSON.parse(changeContent));
  const currentDbml = currentDbmlRaw || '';
  const currentHash = hashDbml(currentDbml);
  const stale = currentHash !== change.baseHash;

  const beforeModel = parseSchema(currentDbml);
  const afterModel = parseSchema(change.proposedDbml);
  const changes = diffSchemas(beforeModel, afterModel);
  const affects = affectedOf(changes);

  let draft: AdrDraft | null = null;
  if (draftContent) {
    try {
      draft = AdrDraft.parse(JSON.parse(draftContent));
    } catch {
      // ignore corrupt draft
    }
  }

  return {
    change,
    changes,
    affects,
    stale,
    draft,
  };
}
