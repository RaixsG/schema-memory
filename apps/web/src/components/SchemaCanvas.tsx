import { useMemo, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
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

const nodeTypes = {
  table: TableNode,
};

export function SchemaCanvas() {
  const model = useSchemaStore((s) => s.model);
  const layout = useSchemaStore((s) => s.layout);
  const updateLayout = useSchemaStore((s) => s.updateLayout);
  const selectedTable = useSchemaStore((s) => s.selectedTable);
  const setSelectedTable = useSchemaStore((s) => s.setSelectedTable);
  const addRef = useSchemaStore((s) => s.addRef);

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
      updateLayout(node.id, node.position);
    },
    [updateLayout]
  );

  const onConnect = useCallback(
    (params: Connection) => {
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
    [addRef]
  );

  return (
    <div style={{ width: '100%', height: '100%', backgroundColor: 'var(--bg-primary)' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        fitView
      >
        <Background color="#232838" gap={20} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
