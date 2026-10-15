import { Parser } from '@dbml/core';
import {
  SchemaModel,
  Table,
  Column,
  Ref,
  Enum,
  Index,
  RefRelation,
} from './model.js';

export interface ValidationError {
  line: number;
  column: number;
  message: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: ValidationError[] };

export function validateDbml(src: string): ValidationResult {
  if (!src.trim()) {
    return { ok: true };
  }
  try {
    Parser.parse(src, 'dbml');
    return { ok: true };
  } catch (error: any) {
    const line = error?.location?.start?.line ?? 1;
    const column = error?.location?.start?.column ?? 1;
    const message = error?.message || 'DBML syntax error';
    return {
      ok: false,
      errors: [{ line, column, message }],
    };
  }
}

function mapRelation(rel0: string, rel1: string): RefRelation {
  if (rel0 === '*' && rel1 === '1') return 'many-to-one';
  if (rel0 === '1' && rel1 === '*') return 'one-to-many';
  if (rel0 === '1' && rel1 === '1') return 'one-to-one';
  return 'many-to-many';
}

function extractDefault(field: any): string | null {
  if (!field.dbdefault) return null;
  if (typeof field.dbdefault === 'string') return field.dbdefault;
  if (field.dbdefault.value !== undefined) {
    return String(field.dbdefault.value);
  }
  return null;
}

export function parseSchema(src: string): SchemaModel {
  if (!src.trim()) {
    return { tables: [], refs: [], enums: [] };
  }

  const database = Parser.parse(src, 'dbml');
  const tables: Table[] = [];
  const refs: Ref[] = [];
  const enums: Enum[] = [];

  for (const schema of database.schemas || []) {
    const schemaName = schema.name || 'public';

    for (const table of schema.tables || []) {
      const columns: Column[] = (table.fields || []).map((field: any) => ({
        name: field.name,
        type: field.type?.type_name || 'varchar',
        pk: Boolean(field.pk),
        unique: Boolean(field.unique),
        notNull: Boolean(field.not_null),
        increment: Boolean(field.increment),
        default: extractDefault(field),
        note: field.note ?? null,
      }));

      const indexes: Index[] = (table.indexes || []).map((idx: any) => ({
        name: idx.name || undefined,
        columns: (idx.columns || []).map((c: any) => c.value),
        unique: Boolean(idx.unique),
      }));

      tables.push({
        name: table.name,
        schema: schemaName,
        columns,
        indexes,
        note: table.note ?? null,
      });
    }

    for (const en of schema.enums || []) {
      enums.push({
        name: en.name,
        values: (en.values || []).map((v: any) => ({
          name: v.name,
          note: v.note ?? null,
        })),
      });
    }

    for (const ref of schema.refs || []) {
      const ep0 = ref.endpoints?.[0];
      const ep1 = ref.endpoints?.[1];
      if (ep0 && ep1) {
        refs.push({
          name: ref.name || null,
          from: {
            table: ep0.tableName,
            columns: ep0.fieldNames || [],
          },
          to: {
            table: ep1.tableName,
            columns: ep1.fieldNames || [],
          },
          relation: mapRelation(ep0.relation, ep1.relation),
          onDelete: ref.onDelete || undefined,
          onUpdate: ref.onUpdate || undefined,
        });
      }
    }
  }

  return { tables, refs, enums };
}
