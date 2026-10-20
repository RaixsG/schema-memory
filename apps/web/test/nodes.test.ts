import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { preserveNodeMeasurements } from '../src/lib/nodes';

function makeNode(id: string, overrides: Partial<Node> = {}): Node {
  return {
    id,
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  };
}

describe('preserveNodeMeasurements', () => {
  it('keeps the measured dimensions when a node is rebuilt', () => {
    const current = [
      makeNode('users', { measured: { width: 240, height: 120 } }),
    ];
    const next = [makeNode('users')];

    const result = preserveNodeMeasurements(next, current);

    expect(result[0].measured).toEqual({ width: 240, height: 120 });
  });

  it('leaves brand new nodes untouched', () => {
    const current = [
      makeNode('users', { measured: { width: 240, height: 120 } }),
    ];
    const next = [makeNode('orders')];

    const result = preserveNodeMeasurements(next, current);

    expect(result[0]).toBe(next[0]);
    expect(result[0].measured).toBeUndefined();
  });

  it('returns the next list when there is no current node list', () => {
    const next = [makeNode('users')];
    expect(preserveNodeMeasurements(next, [])).toBe(next);
  });

  it('keeps the live position while a node is being dragged', () => {
    const current = [
      makeNode('users', {
        position: { x: 480, y: 260 },
        dragging: true,
        measured: { width: 240, height: 120 },
      }),
    ];
    const next = [makeNode('users', { position: { x: 10, y: 10 } })];

    const result = preserveNodeMeasurements(next, current);

    expect(result[0].position).toEqual({ x: 480, y: 260 });
    expect(result[0].dragging).toBe(true);
    expect(result[0].measured).toEqual({ width: 240, height: 120 });
  });

  it('preserves explicit and initial dimensions', () => {
    const current = [
      makeNode('users', {
        width: 250,
        height: 130,
        initialWidth: 240,
        initialHeight: 120,
      }),
    ];
    const next = [makeNode('users')];

    const result = preserveNodeMeasurements(next, current);

    expect(result[0].width).toBe(250);
    expect(result[0].height).toBe(130);
    expect(result[0].initialWidth).toBe(240);
    expect(result[0].initialHeight).toBe(120);
  });
});
