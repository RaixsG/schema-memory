import type { Ref } from '../types';

export type EndpointSide = 'from' | 'to';
export type Cardinality = '1' | 'N' | 'M';

export interface RelationshipDisplay {
  fkSide: EndpointSide | null;
  referencedSide: EndpointSide | null;
  sourceSide: EndpointSide;
  targetSide: EndpointSide;
  sourceCardinality: Cardinality;
  targetCardinality: Cardinality;
  relationLabel: string;
  visualLabel: string;
}

export function getRelationshipDisplay(ref: Ref): RelationshipDisplay {
  if (ref.relation === 'many-to-one') {
    return {
      fkSide: 'from',
      referencedSide: 'to',
      sourceSide: 'from',
      targetSide: 'to',
      sourceCardinality: 'N',
      targetCardinality: '1',
      relationLabel: 'N : 1',
      visualLabel: 'N : 1',
    };
  }

  if (ref.relation === 'one-to-many') {
    return {
      fkSide: 'to',
      referencedSide: 'from',
      sourceSide: 'to',
      targetSide: 'from',
      sourceCardinality: 'N',
      targetCardinality: '1',
      relationLabel: '1 : N',
      visualLabel: 'N : 1',
    };
  }

  if (ref.relation === 'one-to-one') {
    return {
      fkSide: null,
      referencedSide: null,
      sourceSide: 'from',
      targetSide: 'to',
      sourceCardinality: '1',
      targetCardinality: '1',
      relationLabel: '1 : 1',
      visualLabel: '1 : 1',
    };
  }

  return {
    fkSide: null,
    referencedSide: null,
    sourceSide: 'from',
    targetSide: 'to',
    sourceCardinality: 'N',
    targetCardinality: 'M',
    relationLabel: 'N : M',
    visualLabel: 'N : M',
  };
}

export function getEndpoint(ref: Ref, side: EndpointSide): Ref['from'] {
  return ref[side];
}

export function getOtherSide(side: EndpointSide): EndpointSide {
  return side === 'from' ? 'to' : 'from';
}

export function formatEndpoint(
  ref: Ref,
  side: EndpointSide,
  includeTable = true
): string {
  const endpoint = getEndpoint(ref, side);
  const columns = endpoint.columns.join(', ') || 'id';
  return includeTable ? `${endpoint.table}.${columns}` : columns;
}

export function formatRelationshipLabel(ref: Ref): string {
  const display = getRelationshipDisplay(ref);
  return `${formatEndpoint(ref, display.sourceSide)} → ${formatEndpoint(
    ref,
    display.targetSide
  )}`;
}

export function parseHandleId(handleId?: string | null): string | null {
  if (!handleId) return null;
  const column = handleId.replace(/-[lr]$/, '');
  return column || null;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function renameColumnInRefs(
  refs: Ref[],
  tableName: string,
  oldColumn: string,
  newColumn: string
): Ref[] {
  if (oldColumn === newColumn) return refs;

  let changed = false;
  const next = refs.map((ref) => {
    const fromColumns =
      ref.from.table === tableName
        ? ref.from.columns.map((column) =>
            column === oldColumn ? newColumn : column
          )
        : ref.from.columns;
    const toColumns =
      ref.to.table === tableName
        ? ref.to.columns.map((column) =>
            column === oldColumn ? newColumn : column
          )
        : ref.to.columns;

    const fromChanged = !arraysEqual(fromColumns, ref.from.columns);
    const toChanged = !arraysEqual(toColumns, ref.to.columns);

    if (!fromChanged && !toChanged) return ref;

    changed = true;
    return {
      ...ref,
      from: fromChanged ? { ...ref.from, columns: fromColumns } : ref.from,
      to: toChanged ? { ...ref.to, columns: toColumns } : ref.to,
    };
  });

  return changed ? next : refs;
}

export function removeRefsForColumn(
  refs: Ref[],
  tableName: string,
  columnName: string
): { refs: Ref[]; removed: number } {
  const next = refs.filter((ref) => {
    const inFrom =
      ref.from.table === tableName && ref.from.columns.includes(columnName);
    const inTo =
      ref.to.table === tableName && ref.to.columns.includes(columnName);
    return !inFrom && !inTo;
  });

  return { refs: next, removed: refs.length - next.length };
}

export function refKey(endpoint: Ref['from']): string {
  return `${endpoint.table}:${[...endpoint.columns].sort().join(',')}`;
}

export function isDuplicateRef(refs: Ref[], candidate: Ref): boolean {
  const candidateFrom = refKey(candidate.from);
  const candidateTo = refKey(candidate.to);

  return refs.some(
    (ref) => refKey(ref.from) === candidateFrom && refKey(ref.to) === candidateTo
  );
}

export function sortIndicesDescending(indices: number[]): number[] {
  return [...indices].sort((a, b) => b - a);
}

export function adjustEdgeIndexAfterRemoval(
  selectedIndex: number | null,
  removedIndex: number
): number | null {
  if (selectedIndex === null) return null;
  if (selectedIndex === removedIndex) return null;
  if (selectedIndex > removedIndex) return selectedIndex - 1;
  return selectedIndex;
}

export function relationLabelForValue(relation: Ref['relation']): string {
  return getRelationshipDisplay({ relation } as Ref).relationLabel;
}
