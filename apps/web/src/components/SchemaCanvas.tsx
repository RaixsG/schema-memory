import { useMemo, useCallback, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  Panel,
  useReactFlow,
  Node,
  EdgeChange,
  MarkerType,
  Connection,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSchemaStore } from '../store';
import { TableNode } from './TableNode';
import { SchemaEdge } from './SchemaEdge';
import type { SchemaEdgeType } from './SchemaEdge';
import { Ref } from '../types';
import {
  formatRelationshipLabel,
  getRelationshipDisplay,
  isDuplicateRef,
  parseHandleId,
} from '../lib/relationships';
import { computeAutoLayout, type LayoutDirection } from '../lib/layout';
import { preserveNodeMeasurements } from '../lib/nodes';
import {
  ZoomIn,
  ZoomOut,
  Focus,
  Maximize,
  Minimize,
  Lock,
  Unlock,
  LayoutGrid,
} from 'lucide-react';

const nodeTypes = {
  table: TableNode,
};

const edgeTypes = {
  schema: SchemaEdge,
};

function CanvasControls({
  isLocked,
  onToggleLock,
  isFullscreen,
  onToggleFullscreen,
}: {
  isLocked: boolean;
  onToggleLock: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const model = useSchemaStore((state) => state.model);
  const layout = useSchemaStore((state) => state.layout);
  const applyLayout = useSchemaStore((state) => state.applyLayout);
  const projectId = useSchemaStore((state) => state.projectId);
  const autoLayoutProject = useRef<string | null>(null);

  const runAutoLayout = useCallback(
    async (direction: LayoutDirection = 'LR') => {
      if (!model || model.tables.length === 0) return;

      try {
        const nextLayout = await computeAutoLayout(
          model.tables,
          model.refs,
          direction
        );
        applyLayout(nextLayout);
        requestAnimationFrame(() => {
          fitView({ padding: 0.22, duration: 450 });
        });
      } catch (error) {
        console.error('Could not compute the automatic layout', error);
      }
    },
    [model, applyLayout, fitView]
  );

  useEffect(() => {
    if (!model || model.tables.length === 0) return;
    if (Object.keys(layout).length > 0) return;
    if (autoLayoutProject.current === projectId) return;

    autoLayoutProject.current = projectId;
    void runAutoLayout('LR');
  }, [model, layout, projectId, runAutoLayout]);

  return (
    <Controls showZoom={false} showFitView={false} showInteractive={false}>
      <ControlButton
        onClick={(event) =>
          void runAutoLayout(event.shiftKey ? 'TB' : 'LR')
        }
        title="Auto layout (Shift: vertical)"
        aria-label="Auto layout"
      >
        <LayoutGrid size={14} />
      </ControlButton>
      <ControlButton
        onClick={() => zoomIn({ duration: 300 })}
        title="Acercar (Zoom In)"
        aria-label="Acercar"
      >
        <ZoomIn size={14} />
      </ControlButton>
      <ControlButton
        onClick={() => zoomOut({ duration: 300 })}
        title="Alejar (Zoom Out)"
        aria-label="Alejar"
      >
        <ZoomOut size={14} />
      </ControlButton>
      <ControlButton
        onClick={() => fitView({ padding: 0.25, duration: 500 })}
        title="Centrar y ajustar vista"
        aria-label="Centrar y ajustar vista"
      >
        <Focus size={14} />
      </ControlButton>
      <ControlButton
        onClick={onToggleFullscreen}
        className={isFullscreen ? 'active' : ''}
        title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
        aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
      >
        {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
      </ControlButton>
      <ControlButton
        onClick={onToggleLock}
        className={isLocked ? 'active-warning' : ''}
        title={
          isLocked
            ? 'Desbloquear edición del esquema'
            : 'Bloquear canvas para evitar cambios accidentales'
        }
        aria-label={isLocked ? 'Desbloquear' : 'Bloquear'}
      >
        {isLocked ? <Lock size={14} color="#f59e0b" /> : <Unlock size={14} />}
      </ControlButton>
    </Controls>
  );
}

export function SchemaCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [hoveredTable, setHoveredTable] = useState<string | null>(null);
  const [hoveredEdgeIndex, setHoveredEdgeIndex] = useState<number | null>(null);

  const model = useSchemaStore((s) => s.model);
  const layout = useSchemaStore((s) => s.layout);
  const updateLayout = useSchemaStore((s) => s.updateLayout);
  const selectedTable = useSchemaStore((s) => s.selectedTable);
  const setSelectedTable = useSchemaStore((s) => s.setSelectedTable);
  const selectedEdgeIndex = useSchemaStore((s) => s.selectedEdgeIndex);
  const setSelectedEdgeIndex = useSchemaStore((s) => s.setSelectedEdgeIndex);
  const addRef = useSchemaStore((s) => s.addRef);
  const removeRef = useSchemaStore((s) => s.removeRef);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Listen to Escape key to deselect table or relationship
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedTable(null);
        setSelectedEdgeIndex(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSelectedTable, setSelectedEdgeIndex]);

const EMPTY_HIGHLIGHTS: Array<{ name: string; role: 'source' | 'target' }> = [];

  // Active relationship / table graph context
  const activeContext = useMemo(() => {
    const highlightedByTable = new Map<
      string,
      Array<{ name: string; role: 'source' | 'target' }>
    >();

    const addHighlight = (
      tableName: string,
      colName: string,
      role: 'source' | 'target'
    ) => {
      let list = highlightedByTable.get(tableName);
      if (!list) {
        list = [];
        highlightedByTable.set(tableName, list);
      }
      list.push({ name: colName, role });
    };

    const focusEdgeIndex =
      selectedEdgeIndex !== null
        ? selectedEdgeIndex
        : selectedTable
          ? null
          : hoveredEdgeIndex;
    const focusTable =
      selectedEdgeIndex !== null ? null : selectedTable ?? hoveredTable;

    if (!model) {
      return {
        selectedRef: null,
        activeTableNames: new Set<string>(),
        sourceTableName: null as string | null,
        targetTableName: null as string | null,
        connectedEdgeIndices: new Set<number>(),
        highlightedByTable,
        isFiltering: false,
      };
    }

    if (focusEdgeIndex !== null && model.refs[focusEdgeIndex]) {
      const ref = model.refs[focusEdgeIndex];
      const display = getRelationshipDisplay(ref);
      const source = ref[display.sourceSide];
      const target = ref[display.targetSide];
      const activeTableNames = new Set<string>([source.table, target.table]);

      source.columns.forEach((colName) =>
        addHighlight(source.table, colName, 'source')
      );
      target.columns.forEach((colName) =>
        addHighlight(target.table, colName, 'target')
      );

      return {
        selectedRef: ref,
        activeTableNames,
        sourceTableName: source.table,
        targetTableName: target.table,
        connectedEdgeIndices: new Set<number>([focusEdgeIndex]),
        highlightedByTable,
        isFiltering: true,
      };
    }

    if (focusTable) {
      const activeTableNames = new Set<string>([focusTable]);
      const connectedEdgeIndices = new Set<number>();

      model.refs.forEach((ref, idx) => {
        if (ref.from.table !== focusTable && ref.to.table !== focusTable) {
          return;
        }

        connectedEdgeIndices.add(idx);
        const display = getRelationshipDisplay(ref);
        const source = ref[display.sourceSide];
        const target = ref[display.targetSide];

        activeTableNames.add(source.table);
        activeTableNames.add(target.table);

        source.columns.forEach((column) =>
          addHighlight(source.table, column, 'source')
        );
        target.columns.forEach((column) =>
          addHighlight(target.table, column, 'target')
        );
      });

      return {
        selectedRef: null,
        activeTableNames,
        sourceTableName: null,
        targetTableName: null,
        connectedEdgeIndices,
        highlightedByTable,
        isFiltering: true,
      };
    }

    return {
      selectedRef: null,
      activeTableNames: new Set<string>(),
      sourceTableName: null,
      targetTableName: null,
      connectedEdgeIndices: new Set<number>(),
      highlightedByTable,
      isFiltering: false,
    };
  }, [
    model,
    selectedEdgeIndex,
    selectedTable,
    hoveredEdgeIndex,
    hoveredTable,
  ]);

  // Keep latest layout in ref so dragging a single node does not invalidate all TableNode memos
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // Build nodes from model.tables
  const initialNodes: Node[] = useMemo(() => {
    if (!model) return [];
    const currentLayout = layoutRef.current;
    return model.tables.map((table, index) => {
      const pos = currentLayout[table.name] || {
        x: 50 + (index % 3) * 320,
        y: 50 + Math.floor(index / 3) * 280,
      };

      const isSelected = selectedTable === table.name;
      const isDimmed = activeContext.isFiltering && !activeContext.activeTableNames.has(table.name);

      let isRelationshipEndpoint: 'source' | 'target' | null = null;
      if (activeContext.selectedRef) {
        if (table.name === activeContext.sourceTableName) {
          isRelationshipEndpoint = 'source';
        }
        if (table.name === activeContext.targetTableName) {
          isRelationshipEndpoint = 'target';
        }
      }

      const highlightedColumns =
        activeContext.highlightedByTable.get(table.name) ?? EMPTY_HIGHLIGHTS;

      return {
        id: table.name,
        type: 'table',
        position: pos,
        selected: isSelected,
        data: {
          name: table.name,
          columns: table.columns,
          note: table.note,
          isSelected,
          isDimmed,
          isRelationshipEndpoint,
          highlightedColumns,
        },
      };
    });
  }, [model, selectedTable, activeContext]);

  // Build edges from model.refs
  const initialEdges: SchemaEdgeType[] = useMemo(() => {
    if (!model) return [];

    const parallelGroups = new Map<string, number[]>();
    model.refs.forEach((ref, idx) => {
      const display = getRelationshipDisplay(ref);
      const source = ref[display.sourceSide].table;
      const target = ref[display.targetSide].table;
      const key = [source, target].sort().join('::');
      const group = parallelGroups.get(key) ?? [];
      group.push(idx);
      parallelGroups.set(key, group);
    });

    return model.refs.map((ref, idx) => {
      const display = getRelationshipDisplay(ref);
      const source = ref[display.sourceSide];
      const target = ref[display.targetSide];
      const groupKey = [source.table, target.table].sort().join('::');
      const group = parallelGroups.get(groupKey) ?? [idx];
      const parallelIndex = group.indexOf(idx);
      const parallelCount = group.length;

      const isSelectedEdge = selectedEdgeIndex === idx;
      const isConnectedToActive = activeContext.connectedEdgeIndices.has(idx);
      const isDimmed = activeContext.isFiltering && !isConnectedToActive;

      let strokeColor = 'var(--accent)';
      let strokeWidth = 1.5;
      let isAnimated = false;
      let zIndex = 0;
      let filter: string | undefined = undefined;

      if (isSelectedEdge) {
        strokeColor = '#3b82f6';
        strokeWidth = 3;
        isAnimated = true;
        zIndex = 100;
        filter = 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.75))';
      } else if (isConnectedToActive) {
        strokeColor = '#60a5fa';
        strokeWidth = 2.2;
        isAnimated = true;
        zIndex = 50;
      } else if (isDimmed) {
        strokeColor = 'rgba(255, 255, 255, 0.08)';
        strokeWidth = 1;
      }

      return {
        id: `ref-${idx}`,
        source: source.table,
        target: target.table,
        type: 'schema',
        animated: isAnimated,
        zIndex,
        selected: isSelectedEdge,
        interactionWidth: 20,
        data: {
          refIndex: idx,
          refLabel: formatRelationshipLabel(ref),
          relationLabel: display.visualLabel,
          sourceCardinality: display.sourceCardinality,
          targetCardinality: display.targetCardinality,
          isSelected: isSelectedEdge,
          isActive: isConnectedToActive,
          isDimmed,
          isManyToMany: ref.relation === 'many-to-many',
          parallelIndex,
          parallelCount,
        },
        style: {
          stroke: strokeColor,
          strokeWidth,
          filter,
          opacity: isDimmed ? 0.15 : 1,
          transition:
            'stroke 0.2s ease, stroke-width 0.2s ease, opacity 0.2s ease',
          strokeDasharray:
            ref.relation === 'many-to-many' ? '6 4' : undefined,
        },
        markerEnd:
          ref.relation === 'many-to-many'
            ? undefined
            : {
                type: MarkerType.ArrowClosed,
                color: strokeColor,
                width: isSelectedEdge ? 16 : 14,
                height: isSelectedEdge ? 16 : 14,
              },
      };
    });
  }, [model, selectedEdgeIndex, activeContext]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    // Rebuilt nodes lose their measured size, which makes React Flow hide them
    // until the ResizeObserver runs again. Keep the measurements to avoid the
    // hover-induced blink on the whole canvas.
    setNodes((currentNodes) =>
      preserveNodeMeasurements(initialNodes, currentNodes)
    );
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (isLocked) return;
      updateLayout(node.id, node.position);
    },
    [isLocked, updateLayout]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<SchemaEdgeType>[]) => {
      onEdgesChange(changes);

      const removals = changes.filter((change) => change.type === 'remove');
      if (removals.length === 0) return;

      const indices = removals
        .map((change) => Number(change.id.replace('ref-', '')))
        .filter((index) => Number.isInteger(index) && index >= 0)
        .sort((a, b) => b - a);

      for (const index of indices) {
        removeRef(index);
      }
    },
    [onEdgesChange, removeRef]
  );

  const isValidConnection = useCallback(
    (connection: Connection | SchemaEdgeType) => {
      if (!model || !connection.source || !connection.target) return false;

      const sourceColumn = parseHandleId(connection.sourceHandle);
      const targetColumn = parseHandleId(connection.targetHandle);
      if (!sourceColumn || !targetColumn) return false;

      const sourceTable = model.tables.find(
        (table) => table.name === connection.source
      );
      const targetTable = model.tables.find(
        (table) => table.name === connection.target
      );

      if (
        !sourceTable?.columns.some((column) => column.name === sourceColumn) ||
        !targetTable?.columns.some((column) => column.name === targetColumn)
      ) {
        return false;
      }

      const candidate: Ref = {
        from: { table: connection.source, columns: [sourceColumn] },
        to: { table: connection.target, columns: [targetColumn] },
        relation: 'many-to-one',
      };

      return !isDuplicateRef(model.refs, candidate);
    },
    [model]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (isLocked || !model) return;
      if (!params.source || !params.target) return;

      const sourceColumnName = parseHandleId(params.sourceHandle);
      const targetColumnName = parseHandleId(params.targetHandle);
      if (!sourceColumnName || !targetColumnName) return;

      const sourceTable = model.tables.find(
        (table) => table.name === params.source
      );
      const sourceColumn = sourceTable?.columns.find(
        (column) => column.name === sourceColumnName
      );
      const relation =
        sourceColumn?.pk || sourceColumn?.unique
          ? 'one-to-one'
          : 'many-to-one';

      const newRef: Ref = {
        from: { table: params.source, columns: [sourceColumnName] },
        to: { table: params.target, columns: [targetColumnName] },
        relation,
      };

      if (isDuplicateRef(model.refs, newRef)) return;
      addRef(newRef);
    },
    [isLocked, model, addRef]
  );

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--bg-primary)',
        position: 'relative',
      }}
    >
      {/* Floating Read-only Banner */}
      {isLocked && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(245, 158, 11, 0.18)',
            border: '1px solid var(--warning)',
            color: '#fde68a',
            padding: '6px 14px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 10,
            boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
          }}
        >
          <Lock size={13} color="#f59e0b" />
          <span>Modo solo lectura: esquema bloqueado</span>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={isLocked ? undefined : onNodesChange}
        onEdgesChange={isLocked ? undefined : handleEdgesChange}
        isValidConnection={isValidConnection}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={isLocked ? undefined : (_, node) => setSelectedTable(node.id)}
        onNodeMouseEnter={isLocked ? undefined : (_, node) => setHoveredTable(node.id)}
        onNodeMouseLeave={isLocked ? undefined : () => setHoveredTable(null)}
        onEdgeClick={
          isLocked
            ? undefined
            : (_, edge) => setSelectedEdgeIndex(Number(edge.id.replace('ref-', '')))
        }
        onEdgeMouseEnter={
          isLocked
            ? undefined
            : (_, edge) =>
                setHoveredEdgeIndex(Number(edge.id.replace('ref-', '')))
        }
        onEdgeMouseLeave={isLocked ? undefined : () => setHoveredEdgeIndex(null)}
        onPaneClick={
          isLocked
            ? undefined
            : () => {
                setSelectedTable(null);
                setSelectedEdgeIndex(null);
              }
        }
        onConnect={onConnect}
        nodesDraggable={!isLocked}
        nodesConnectable={!isLocked}
        elementsSelectable={!isLocked}
        fitView
      >
        <Background color="#232838" gap={20} size={1} />
        <CanvasControls
          isLocked={isLocked}
          onToggleLock={() => setIsLocked((prev) => !prev)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
        />
        <Panel position="bottom-right" style={{ pointerEvents: 'none' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              backgroundColor: 'rgba(17, 24, 39, 0.92)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '6px 10px',
              fontSize: 10,
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span>
              <span style={{ color: '#93c5fd', fontWeight: 800 }}>N</span> FK
            </span>
            <span>
              <span style={{ color: '#6ee7b7', fontWeight: 800 }}>1</span>{' '}
              referenciada
            </span>
            <span style={{ borderLeft: '1px solid var(--border)', paddingLeft: 10 }}>
              1:1
            </span>
            <span>1:N</span>
            <span style={{ borderTop: '1px dashed #94a3b8', paddingTop: 2 }}>
              N:M
            </span>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
