import { z } from 'zod';

export const Column = z.object({
  name: z.string(),
  type: z.string(),
  pk: z.boolean().default(false),
  unique: z.boolean().default(false),
  notNull: z.boolean().default(false),
  increment: z.boolean().default(false),
  default: z.string().nullable().default(null),
  note: z.string().nullable().default(null),
});
export type Column = z.infer<typeof Column>;

export const Index = z.object({
  name: z.string().optional(),
  columns: z.array(z.string()),
  unique: z.boolean().default(false),
  pk: z.boolean().default(false),
});
export type Index = z.infer<typeof Index>;

export const Table = z.object({
  name: z.string(),
  schema: z.string().default('public'),
  columns: z.array(Column),
  indexes: z.array(Index).default([]),
  note: z.string().nullable().default(null),
});
export type Table = z.infer<typeof Table>;

export const RefRelation = z.enum([
  'one-to-one',
  'one-to-many',
  'many-to-one',
  'many-to-many',
]);
export type RefRelation = z.infer<typeof RefRelation>;

export const RefEndpoint = z.object({
  table: z.string(),
  columns: z.array(z.string()),
});
export type RefEndpoint = z.infer<typeof RefEndpoint>;

export const Ref = z.object({
  name: z.string().nullable().default(null),
  from: RefEndpoint,
  to: RefEndpoint,
  relation: RefRelation,
  onDelete: z.string().optional(),
  onUpdate: z.string().optional(),
});
export type Ref = z.infer<typeof Ref>;

export const EnumValue = z.object({
  name: z.string(),
  note: z.string().nullable().default(null),
});
export type EnumValue = z.infer<typeof EnumValue>;

export const Enum = z.object({
  name: z.string(),
  values: z.array(EnumValue),
});
export type Enum = z.infer<typeof Enum>;

export const SchemaModel = z.object({
  tables: z.array(Table),
  refs: z.array(Ref).default([]),
  enums: z.array(Enum).default([]),
});
export type SchemaModel = z.infer<typeof SchemaModel>;

export type SchemaChange =
  | { kind: 'table_added'; table: string; after: Table }
  | { kind: 'table_removed'; table: string; before: Table }
  | { kind: 'table_note_changed'; table: string; before: string | null; after: string | null }
  | { kind: 'column_added'; table: string; column: string; after: Column }
  | { kind: 'column_removed'; table: string; column: string; before: Column }
  | {
      kind: 'column_changed';
      table: string;
      column: string;
      fields: Array<keyof Column>;
      before: Column;
      after: Column;
    }
  | { kind: 'ref_added'; ref: Ref }
  | { kind: 'ref_removed'; ref: Ref }
  | { kind: 'index_added'; table: string; index: Index }
  | { kind: 'index_removed'; table: string; index: Index }
  | { kind: 'enum_added'; name: string; after: Enum }
  | { kind: 'enum_removed'; name: string; before: Enum }
  | {
      kind: 'enum_changed';
      name: string;
      addedValues: string[];
      removedValues: string[];
    };

export const DialectEnum = z.enum([
  'postgres',
  'mysql',
  'sqlite',
  'mssql',
  'oracle',
  'other',
]);
export type Dialect = z.infer<typeof DialectEnum>;

export const ProjectConfig = z.object({
  version: z.literal(1),
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  dialect: DialectEnum,
  stack: z.array(z.string()).default([]),
  createdAgentsMd: z.boolean().default(false),
  createdAt: z.string(),
});
export type ProjectConfig = z.infer<typeof ProjectConfig>;

export const PendingChange = z.object({
  version: z.literal(1),
  baseHash: z.string(),
  proposedDbml: z.string(),
  source: z.enum(['ui', 'agent']),
  note: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PendingChange = z.infer<typeof PendingChange>;

export const Alternative = z.object({
  option: z.string(),
  whyDiscarded: z.string(),
});
export type Alternative = z.infer<typeof Alternative>;

export const AdrDraft = z.object({
  title: z.string().min(1),
  context: z.string().min(1),
  decision: z.string().min(1),
  alternatives: z.array(Alternative).min(1),
  consequences: z.string().min(1),
});
export type AdrDraft = z.infer<typeof AdrDraft>;

export const AdrStatus = z.enum(['propuesto', 'confirmado', 'reconstruido']);
export type AdrStatus = z.infer<typeof AdrStatus>;

export const AdrMetadata = z.object({
  id: z.string(),
  title: z.string(),
  status: AdrStatus,
  date: z.string(),
  affects: z.array(z.string()),
  supersedes: z.array(z.string()).optional(),
});
export type AdrMetadata = z.infer<typeof AdrMetadata>;
