import { useState } from 'react';
import { useSchemaStore } from '../../store';
import { Table } from '../../types';
import { Edit3, Trash2, X, Check } from 'lucide-react';

interface TableInspectorProps {
  table: Table;
}

export function TableInspector({ table }: TableInspectorProps) {
  const updateTable = useSchemaStore((s) => s.updateTable);
  const removeTable = useSchemaStore((s) => s.removeTable);

  const [editingTable, setEditingTable] = useState(false);
  const [tableNameInput, setTableNameInput] = useState('');
  const [tableNoteInput, setTableNoteInput] = useState('');

  const handleStartEditTable = () => {
    setTableNameInput(table.name);
    setTableNoteInput(table.note || '');
    setEditingTable(true);
  };

  const handleSaveTableEdit = () => {
    if (!tableNameInput.trim()) return;
    updateTable(table.name, tableNameInput.trim(), tableNoteInput.trim() || undefined);
    setEditingTable(false);
  };

  return (
    <div>
      {editingTable ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            value={tableNameInput}
            onChange={(e) => setTableNameInput(e.target.value)}
            placeholder="Table name"
            autoFocus
          />
          <input
            value={tableNoteInput}
            onChange={(e) => setTableNoteInput(e.target.value)}
            placeholder="Table description / note"
          />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setEditingTable(false)}
            >
              <X size={12} /> Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSaveTableEdit}>
              <Check size={12} /> Save
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>{table.name}</h3>
            {table.note && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {table.note}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="btn btn-secondary"
              style={{ padding: 4 }}
              onClick={handleStartEditTable}
              title="Edit table"
            >
              <Edit3 size={13} />
            </button>
            <button
              className="btn btn-danger"
              style={{ padding: 4 }}
              onClick={() => {
                if (confirm(`¿Eliminar tabla "${table.name}" y sus columnas?`)) {
                  removeTable(table.name);
                }
              }}
              title="Delete table"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
