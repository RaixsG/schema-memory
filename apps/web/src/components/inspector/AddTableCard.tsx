import { useState } from 'react';
import { useSchemaStore } from '../../store';
import { Database, Plus } from 'lucide-react';

export function AddTableCard() {
  const addTable = useSchemaStore((s) => s.addTable);
  const [newTableName, setNewTableName] = useState('');

  const handleAddTableSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableName.trim()) return;
    addTable(newTableName.trim());
    setNewTableName('');
  };

  return (
    <div>
      <h4
        style={{
          fontSize: 14,
          fontWeight: 600,
          marginBottom: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Database size={15} color="var(--accent)" /> Crear Nueva Tabla
      </h4>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
        Selecciona una tabla en el canvas para ver sus columnas y últimas decisiones, o crea una tabla nueva.
      </p>
      <form
        onSubmit={handleAddTableSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
      >
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
  );
}
