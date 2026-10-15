import {
  SchemaModel,
  Table,
  Column,
  Ref,
  Enum,
  Index,
  SchemaChange,
} from './model.js';

function refKey(ref: Ref): string {
  const from = `${ref.from.table.toLowerCase()}.${ref.from.columns.map((c) => c.toLowerCase()).join(',')}`;
  const to = `${ref.to.table.toLowerCase()}.${ref.to.columns.map((c) => c.toLowerCase()).join(',')}`;
  return `${from}->${ref.relation}->${to}`;
}

function indexKey(idx: Index): string {
  return `${idx.columns.map((c) => c.toLowerCase()).join(',')}:${idx.unique ? 'u' : 'nu'}:${idx.name || ''}`;
}

export function diffSchemas(
  before: SchemaModel,
  after: SchemaModel
): SchemaChange[] {
  const changes: SchemaChange[] = [];

  const beforeTables = new Map<string, Table>();
  for (const t of before.tables) {
    beforeTables.set(t.name.toLowerCase(), t);
  }

  const afterTables = new Map<string, Table>();
  for (const t of after.tables) {
    afterTables.set(t.name.toLowerCase(), t);
  }

  // 1. Table diffs
  for (const [name, afterTable] of afterTables.entries()) {
    const beforeTable = beforeTables.get(name);
    if (!beforeTable) {
      changes.push({
        kind: 'table_added',
        table: afterTable.name,
        after: afterTable,
      });
      continue;
    }

    // Check table note
    if (beforeTable.note !== afterTable.note) {
      changes.push({
        kind: 'table_note_changed',
        table: afterTable.name,
        before: beforeTable.note,
        after: afterTable.note,
      });
    }

    // Column diffs
    const beforeCols = new Map<string, Column>();
    for (const c of beforeTable.columns) {
      beforeCols.set(c.name.toLowerCase(), c);
    }
    const afterCols = new Map<string, Column>();
    for (const c of afterTable.columns) {
      afterCols.set(c.name.toLowerCase(), c);
    }

    for (const [colName, afterCol] of afterCols.entries()) {
      const beforeCol = beforeCols.get(colName);
      if (!beforeCol) {
        changes.push({
          kind: 'column_added',
          table: afterTable.name,
          column: afterCol.name,
          after: afterCol,
        });
        continue;
      }

      const changedFields: Array<keyof Column> = [];
      const keys: Array<keyof Column> = [
        'type',
        'pk',
        'unique',
        'notNull',
        'increment',
        'default',
        'note',
      ];
      for (const k of keys) {
        if (beforeCol[k] !== afterCol[k]) {
          changedFields.push(k);
        }
      }

      if (changedFields.length > 0) {
        changes.push({
          kind: 'column_changed',
          table: afterTable.name,
          column: afterCol.name,
          fields: changedFields,
          before: beforeCol,
          after: afterCol,
        });
      }
    }

    for (const [colName, beforeCol] of beforeCols.entries()) {
      if (!afterCols.has(colName)) {
        changes.push({
          kind: 'column_removed',
          table: beforeTable.name,
          column: beforeCol.name,
          before: beforeCol,
        });
      }
    }

    // Index diffs
    const beforeIndexes = new Map<string, Index>();
    for (const idx of beforeTable.indexes || []) {
      beforeIndexes.set(indexKey(idx), idx);
    }
    const afterIndexes = new Map<string, Index>();
    for (const idx of afterTable.indexes || []) {
      afterIndexes.set(indexKey(idx), idx);
    }

    for (const [k, idx] of afterIndexes.entries()) {
      if (!beforeIndexes.has(k)) {
        changes.push({
          kind: 'index_added',
          table: afterTable.name,
          index: idx,
        });
      }
    }

    for (const [k, idx] of beforeIndexes.entries()) {
      if (!afterIndexes.has(k)) {
        changes.push({
          kind: 'index_removed',
          table: beforeTable.name,
          index: idx,
        });
      }
    }
  }

  for (const [name, beforeTable] of beforeTables.entries()) {
    if (!afterTables.has(name)) {
      changes.push({
        kind: 'table_removed',
        table: beforeTable.name,
        before: beforeTable,
      });
    }
  }

  // 2. Enum diffs
  const beforeEnums = new Map<string, Enum>();
  for (const e of before.enums || []) {
    beforeEnums.set(e.name.toLowerCase(), e);
  }
  const afterEnums = new Map<string, Enum>();
  for (const e of after.enums || []) {
    afterEnums.set(e.name.toLowerCase(), e);
  }

  for (const [name, afterEnum] of afterEnums.entries()) {
    const beforeEnum = beforeEnums.get(name);
    if (!beforeEnum) {
      changes.push({
        kind: 'enum_added',
        name: afterEnum.name,
        after: afterEnum,
      });
      continue;
    }

    const beforeVals = new Set(beforeEnum.values.map((v) => v.name));
    const afterVals = new Set(afterEnum.values.map((v) => v.name));

    const addedValues = afterEnum.values
      .map((v) => v.name)
      .filter((v) => !beforeVals.has(v));
    const removedValues = beforeEnum.values
      .map((v) => v.name)
      .filter((v) => !afterVals.has(v));

    if (addedValues.length > 0 || removedValues.length > 0) {
      changes.push({
        kind: 'enum_changed',
        name: afterEnum.name,
        addedValues,
        removedValues,
      });
    }
  }

  for (const [name, beforeEnum] of beforeEnums.entries()) {
    if (!afterEnums.has(name)) {
      changes.push({
        kind: 'enum_removed',
        name: beforeEnum.name,
        before: beforeEnum,
      });
    }
  }

  // 3. Ref diffs
  const beforeRefs = new Map<string, Ref>();
  for (const r of before.refs || []) {
    beforeRefs.set(refKey(r), r);
  }
  const afterRefs = new Map<string, Ref>();
  for (const r of after.refs || []) {
    afterRefs.set(refKey(r), r);
  }

  for (const [k, r] of afterRefs.entries()) {
    if (!beforeRefs.has(k)) {
      changes.push({ kind: 'ref_added', ref: r });
    }
  }

  for (const [k, r] of beforeRefs.entries()) {
    if (!afterRefs.has(k)) {
      changes.push({ kind: 'ref_removed', ref: r });
    }
  }

  return changes;
}

export function affectedOf(changes: SchemaChange[]): string[] {
  const set = new Set<string>();

  for (const c of changes) {
    switch (c.kind) {
      case 'table_added':
      case 'table_removed':
      case 'table_note_changed':
        set.add(c.table);
        break;
      case 'column_added':
      case 'column_removed':
      case 'column_changed':
        set.add(c.table);
        set.add(`${c.table}.${c.column}`);
        break;
      case 'index_added':
      case 'index_removed':
        set.add(c.table);
        for (const col of c.index.columns) {
          set.add(`${c.table}.${col}`);
        }
        break;
      case 'ref_added':
      case 'ref_removed':
        set.add(c.ref.from.table);
        set.add(c.ref.to.table);
        for (const col of c.ref.from.columns) {
          set.add(`${c.ref.from.table}.${col}`);
        }
        for (const col of c.ref.to.columns) {
          set.add(`${c.ref.to.table}.${col}`);
        }
        break;
      case 'enum_added':
      case 'enum_removed':
      case 'enum_changed':
        set.add(`enum:${c.name}`);
        break;
    }
  }

  return Array.from(set).sort();
}
