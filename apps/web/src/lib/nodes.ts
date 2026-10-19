import type { Node } from '@xyflow/react';

/**
 * React Flow stores measured dimensions on the user node object. When we rebuild
 * the nodes array (for example on hover), the new objects do not know those
 * dimensions. Re-adopting them without `measured` makes React Flow hide the
 * nodes until the ResizeObserver measures them again, which looks like a blink.
 *
 * This helper carries the previous measurements over to the freshly built nodes.
 */
export function preserveNodeMeasurements(
  nextNodes: Node[],
  currentNodeList: Node[]
): Node[] {
  if (currentNodeList.length === 0) return nextNodes;

  const currentById = new Map(currentNodeList.map((node) => [node.id, node]));

  return nextNodes.map((node) => {
    const current = currentById.get(node.id);
    if (!current) return node;

    const hasDimensions =
      current.measured !== undefined ||
      current.width !== undefined ||
      current.height !== undefined ||
      current.initialWidth !== undefined ||
      current.initialHeight !== undefined;

    if (!hasDimensions) return node;

    return {
      ...node,
      ...(current.measured !== undefined
        ? { measured: current.measured }
        : {}),
      ...(current.width !== undefined ? { width: current.width } : {}),
      ...(current.height !== undefined ? { height: current.height } : {}),
      ...(current.initialWidth !== undefined
        ? { initialWidth: current.initialWidth }
        : {}),
      ...(current.initialHeight !== undefined
        ? { initialHeight: current.initialHeight }
        : {}),
    };
  });
}
