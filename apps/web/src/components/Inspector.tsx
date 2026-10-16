import { useSchemaStore } from '../store';
import { X } from 'lucide-react';
import { RelationshipInspector } from './inspector/RelationshipInspector';
import { TableInspector } from './inspector/TableInspector';
import { ColumnList } from './inspector/ColumnList';
import { TableAdrHistory } from './inspector/TableAdrHistory';
import { AddTableCard } from './inspector/AddTableCard';

export function Inspector() {
  const setSelectedTable = useSchemaStore((s) => s.setSelectedTable);
  const setSelectedEdgeIndex = useSchemaStore((s) => s.setSelectedEdgeIndex);

  const hasSelectedRef = useSchemaStore((s) =>
    s.selectedEdgeIndex !== null && !!s.model?.refs?.[s.selectedEdgeIndex]
  );
  const table = useSchemaStore((s) =>
    s.model?.tables.find((t) => t.name === s.selectedTable)
  );

  const isInspecting = hasSelectedRef || !!table;

  return (
    <div
      style={{
        width: 340,
        height: '100%',
        backgroundColor: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontWeight: 600,
            fontSize: 13,
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          {hasSelectedRef ? 'Relación' : 'Inspector'}
        </span>
        {isInspecting && (
          <button
            onClick={() => {
              setSelectedTable(null);
              setSelectedEdgeIndex(null);
            }}
            title="Deseleccionar"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Main body content */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
        {hasSelectedRef ? (
          <RelationshipInspector />
        ) : table ? (
          <>
            <TableInspector table={table} />
            <ColumnList table={table} />
            <TableAdrHistory tableName={table.name} />
          </>
        ) : (
          <AddTableCard />
        )}
      </div>
    </div>
  );
}
