import { useState } from 'react';
import { useSchemaStore } from '../../store';
import { Table, Column } from '../../types';
import { Plus, Trash2 } from 'lucide-react';
import { AddColumnForm } from './AddColumnForm';

interface ColumnListProps {
  table: Table;
}

export function ColumnList({ table }: ColumnListProps) {
  const addColumn = useSchemaStore((s) => s.addColumn);
  const removeColumn = useSchemaStore((s) => s.removeColumn);

  const [isAddingCol, setIsAddingCol] = useState(false);

  const handleAddCol = (col: Column) => {
    addColumn(table.name, col);
    setIsAddingCol(false);
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
          COLUMNAS ({table.columns.length})
        </span>
        <button
          className="btn btn-secondary"
          style={{ padding: '3px 8px', fontSize: 11 }}
          onClick={() => setIsAddingCol(true)}
        >
          <Plus size={12} /> Añadir
        </button>
      </div>

      {isAddingCol && (
        <AddColumnForm
          onAdd={handleAddCol}
          onCancel={() => setIsAddingCol(false)}
        />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {table.columns.map((c) => (
          <div
            key={c.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 8px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 4,
              fontSize: 12,
            }}
          >
            <div>
              <span style={{ fontWeight: 600 }}>{c.name}</span>{' '}
              <span style={{ color: 'var(--text-muted)' }}>{c.type}</span>
              {c.pk && (
                <span className="badge badge-yellow" style={{ marginLeft: 6 }}>
                  PK
                </span>
              )}
            </div>
            <button
              onClick={() => removeColumn(table.name, c.name)}
              style={{ color: 'var(--text-muted)', padding: 2 }}
              title="Remove column"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
