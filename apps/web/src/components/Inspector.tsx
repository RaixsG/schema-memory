import { useState } from 'react';
import { useSchemaStore } from '../store';
import { Column } from '../types';
import { Plus, Trash2, Edit3, X, Check, Database } from 'lucide-react';

export function Inspector() {
  const model = useSchemaStore((s) => s.model);
  const selectedTable = useSchemaStore((s) => s.selectedTable);
  const setSelectedTable = useSchemaStore((s) => s.setSelectedTable);
  const addTable = useSchemaStore((s) => s.addTable);
  const updateTable = useSchemaStore((s) => s.updateTable);
  const removeTable = useSchemaStore((s) => s.removeTable);
  const addColumn = useSchemaStore((s) => s.addColumn);
  const removeColumn = useSchemaStore((s) => s.removeColumn);

  // Local form states
  const [newTableName, setNewTableName] = useState('');
  const [editingTable, setEditingTable] = useState(false);
  const [tableNameInput, setTableNameInput] = useState('');
  const [tableNoteInput, setTableNoteInput] = useState('');

  const [isAddingCol, setIsAddingCol] = useState(false);
  const [colName, setColName] = useState('');
  const [colType, setColType] = useState('varchar');
  const [colPk, setColPk] = useState(false);
  const [colUnique, setColUnique] = useState(false);
  const [colNotNull, setColNotNull] = useState(false);

  const table = model?.tables.find((t) => t.name === selectedTable);

  const handleStartEditTable = () => {
    if (!table) return;
    setTableNameInput(table.name);
    setTableNoteInput(table.note || '');
    setEditingTable(true);
  };

  const handleSaveTableEdit = () => {
    if (!table || !tableNameInput.trim()) return;
    updateTable(table.name, tableNameInput.trim(), tableNoteInput.trim() || undefined);
    setEditingTable(false);
  };

  const handleAddTableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableName.trim()) return;
    addTable(newTableName.trim());
    setNewTableName('');
  };

  const handleAddColSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!table || !colName.trim()) return;
    const col: Column = {
      name: colName.trim(),
      type: colType.trim(),
      pk: colPk,
      unique: colUnique,
      notNull: colNotNull,
    };
    addColumn(table.name, col);
    setColName('');
    setColType('varchar');
    setColPk(false);
    setColUnique(false);
    setColNotNull(false);
    setIsAddingCol(false);
  };

  return (
    <div
      style={{
        width: 320,
        height: '100%',
        backgroundColor: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontWeight: 600, fontSize: 13, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Inspector
        </span>
        {table && (
          <button
            onClick={() => setSelectedTable(null)}
            title="Deselect table"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {table ? (
          <>
            {/* Table Header Details */}
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
                    <button className="btn btn-secondary" onClick={() => setEditingTable(false)}>
                      <X size={12} /> Cancel
                    </button>
                    <button className="btn btn-primary" onClick={handleSaveTableEdit}>
                      <Check size={12} /> Save
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700 }}>{table.name}</h3>
                    {table.note && (
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{table.note}</p>
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
                      onClick={() => removeTable(table.name)}
                      title="Delete table"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Columns List */}
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
                  COLUMNS ({table.columns.length})
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '3px 8px', fontSize: 11 }}
                  onClick={() => setIsAddingCol(true)}
                >
                  <Plus size={12} /> Add
                </button>
              </div>

              {isAddingCol && (
                <form
                  onSubmit={handleAddColSubmit}
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    padding: 10,
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    marginBottom: 10,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <input
                    placeholder="column_name"
                    value={colName}
                    onChange={(e) => setColName(e.target.value)}
                    required
                  />
                  <select value={colType} onChange={(e) => setColType(e.target.value)}>
                    <option value="varchar">varchar</option>
                    <option value="text">text</option>
                    <option value="integer">integer</option>
                    <option value="bigint">bigint</option>
                    <option value="boolean">boolean</option>
                    <option value="timestamp">timestamp</option>
                    <option value="decimal(10,2)">decimal(10,2)</option>
                    <option value="jsonb">jsonb</option>
                  </select>
                  <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="checkbox"
                        checked={colPk}
                        onChange={(e) => setColPk(e.target.checked)}
                      />
                      PK
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="checkbox"
                        checked={colUnique}
                        onChange={(e) => setColUnique(e.target.checked)}
                      />
                      Unique
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input
                        type="checkbox"
                        checked={colNotNull}
                        onChange={(e) => setColNotNull(e.target.checked)}
                      />
                      Not Null
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                      onClick={() => setIsAddingCol(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ padding: '4px 8px', fontSize: 11 }}
                    >
                      Add Column
                    </button>
                  </div>
                </form>
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
                      {c.pk && <span className="badge badge-yellow" style={{ marginLeft: 6 }}>PK</span>}
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
          </>
        ) : (
          /* When no table is selected: Show Add Table Form */
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Database size={15} color="var(--accent)" /> Create New Table
            </h4>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Select a table on the canvas to inspect its fields, or add a new table to the schema.
            </p>
            <form onSubmit={handleAddTableSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="new_table_name"
                required
              />
              <button type="submit" className="btn btn-primary">
                <Plus size={14} /> Add Table
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
