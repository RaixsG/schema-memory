import { useState } from 'react';
import { useSchemaStore } from '../store';
import { Column } from '../types';
import {
  Plus,
  Trash2,
  Edit3,
  X,
  Check,
  Database,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

export function Inspector() {
  const model = useSchemaStore((s) => s.model);
  const adrs = useSchemaStore((s) => s.adrs);
  const selectedTable = useSchemaStore((s) => s.selectedTable);
  const setSelectedTable = useSchemaStore((s) => s.setSelectedTable);
  const setActiveDrawer = useSchemaStore((s) => s.setActiveDrawer);
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

  const [expandedAdrId, setExpandedAdrId] = useState<string | null>(null);

  const table = model?.tables.find((t) => t.name === selectedTable);

  // Filter ADRs affecting the currently selected table (sorted newest first)
  const tableAdrs = table
    ? [...adrs]
        .filter((adr) =>
          adr.metadata.affects.some(
            (aff) => aff === table.name || aff.startsWith(`${table.name}.`)
          )
        )
        .sort((a, b) => b.metadata.id.localeCompare(a.metadata.id))
    : [];

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
        width: 340,
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
            title="Deseleccionar tabla"
            style={{ color: 'var(--text-muted)' }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
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

            {/* Table Recent Decisions (ADRs) */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <BookOpen size={13} color="var(--accent)" />
                  DECISIONES ({tableAdrs.length})
                </span>
                {tableAdrs.length > 0 && (
                  <button
                    onClick={() => setActiveDrawer('decisions')}
                    style={{
                      fontSize: 11,
                      color: 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                    title="Abrir panel completo de decisiones"
                  >
                    Ver todas <ExternalLink size={11} />
                  </button>
                )}
              </div>

              {tableAdrs.length === 0 ? (
                <div
                  style={{
                    padding: '10px 12px',
                    backgroundColor: 'var(--bg-tertiary)',
                    borderRadius: 6,
                    border: '1px dashed var(--border)',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  Sin decisiones registradas aún para <strong>{table.name}</strong>.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {tableAdrs.map((adr, idx) => {
                    // Expand the latest decision by default if user hasn't toggled any
                    const isExpanded =
                      expandedAdrId === adr.metadata.id ||
                      (expandedAdrId === null && idx === 0);
                    const tableSpecificCols = adr.metadata.affects
                      .filter((a) => a.startsWith(`${table.name}.`))
                      .map((a) => a.slice(table.name.length + 1));

                    return (
                      <div
                        key={adr.metadata.id}
                        style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          onClick={() =>
                            setExpandedAdrId(
                              isExpanded ? '__none__' : adr.metadata.id
                            )
                          }
                          style={{
                            padding: '8px 10px',
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: 6,
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                            <span style={{ marginTop: 2, color: 'var(--text-muted)' }}>
                              {isExpanded ? (
                                <ChevronDown size={13} />
                              ) : (
                                <ChevronRight size={13} />
                              )}
                            </span>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 12, lineHeight: 1.3 }}>
                                ADR-{adr.metadata.id}: {adr.metadata.title}
                              </div>
                              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                {adr.metadata.date}
                                {tableSpecificCols.length > 0 &&
                                  ` • Cols: ${tableSpecificCols.join(', ')}`}
                              </div>
                            </div>
                          </div>
                          <span
                            className={`badge ${
                              adr.metadata.status === 'confirmado'
                                ? 'badge-green'
                                : 'badge-purple'
                            }`}
                            style={{ flexShrink: 0, fontSize: 10 }}
                          >
                            {adr.metadata.status}
                          </span>
                        </div>

                        {isExpanded && (
                          <div
                            style={{
                              padding: '8px 10px',
                              borderTop: '1px solid var(--border)',
                              backgroundColor: 'var(--bg-primary)',
                              fontSize: 11,
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              lineHeight: 1.45,
                            }}
                          >
                            <div>
                              <strong style={{ color: 'var(--text-muted)' }}>Decisión:</strong>
                              <p style={{ marginTop: 2, color: 'var(--text-primary)' }}>
                                {adr.decision}
                              </p>
                            </div>
                            {adr.context && (
                              <div>
                                <strong style={{ color: 'var(--text-muted)' }}>Contexto:</strong>
                                <p style={{ marginTop: 2, color: 'var(--text-secondary)' }}>
                                  {adr.context}
                                </p>
                              </div>
                            )}
                            {adr.alternatives.length > 0 && (
                              <div>
                                <strong style={{ color: 'var(--text-muted)' }}>
                                  Alternativas descartadas:
                                </strong>
                                <ul style={{ marginTop: 2, paddingLeft: 14, color: 'var(--text-secondary)' }}>
                                  {adr.alternatives.map((alt, i) => (
                                    <li key={i}>
                                      <strong>{alt.option}:</strong> {alt.whyDiscarded}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        ) : (
          /* When no table is selected: Show Add Table Form */
          <div>
            <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Database size={15} color="var(--accent)" /> Crear Nueva Tabla
            </h4>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Selecciona una tabla en el canvas para ver sus columnas y últimas decisiones, o crea una tabla nueva.
            </p>
            <form onSubmit={handleAddTableSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="new_table_name"
                required
              />
              <button type="submit" className="btn btn-primary">
                <Plus size={14} /> Añadir Tabla
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
