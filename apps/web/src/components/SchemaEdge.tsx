import { memo, useMemo, type CSSProperties } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useInternalNode,
  Position,
  type Edge,
  type EdgeProps,
  type InternalNode,
} from '@xyflow/react';
import type { Cardinality } from '../lib/relationships';

export interface SchemaEdgeData extends Record<string, unknown> {
  refIndex: number;
  refLabel: string;
  relationLabel: string;
  sourceCardinality: Cardinality;
  targetCardinality: Cardinality;
  isSelected: boolean;
  isActive: boolean;
  isDimmed: boolean;
  isManyToMany: boolean;
  onDelete?: string;
  onUpdate?: string;
  parallelIndex: number;
  parallelCount: number;
}

export type SchemaEdgeType = Edge<SchemaEdgeData, 'schema'>;

const cascadeChipStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  color: '#fbbf24',
  backgroundColor: 'rgba(251, 191, 36, 0.12)',
  border: '1px solid rgba(251, 191, 36, 0.35)',
  borderRadius: 3,
  padding: '1px 4px',
  textTransform: 'uppercase',
};

interface FloatingEdgeParams {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  sourcePos: Position;
  targetPos: Position;
  isSelfLoop: boolean;
  selfLoopPath?: string;
  selfLoopLabelX?: number;
  selfLoopLabelY?: number;
}

function getNodeDimensions(node: InternalNode): { width: number; height: number } {
  return {
    width: node.measured?.width ?? 240,
    height: node.measured?.height ?? 80,
  };
}

function getNodeIntersection(
  node: InternalNode,
  target: InternalNode
): { x: number; y: number } {
  const position = node.internals.positionAbsolute;
  const { width, height } = getNodeDimensions(node);
  const targetPosition = target.internals.positionAbsolute;
  const targetSize = getNodeDimensions(target);

  const w = width / 2;
  const h = height / 2;
  const x2 = position.x + w;
  const y2 = position.y + h;
  const x1 = targetPosition.x + targetSize.width / 2;
  const y1 = targetPosition.y + targetSize.height / 2;

  const xx1 = (x1 - x2) / (2 * w) - (y1 - y2) / (2 * h);
  const yy1 = (x1 - x2) / (2 * w) + (y1 - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  const x = w * (xx3 + yy3) + x2;
  const y = h * (-xx3 + yy3) + y2;

  return { x, y };
}

function getEdgePosition(
  node: InternalNode,
  point: { x: number; y: number }
): Position {
  const position = node.internals.positionAbsolute;
  const { width, height } = getNodeDimensions(node);
  const nx = Math.round(position.x);
  const ny = Math.round(position.y);
  const px = Math.round(point.x);
  const py = Math.round(point.y);

  if (px <= nx + 1) return Position.Left;
  if (px >= nx + width - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  if (py >= ny + height - 1) return Position.Bottom;

  return Position.Top;
}

function shiftPointForParallelEdge(
  point: { x: number; y: number },
  position: Position,
  offset: number
): { x: number; y: number } {
  if (position === Position.Left || position === Position.Right) {
    return { x: point.x, y: point.y + offset };
  }
  return { x: point.x + offset, y: point.y };
}

function getSelfLoopParams(node: InternalNode): FloatingEdgeParams {
  const position = node.internals.positionAbsolute;
  const { width, height } = getNodeDimensions(node);
  const sx = position.x + width;
  const sy = position.y + height * 0.35;
  const tx = position.x + width * 0.7;
  const ty = position.y;
  const path = `M ${sx},${sy} C ${sx + 80},${sy - 20} ${
    tx + 80
  },${ty - 80} ${tx},${ty}`;

  return {
    sx,
    sy,
    tx,
    ty,
    sourcePos: Position.Right,
    targetPos: Position.Top,
    isSelfLoop: true,
    selfLoopPath: path,
    selfLoopLabelX: sx + 55,
    selfLoopLabelY: sy - 45,
  };
}

function getFloatingEdgeParams(
  sourceNode: InternalNode,
  targetNode: InternalNode,
  parallelIndex: number,
  parallelCount: number
): FloatingEdgeParams {
  if (sourceNode.id === targetNode.id) {
    return getSelfLoopParams(sourceNode);
  }

  const sourcePoint = getNodeIntersection(sourceNode, targetNode);
  const targetPoint = getNodeIntersection(targetNode, sourceNode);
  const sourcePos = getEdgePosition(sourceNode, sourcePoint);
  const targetPos = getEdgePosition(targetNode, targetPoint);
  const parallelOffset =
    parallelCount > 1
      ? (parallelIndex - (parallelCount - 1) / 2) * 14
      : 0;
  const sourceShifted = shiftPointForParallelEdge(
    sourcePoint,
    sourcePos,
    parallelOffset
  );
  const targetShifted = shiftPointForParallelEdge(
    targetPoint,
    targetPos,
    parallelOffset
  );

  return {
    sx: sourceShifted.x,
    sy: sourceShifted.y,
    tx: targetShifted.x,
    ty: targetShifted.y,
    sourcePos,
    targetPos,
    isSelfLoop: false,
  };
}

function offsetBadge(
  point: { x: number; y: number },
  position: Position,
  distance = 14
): { x: number; y: number } {
  switch (position) {
    case Position.Left:
      return { x: point.x - distance, y: point.y };
    case Position.Right:
      return { x: point.x + distance, y: point.y };
    case Position.Top:
      return { x: point.x, y: point.y - distance };
    case Position.Bottom:
      return { x: point.x, y: point.y + distance };
    default:
      return point;
  }
}

function cardinalityColor(cardinality: Cardinality): string {
  return cardinality === '1' ? '#6ee7b7' : '#93c5fd';
}

export const SchemaEdge = memo(function SchemaEdge({
  id,
  source,
  target,
  data,
  style,
  markerEnd,
  markerStart,
  selected,
}: EdgeProps<SchemaEdgeType>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  const params = useMemo(() => {
    if (!sourceNode || !targetNode) return null;
    return getFloatingEdgeParams(
      sourceNode,
      targetNode,
      data?.parallelIndex ?? 0,
      data?.parallelCount ?? 1
    );
  }, [
    sourceNode,
    targetNode,
    data?.parallelIndex,
    data?.parallelCount,
  ]);

  if (!sourceNode || !targetNode || !params) {
    return null;
  }

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (params.isSelfLoop && params.selfLoopPath) {
    edgePath = params.selfLoopPath;
    labelX = params.selfLoopLabelX ?? params.sx;
    labelY = params.selfLoopLabelY ?? params.sy;
  } else {
    [edgePath, labelX, labelY] = getSmoothStepPath({
      sourceX: params.sx,
      sourceY: params.sy,
      sourcePosition: params.sourcePos,
      targetX: params.tx,
      targetY: params.ty,
      targetPosition: params.targetPos,
      borderRadius: 10,
      offset: 24,
    });
  }

  const sourceBadge = offsetBadge(
    { x: params.sx, y: params.sy },
    params.sourcePos
  );
  const targetBadge = offsetBadge(
    { x: params.tx, y: params.ty },
    params.targetPos
  );
  const showDetails =
    (selected || data?.isActive) && !data?.isDimmed && !!data?.refLabel;
  const badgeOpacity = data?.isDimmed ? 0.25 : 1;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        markerStart={markerStart}
        style={style}
        interactionWidth={20}
      />

      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${sourceBadge.x}px, ${sourceBadge.y}px)`,
            pointerEvents: 'none',
            opacity: badgeOpacity,
            fontSize: 9,
            fontWeight: 800,
            lineHeight: 1,
            color: cardinalityColor(data?.sourceCardinality ?? 'N'),
            backgroundColor: '#111827',
            border: `1px solid ${cardinalityColor(
              data?.sourceCardinality ?? 'N'
            )}`,
            borderRadius: 999,
            padding: '3px 5px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {data?.sourceCardinality ?? 'N'}
        </div>

        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${targetBadge.x}px, ${targetBadge.y}px)`,
            pointerEvents: 'none',
            opacity: badgeOpacity,
            fontSize: 9,
            fontWeight: 800,
            lineHeight: 1,
            color: cardinalityColor(data?.targetCardinality ?? '1'),
            backgroundColor: '#111827',
            border: `1px solid ${cardinalityColor(
              data?.targetCardinality ?? '1'
            )}`,
            borderRadius: 999,
            padding: '3px 5px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {data?.targetCardinality ?? '1'}
        </div>

        {showDetails && (
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#111827',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '4px 7px',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
              whiteSpace: 'nowrap',
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ color: '#93c5fd' }}>{data?.refLabel}</span>
            <span
              style={{
                fontSize: 9,
                fontWeight: 800,
                color: '#cbd5e1',
                backgroundColor: 'rgba(148, 163, 184, 0.15)',
                borderRadius: 4,
                padding: '1px 4px',
              }}
            >
              {data?.relationLabel}
            </span>
            {data?.onDelete && (
              <span style={cascadeChipStyle}>DEL {data.onDelete}</span>
            )}
            {data?.onUpdate && (
              <span style={cascadeChipStyle}>UPD {data.onUpdate}</span>
            )}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
});
