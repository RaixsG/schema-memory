export interface Column {
  name: string;
  type: string;
  pk?: boolean;
  unique?: boolean;
  notNull?: boolean;
  increment?: boolean;
  default?: string | null;
  note?: string | null;
}

export interface Table {
  name: string;
  schema?: string;
  columns: Column[];
  indexes?: Array<{ columns: string[]; unique?: boolean; name?: string }>;
  note?: string | null;
}

export interface Ref {
  name?: string | null;
  from: { table: string; columns: string[] };
  to: { table: string; columns: string[] };
  relation: 'one-to-one' | 'one-to-many' | 'many-to-one' | 'many-to-many';
  onDelete?: string;
  onUpdate?: string;
}

export interface Enum {
  name: string;
  values: Array<{ name: string; note?: string | null }>;
}

export interface SchemaModel {
  tables: Table[];
  refs: Ref[];
  enums: Enum[];
}

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  dialect: string;
  stack: string[];
  hasPending: boolean;
  pendingStale: boolean;
  unconfirmedAdrs: number;
  totalAdrs: number;
}

export interface SchemaChange {
  kind: string;
  table?: string;
  column?: string;
  name?: string;
  before?: any;
  after?: any;
  fields?: string[];
}

export interface PendingDetails {
  change: {
    baseHash: string;
    proposedDbml: string;
    source: 'ui' | 'agent';
    createdAt: string;
    updatedAt: string;
    note?: string;
  };
  changes: SchemaChange[];
  affects: string[];
  stale: boolean;
  draft: {
    title: string;
    context: string;
    decision: string;
    alternatives: Array<{ option: string; whyDiscarded: string }>;
    consequences: string;
  } | null;
}

export interface AdrItem {
  metadata: {
    id: string;
    title: string;
    status: 'propuesto' | 'confirmado' | 'reconstruido';
    date: string;
    affects: string[];
    supersedes?: string[];
  };
  context: string;
  decision: string;
  alternatives: Array<{ option: string; whyDiscarded: string }>;
  consequences: string;
  diffText?: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  isGitRepo: boolean;
  hasSchemaMemory: boolean;
  isRegistered?: boolean;
}

export interface LocationEntry {
  id: string;
  label: string;
  path: string;
  kind: 'home' | 'desktop' | 'documents' | 'drive' | 'volume' | 'mount' | 'recent';
}
