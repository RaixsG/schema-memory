import { resolve } from 'node:path';
import {
  AdrDraft,
  AdrMetadata,
  SchemaChange,
} from './model.js';
import { getPending, clearPending } from './pending.js';
import { nextAdrId, renderAdrMarkdown, writeAdr } from './adr.js';
import { readConfig } from './config.js';
import { atomicWrite, removeIfExists } from './fsx.js';
import { validateDbml } from './dbml.js';

export interface ConfirmResult {
  adrId: string;
  adrPath: string;
  changes: SchemaChange[];
  affects: string[];
  engramSummary: string;
}

export function formatChangesSummary(changes: SchemaChange[]): string {
  const lines: string[] = [];
  for (const c of changes) {
    switch (c.kind) {
      case 'table_added':
        lines.push(`+ Table ${c.table}`);
        break;
      case 'table_removed':
        lines.push(`- Table ${c.table}`);
        break;
      case 'table_note_changed':
        lines.push(`~ Table ${c.table} (note changed)`);
        break;
      case 'column_added':
        lines.push(`+ Column ${c.table}.${c.column} (${c.after.type})`);
        break;
      case 'column_removed':
        lines.push(`- Column ${c.table}.${c.column}`);
        break;
      case 'column_changed':
        lines.push(
          `~ Column ${c.table}.${c.column} [${c.fields.join(', ')}]`
        );
        break;
      case 'ref_added':
        lines.push(
          `+ Ref: ${c.ref.from.table}.${c.ref.from.columns.join(',')} ${c.ref.relation} ${c.ref.to.table}.${c.ref.to.columns.join(',')}`
        );
        break;
      case 'ref_removed':
        lines.push(
          `- Ref: ${c.ref.from.table}.${c.ref.from.columns.join(',')} ${c.ref.relation} ${c.ref.to.table}.${c.ref.to.columns.join(',')}`
        );
        break;
      case 'enum_added':
        lines.push(`+ Enum ${c.name}`);
        break;
      case 'enum_removed':
        lines.push(`- Enum ${c.name}`);
        break;
      case 'enum_changed':
        lines.push(
          `~ Enum ${c.name} (+[${c.addedValues.join(', ')}], -[${c.removedValues.join(', ')}])`
        );
        break;
      case 'index_added':
        lines.push(`+ Index ${c.table}(${c.index.columns.join(', ')})`);
        break;
      case 'index_removed':
        lines.push(`- Index ${c.table}(${c.index.columns.join(', ')})`);
        break;
    }
  }
  return lines.join('\n');
}

export function buildEngramSummary(options: {
  projectId: string;
  adrId: string;
  title: string;
  decision: string;
  alternatives: Array<{ option: string; whyDiscarded: string }>;
  affects: string[];
  adrPath: string;
}): string {
  const alts =
    options.alternatives
      .map((a) => `${a.option} (${a.whyDiscarded})`)
      .join('; ') || 'ninguna';

  const relAdrPath = options.adrPath.includes('.schema-memory')
    ? `.schema-memory${options.adrPath.split('.schema-memory')[1]}`
    : options.adrPath;

  return [
    `[schema-memory][${options.projectId}] ADR-${options.adrId} "${options.title}"`,
    `Decisión: ${options.decision}. Alternativas descartadas: ${alts}.`,
    `Afecta: ${options.affects.join(', ') || 'esquema general'}. Archivo: ${relAdrPath}`,
  ].join('\n');
}

export async function confirmChange(
  projectPath: string,
  options?: {
    draft?: AdrDraft;
  }
): Promise<ConfirmResult> {
  const pending = await getPending(projectPath);
  if (!pending) {
    throw new Error('No pending change found to confirm.');
  }

  if (pending.stale) {
    throw new Error(
      'Pending change is stale: schema.dbml on disk has changed since this change was proposed. Rebase or discard.'
    );
  }

  const valid = validateDbml(pending.change.proposedDbml);
  if (!valid.ok) {
    const err = valid.errors[0];
    throw new Error(
      `Proposed DBML is invalid: ${err?.message} (line ${err?.line})`
    );
  }

  const draftToUse = options?.draft || pending.draft;
  if (!draftToUse) {
    throw new Error(
      'Cannot confirm change without an ADR draft. Provide draft or call draft_adr first.'
    );
  }

  const validatedDraft = AdrDraft.parse(draftToUse);
  const config = await readConfig(projectPath);
  const projectId = config?.id || 'unknown';

  const adrId = await nextAdrId(projectPath);
  const now = new Date().toISOString().slice(0, 10);
  const diffSummary = formatChangesSummary(pending.changes);

  const metadata: AdrMetadata = {
    id: adrId,
    title: validatedDraft.title,
    status: 'confirmado',
    date: now,
    affects: pending.affects,
  };

  const adrMarkdown = renderAdrMarkdown({
    metadata,
    draft: validatedDraft,
    diffSummary,
    dbmlDiff: diffSummary,
  });

  // Write ADR
  const adrPath = await writeAdr(projectPath, metadata, adrMarkdown);

  try {
    // Write new schema.dbml
    const schemaPath = resolve(projectPath, '.schema-memory', 'schema.dbml');
    await atomicWrite(schemaPath, pending.change.proposedDbml);

    // Clear pending
    await clearPending(projectPath);
  } catch (err) {
    // Atomic rollback: remove newly written ADR if schema write fails
    await removeIfExists(adrPath);
    throw err;
  }

  const engramSummary = buildEngramSummary({
    projectId,
    adrId,
    title: validatedDraft.title,
    decision: validatedDraft.decision,
    alternatives: validatedDraft.alternatives,
    affects: pending.affects,
    adrPath,
  });

  return {
    adrId,
    adrPath,
    changes: pending.changes,
    affects: pending.affects,
    engramSummary,
  };
}
