import { useMemo, useCallback, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  ControlButton,
  useReactFlow,
  Node,
  Edge,
  MarkerType,
  Connection,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useSchemaStore } from '../store';
import { TableNode } from './TableNode';
import { Ref } from '../types';
import { ZoomIn, ZoomOut, Focus, Maximize, Minimize, Lock, Unlock } from 'lucide-react';

const nodeTypes = {
  table: TableNode,
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

  return (
    <Controls showZoom={false} showFitView={false} showInteractive={false}>
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

  const model = useSchemaStore((s) => s.model);
  const layout = useSchemaStore((s) => s.layout);
  const updateLayout = useSchemaStore((s) => s.updateLayout);
  const selectedTable = useSchemaStore((s) => s.selectedTable);
  const setSelectedTable = useSchemaStore((s) => s.setSelectedTable);
  const selectedEdgeIndex = useSchemaStore((s) => s.selectedEdgeIndex);
  const setSelectedEdgeIndex = useSchemaStore((s) => s.setSelectedEdgeIndex);
  const addRef = useSchemaStore((s) => s.addRef);

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

    if (selectedEdgeIndex !== null && model.refs[selectedEdgeIndex]) {
      const ref = model.refs[selectedEdgeIndex];
      const activeTableNames = new Set<string>([ref.from.table, ref.to.table]);
      ref.from.columns.forEach((colName) =>
        addHighlight(ref.from.table, colName, 'source')
      );
      ref.to.columns.forEach((colName) =>
        addHighlight(ref.to.table, colName, 'target')
      );
      return {
        selectedRef: ref,
        activeTableNames,
        sourceTableName: ref.from.table,
        targetTableName: ref.to.table,
        connectedEdgeIndices: new Set<number>([selectedEdgeIndex]),
        highlightedByTable,
        isFiltering: true,
      };
    }

    if (selectedTable) {
      const activeTableNames = new Set<string>([selectedTable]);
      const connectedEdgeIndices = new Set<number>();

      model.refs.forEach((r, idx) => {
        if (r.from.table === selectedTable || r.to.table === selectedTable) {
          connectedEdgeIndices.add(idx);
          activeTableNames.add(r.from.table);
          activeTableNames.add(r.to.table);

          if (r.to.table === selectedTable) {
            r.from.columns.forEach((c) => addHighlight(r.from.table, c, 'source'));
          }
          if (r.from.table === selectedTable) {
            r.to.columns.forEach((c) => addHighlight(r.to.table, c, 'target'));
          }
          if (r.from.table === selectedTable) {
            r.from.columns.forEach((c) => addHighlight(selectedTable, c, 'source'));
          }
          if (r.to.table === selectedTable) {
            r.to.columns.forEach((c) => addHighlight(selectedTable, c, 'target'));
          }
        }
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
  }, [model, selectedEdgeIndex, selectedTable]);

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
  const initialEdges: Edge[] = useMemo(() => {
    if (!model) return [];
    return model.refs.map((ref, idx) => {
      const fromCol = ref.from.columns[0] || 'id';
      const toCol = ref.to.columns[0] || 'id';

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

      // Format relation symbol / badge label
      let relationLabel = '';
      if (ref.relation === 'many-to-one') relationLabel = 'N : 1';
      else if (ref.relation === 'one-to-many') relationLabel = '1 : N';
      else if (ref.relation === 'one-to-one') relationLabel = '1 : 1';
      else if (ref.relation === 'many-to-many') relationLabel = 'N : M';

      return {
        id: `ref-${idx}`,
        source: ref.from.table,
        target: ref.to.table,
        sourceHandle: `${fromCol}-r`,
        targetHandle: `${toCol}-l`,
        type: 'smoothstep',
        animated: isAnimated,
        zIndex,
        selected: isSelectedEdge,
        interactionWidth: 20,
        label: isSelectedEdge || isConnectedToActive ? relationLabel : undefined,
        labelStyle: {
          fontSize: 10,
          fontWeight: 700,
          fill: isSelectedEdge ? '#93c5fd' : '#cbd5e1',
          fontFamily: 'var(--font-mono)',
        },
        labelBgStyle: {
          fill: '#1a1e2b',
          fillOpacity: 0.95,
          stroke: isSelectedEdge ? '#3b82f6' : 'var(--border)',
          strokeWidth: 1,
          rx: 4,
          ry: 4,
        },
        labelBgPadding: [6, 3] as [number, number],
        style: {
          stroke: strokeColor,
          strokeWidth,
          filter,
          opacity: isDimmed ? 0.15 : 1,
          transition: 'stroke 0.2s ease, stroke-width 0.2s ease, opacity 0.2s ease',
        },
        markerEnd: {
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
    setNodes(initialNodes);
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

  const onConnect = useCallback(
    (params: Connection) => {
      if (isLocked) return;
      if (!params.source || !params.target) return;
      const sourceCol = (params.sourceHandle || '').replace(/-[lr]$/, '');
      const targetCol = (params.targetHandle || '').replace(/-[lr]$/, '');

      const newRef: Ref = {
        from: { table: params.source, columns: [sourceCol] },
        to: { table: params.target, columns: [targetCol] },
        relation: 'many-to-one',
      };
      addRef(newRef);
    },
    [isLocked, addRef]
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
        onNodesChange={isLocked ? undefined : onNodesChange}
        onEdgesChange={isLocked ? undefined : onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={isLocked ? undefined : (_, node) => setSelectedTable(node.id)}
        onEdgeClick={
          isLocked
            ? undefined
            : (_, edge) => setSelectedEdgeIndex(Number(edge.id.replace('ref-', '')))
        }
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
      </ReactFlow>
    </div>
  );
}
