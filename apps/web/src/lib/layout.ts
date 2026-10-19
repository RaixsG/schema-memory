import type { Ref, Table } from '../types';
import { getRelationshipDisplay } from './relationships';

export type LayoutDirection = 'LR' | 'TB';

const NODE_WIDTH = 240;
const HEADER_HEIGHT = 40;
const ROW_HEIGHT = 24;
const NODE_PADDING = 10;

export interface NodeSize {
  width: number;
  height: number;
}

export function estimateTableSize(table: Table): NodeSize {
  return {
    width: NODE_WIDTH,
    height: HEADER_HEIGHT + table.columns.length * ROW_HEIGHT + NODE_PADDING,
  };
}

export async function computeAutoLayout(
  tables: Table[],
  refs: Ref[],
  direction: LayoutDirection = 'LR'
): Promise<Record<string, { x: number; y: number }>> {
  const { default: dagre } = await import('@dagrejs/dagre');
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 100,
    marginx: 40,
    marginy: 40,
  });

  const sizes = new Map<string, NodeSize>();
  for (const table of tables) {
    const size = estimateTableSize(table);
    sizes.set(table.name, size);
    graph.setNode(table.name, size);
  }

  for (const ref of refs) {
    const display = getRelationshipDisplay(ref);
    const source = ref[display.sourceSide].table;
    const target = ref[display.targetSide].table;

    if (source !== target) {
      graph.setEdge(source, target);
    }
  }

  dagre.layout(graph);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const table of tables) {
    const node = graph.node(table.name);
    const size = sizes.get(table.name);
    if (!node || !size) continue;

    positions[table.name] = {
      x: node.x - size.width / 2,
      y: node.y - size.height / 2,
    };
  }

  return positions;
}
