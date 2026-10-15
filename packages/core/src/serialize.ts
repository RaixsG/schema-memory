import { SchemaModel, Table, Column, Ref, Enum, Index } from './model.js';

export interface SerializeOptions {
  headerNote?: string;
}

function formatColumnSettings(col: Column): string {
  const parts: string[] = [];

  if (col.pk) parts.push('pk');
  if (col.increment) parts.push('increment');
  if (col.unique) parts.push('unique');
  if (col.notNull) parts.push('not null');

  if (col.default !== null && col.default !== undefined) {
    if (col.default.startsWith('`') && col.default.endsWith('`')) {
      parts.push(`default: ${col.default}`);
    } else if (
      col.default.includes('(') ||
      col.default.toLowerCase() === 'now()'
    ) {
      parts.push(`default: \`${col.default}\``);
    } else if (
      col.default.startsWith("'") &&
      col.default.endsWith("'")
    ) {
      parts.push(`default: ${col.default}`);
    } else if (!isNaN(Number(col.default))) {
      parts.push(`default: ${col.default}`);
    } else {
      parts.push(`default: '${col.default}'`);
    }
  }

  if (col.note) {
    parts.push(`note: '${col.note.replace(/'/g, "\\'")}'`);
  }

  if (parts.length === 0) return '';
  return ` [${parts.join(', ')}]`;
}

function formatIndex(idx: Index): string {
  const cols =
    idx.columns.length > 1
      ? `(${idx.columns.join(', ')})`
      : idx.columns[0] || '';

  const settings: string[] = [];
  if (idx.unique) settings.push('unique');
  if (idx.name) settings.push(`name: '${idx.name}'`);

  if (settings.length === 0) {
    return cols;
  }
  return `${cols} [${settings.join(', ')}]`;
}

function formatTable(table: Table): string {
  const lines: string[] = [];
  lines.push(`Table ${table.name} {`);

  for (const col of table.columns) {
    const settings = formatColumnSettings(col);
    lines.push(`  ${col.name} ${col.type}${settings}`);
  }

  if (table.indexes && table.indexes.length > 0) {
    lines.push('');
    lines.push('  Indexes {');
    for (const idx of table.indexes) {
      lines.push(`    ${formatIndex(idx)}`);
    }
    lines.push('  }');
  }

  if (table.note) {
    lines.push('');
    lines.push(`  Note: '${table.note.replace(/'/g, "\\'")}'`);
  }

  lines.push('}');
  return lines.join('\n');
}

function formatEnum(en: Enum): string {
  const lines: string[] = [];
  lines.push(`Enum ${en.name} {`);
  for (const val of en.values) {
    if (val.note) {
      lines.push(`  ${val.name} [note: '${val.note.replace(/'/g, "\\'")}']`);
    } else {
      lines.push(`  ${val.name}`);
    }
  }
  lines.push('}');
  return lines.join('\n');
}

function formatRelationSymbol(rel: Ref['relation']): string {
  switch (rel) {
    case 'many-to-one':
      return '>';
    case 'one-to-many':
      return '<';
    case 'one-to-one':
      return '-';
    case 'many-to-many':
      return '<>';
  }
}

function formatRef(ref: Ref): string {
  const fromCols =
    ref.from.columns.length > 1
      ? `(${ref.from.columns.join(', ')})`
      : ref.from.columns[0];
  const toCols =
    ref.to.columns.length > 1
      ? `(${ref.to.columns.join(', ')})`
      : ref.to.columns[0];

  const symbol = formatRelationSymbol(ref.relation);
  const settings: string[] = [];

  if (ref.onDelete) settings.push(`delete: ${ref.onDelete}`);
  if (ref.onUpdate) settings.push(`update: ${ref.onUpdate}`);

  const settingsStr = settings.length > 0 ? ` [${settings.join(', ')}]` : '';
  const refName = ref.name ? `Ref ${ref.name}: ` : 'Ref: ';

  return `${refName}${ref.from.table}.${fromCols} ${symbol} ${ref.to.table}.${toCols}${settingsStr}`;
}

export function serializeDbml(
  model: SchemaModel,
  options: SerializeOptions = {}
): string {
  const sections: string[] = [];

  if (options.headerNote) {
    sections.push(`// ${options.headerNote}`);
  }

  for (const en of model.enums) {
    sections.push(formatEnum(en));
  }

  for (const table of model.tables) {
    sections.push(formatTable(table));
  }

  for (const ref of model.refs) {
    sections.push(formatRef(ref));
  }

  return sections.join('\n\n') + (sections.length > 0 ? '\n' : '');
}
