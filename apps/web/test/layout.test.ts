import { describe, expect, it } from 'vitest';
import type { Ref, Table } from '../src/types';
import { computeAutoLayout, estimateTableSize } from '../src/lib/layout';

const users: Table = {
  name: 'users',
  columns: [
    { name: 'id', type: 'integer', pk: true },
    { name: 'email', type: 'varchar' },
  ],
};

const orders: Table = {
  name: 'orders',
  columns: [
    { name: 'id', type: 'integer', pk: true },
    { name: 'user_id', type: 'integer' },
  ],
};

const orderItems: Table = {
  name: 'order_items',
  columns: [
    { name: 'id', type: 'integer', pk: true },
    { name: 'order_id', type: 'integer' },
    { name: 'product_id', type: 'integer' },
  ],
};

const refs: Ref[] = [
  {
    from: { table: 'orders', columns: ['user_id'] },
    to: { table: 'users', columns: ['id'] },
    relation: 'many-to-one',
  },
  {
    from: { table: 'order_items', columns: ['order_id'] },
    to: { table: 'orders', columns: ['id'] },
    relation: 'many-to-one',
  },
];

describe('automatic layout', () => {
  it('estimates a height from the number of columns', () => {
    expect(estimateTableSize(orders).height).toBeLessThan(
      estimateTableSize(orderItems).height
    );
  });

  it('places every table and keeps related nodes apart', async () => {
    const layout = await computeAutoLayout(
      [users, orders, orderItems],
      refs,
      'LR'
    );

    expect(Object.keys(layout).sort()).toEqual([
      'order_items',
      'orders',
      'users',
    ]);

    for (const position of Object.values(layout)) {
      expect(Number.isFinite(position.x)).toBe(true);
      expect(Number.isFinite(position.y)).toBe(true);
    }

    const positions = new Set(
      Object.values(layout).map((position) => `${position.x}:${position.y}`)
    );
    expect(positions.size).toBe(3);
  });

  it('supports vertical layouts and self-references without crashing', async () => {
    const selfRef: Ref = {
      from: { table: 'users', columns: ['id'] },
      to: { table: 'users', columns: ['id'] },
      relation: 'many-to-one',
    };

    const layout = await computeAutoLayout(
      [users, orders],
      [...refs, selfRef],
      'TB'
    );

    expect(Object.keys(layout).sort()).toEqual(['orders', 'users']);
    expect(layout.users.y).not.toBe(layout.orders.y);
  });

  it('returns an empty layout when there are no tables', async () => {
    expect(await computeAutoLayout([], refs)).toEqual({});
  });
});
