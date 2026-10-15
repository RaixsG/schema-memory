import { resolve } from 'node:path';
import { SchemaChange } from './model.js';
import { readIfExists } from './fsx.js';
import { parseSchema, validateDbml } from './dbml.js';
import { diffSchemas, affectedOf } from './diff.js';

export interface DriftReport {
  inSync: boolean;
  changes: SchemaChange[];
  affected: string[];
  suggestion?: string;
}

export async function checkDrift(
  projectPath: string,
  candidateDbml: string
): Promise<DriftReport> {
  const valid = validateDbml(candidateDbml);
  if (!valid.ok) {
    const err = valid.errors[0];
    throw new Error(
      `Candidate DBML is invalid: ${err?.message} (line ${err?.line})`
    );
  }

  const schemaPath = resolve(projectPath, '.schema-memory', 'schema.dbml');
  const currentDbml = (await readIfExists(schemaPath)) || '';

  const currentModel = parseSchema(currentDbml);
  const candidateModel = parseSchema(candidateDbml);

  const changes = diffSchemas(currentModel, candidateModel);
  const inSync = changes.length === 0;
  const affected = affectedOf(changes);

  let suggestion: string | undefined;
  if (!inSync) {
    suggestion = `Drift detected (${changes.length} change(s)). Call propose_change with the candidate DBML to review and document the reasons with an ADR.`;
  }

  return {
    inSync,
    changes,
    affected,
    suggestion,
  };
}
