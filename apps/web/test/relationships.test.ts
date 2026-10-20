import { describe, expect, it } from 'vitest';
import type { Ref } from '../src/types';
import {
  adjustEdgeIndexAfterRemoval,
  formatRelationshipLabel,
  getRelationshipDisplay,
  isDuplicateRef,
  parseHandleId,
  removeRefsForColumn,
  renameColumnInRefs,
  sortIndicesDescending,
} from '../src/lib/relationships';

function makeRef(overrides: Partial<Ref> = {}): Ref {
  return {
    from: { table: 'orders', columns: ['user_id'] },
    to: { table: 'users', columns: ['id'] },
    relation: 'many-to-one',
    ...overrides,
  };
}

describe('relationship direction helpers', () => {
  it('renders many-to-one from the FK side to the referenced side', () => {
    const display = getRelationshipDisplay(makeRef());

    expect(display.fkSide).toBe('from');
    expect(display.referencedSide).toBe('to');
    expect(display.sourceSide).toBe('from');
    expect(display.targetSide).toBe('to');
    expect(display.sourceCardinality).toBe('N');
    expect(display.targetCardinality).toBe('1');
    expect(display.relationLabel).toBe('N : 1');
  });

  it('swaps the visual direction for one-to-many', () => {
    const ref = makeRef({ relation: 'one-to-many' });
    const display = getRelationshipDisplay(ref);

    expect(display.fkSide).toBe('to');
    expect(display.referencedSide).toBe('from');
    expect(display.sourceSide).toBe('to');
    expect(display.targetSide).toBe('from');
    expect(display.relationLabel).toBe('1 : N');
    expect(display.visualLabel).toBe('N : 1');
    expect(formatRelationshipLabel(ref)).toBe('users.id → orders.user_id');
  });

  it('handles one-to-one and many-to-many without a single FK side', () => {
    expect(getRelationshipDisplay(makeRef({ relation: 'one-to-one' })).fkSide).toBeNull();
    expect(getRelationshipDisplay(makeRef({ relation: 'many-to-many' })).fkSide).toBeNull();
    expect(
      getRelationshipDisplay(makeRef({ relation: 'many-to-many' })).relationLabel
    ).toBe('N : M');
  });

  it('parses column handles with and without side suffixes', () => {
    expect(parseHandleId('user_id-r')).toBe('user_id');
    expect(parseHandleId('id-l')).toBe('id');
    expect(parseHandleId('id')).toBe('id');
    expect(parseHandleId(null)).toBeNull();
  });
});

describe('relationship integrity helpers', () => {
  it('renames a column in every endpoint and preserves unrelated refs', () => {
    const refs: Ref[] = [
      makeRef(),
      makeRef({
        from: { table: 'order_items', columns: ['order_id'] },
        to: { table: 'orders', columns: ['id'] },
      }),
    ];

    const updated = renameColumnInRefs(refs, 'orders', 'user_id', 'customer_id');

    expect(updated[0].from.columns).toEqual(['customer_id']);
    expect(updated[1]).toBe(refs[1]);
  });

  it('removes every ref that uses a deleted column', () => {
    const refs: Ref[] = [
      makeRef(),
      makeRef({
        from: { table: 'order_items', columns: ['user_id', 'order_id'] },
        to: { table: 'users', columns: ['id'] },
      }),
    ];

    const result = removeRefsForColumn(refs, 'orders', 'user_id');

    expect(result.removed).toBe(1);
    expect(result.refs).toHaveLength(1);
    expect(result.refs[0].from.table).toBe('order_items');
  });

  it('adjusts the selected edge index after removing another edge', () => {
    expect(adjustEdgeIndexAfterRemoval(2, 0)).toBe(1);
    expect(adjustEdgeIndexAfterRemoval(0, 2)).toBe(0);
    expect(adjustEdgeIndexAfterRemoval(2, 2)).toBeNull();
    expect(adjustEdgeIndexAfterRemoval(null, 1)).toBeNull();
  });

  it('sorts removal indices descending so deletions do not shift each other', () => {
    expect(sortIndicesDescending([0, 3, 1])).toEqual([3, 1, 0]);
    expect(sortIndicesDescending([])).toEqual([]);
  });

  it('detects duplicate relationships regardless of column order', () => {
    const existing = makeRef({
      from: { table: 'items', columns: ['a', 'b'] },
      to: { table: 'targets', columns: ['x', 'y'] },
    });

    expect(
      isDuplicateRef(
        [existing],
        makeRef({
          from: { table: 'items', columns: ['b', 'a'] },
          to: { table: 'targets', columns: ['y', 'x'] },
        })
      )
    ).toBe(true);

    expect(
      isDuplicateRef(
        [existing],
        makeRef({
          from: { table: 'items', columns: ['a'] },
          to: { table: 'targets', columns: ['x'] },
        })
      )
    ).toBe(false);
  });
});
