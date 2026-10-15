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

  // Build nodes from model.tables
  const initialNodes: Node[] = useMemo(() => {
    if (!model) return [];
    return model.tables.map((table, index) => {
      const pos = layout[table.name] || {
        x: 50 + (index % 3) * 320,
        y: 50 + Math.floor(index / 3) * 280,
      };

      return {
        id: table.name,
        type: 'table',
        position: pos,
        data: {
          name: table.name,
          columns: table.columns,
          note: table.note,
          isSelected: selectedTable === table.name,
          onSelect: () => setSelectedTable(table.name),
        },
      };
    });
  }, [model, layout, selectedTable, setSelectedTable]);

  // Build edges from model.refs
  const initialEdges: Edge[] = useMemo(() => {
    if (!model) return [];
    return model.refs.map((ref, idx) => {
      const fromCol = ref.from.columns[0] || 'id';
      const toCol = ref.to.columns[0] || 'id';

      return {
        id: `ref-${ref.from.table}-${fromCol}-${ref.to.table}-${toCol}-${idx}`,
        source: ref.from.table,
        target: ref.to.table,
        sourceHandle: `${fromCol}-r`,
        targetHandle: `${toCol}-l`,
        animated: false,
        style: { stroke: 'var(--accent)', strokeWidth: 1.5 },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: 'var(--accent)',
          width: 14,
          height: 14,
        },
      };
    });
  }, [model]);

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
