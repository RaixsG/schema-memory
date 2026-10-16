import { useState } from 'react';
import { Column } from '../../types';

interface AddColumnFormProps {
  onAdd: (col: Column) => void;
  onCancel: () => void;
}

export function AddColumnForm({ onAdd, onCancel }: AddColumnFormProps) {
  const [colName, setColName] = useState('');
  const [colType, setColType] = useState('varchar');
  const [colPk, setColPk] = useState(false);
  const [colUnique, setColUnique] = useState(false);
  const [colNotNull, setColNotNull] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!colName.trim()) return;
    onAdd({
      name: colName.trim(),
      type: colType.trim(),
      pk: colPk,
      unique: colUnique,
      notNull: colNotNull,
    });
    setColName('');
    setColType('varchar');
    setColPk(false);
    setColUnique(false);
    setColNotNull(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
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
        autoFocus
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
          onClick={onCancel}
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
  );
}
