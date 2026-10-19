import { useSchemaStore } from '../../store';
import { Link2, Hash, Trash2 } from 'lucide-react';
import { getRelationshipDisplay } from '../../lib/relationships';

export function RelationshipInspector() {
  const selectedEdgeIndex = useSchemaStore((s) => s.selectedEdgeIndex);
  const selectedRef = useSchemaStore((s) =>
    s.selectedEdgeIndex !== null && s.model?.refs ? s.model.refs[s.selectedEdgeIndex] : null
  );
  const updateRef = useSchemaStore((s) => s.updateRef);
  const removeRef = useSchemaStore((s) => s.removeRef);
  const setSelectedTable = useSchemaStore((s) => s.setSelectedTable);

  if (!selectedRef || selectedEdgeIndex === null) {
    return null;
  }

  const display = getRelationshipDisplay(selectedRef);
  const source = selectedRef[display.sourceSide];
  const target = selectedRef[display.targetSide];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header / Title */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <Link2 size={16} color="#3b82f6" />
          <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
            {selectedRef.name || 'Foreign Key'}
          </h3>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {display.fkSide
            ? 'La flecha va desde la tabla con FK hacia la tabla referenciada.'
            : 'Relación sin un lado FK único.'}
        </p>
      </div>

      {/* Visual Endpoints Card */}
      <div
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {/* Source Endpoint */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#93c5fd',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {display.fkSide ? 'Tabla con FK' : 'Tabla A'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Hash size={13} color="#3b82f6" />
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                {source.table}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>.</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#93c5fd' }}>
                {source.columns.join(', ')}
              </span>
            </div>
            <button
              className="btn btn-secondary"
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => setSelectedTable(source.table)}
              title={`Inspeccionar tabla ${source.table}`}
            >
              Ver tabla
            </button>
          </div>
        </div>

        {/* Arrow divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: 'var(--text-muted)',
          }}
        >
          <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              backgroundColor: 'rgba(59, 130, 246, 0.2)',
              color: '#93c5fd',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              padding: '2px 8px',
              borderRadius: 12,
            }}
          >
            {display.relationLabel}
          </span>
          <div style={{ flex: 1, height: 1, backgroundColor: 'var(--border)' }} />
        </div>

        {/* Target Endpoint */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: '#6ee7b7',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            {display.referencedSide ? 'Tabla referenciada' : 'Tabla B'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Hash size={13} color="#10b981" />
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                {target.table}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>.</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#6ee7b7' }}>
                {target.columns.join(', ')}
              </span>
            </div>
            <button
              className="btn btn-secondary"
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => setSelectedTable(target.table)}
              title={`Inspeccionar tabla ${target.table}`}
            >
              Ver tabla
            </button>
          </div>
        </div>
      </div>

      {/* Cardinality settings */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Tipo de Cardinalidad
        </label>
        <select
          value={selectedRef.relation}
          onChange={(e) =>
            updateRef(selectedEdgeIndex, {
              relation: e.target.value as any,
            })
          }
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            color: 'var(--text-primary)',
            borderRadius: 6,
            padding: '6px 10px',
            fontSize: 12,
          }}
        >
          <option value="many-to-one">Many to One (N : 1) — Predeterminada</option>
          <option value="one-to-many">One to Many (1 : N)</option>
          <option value="one-to-one">One to One (1 : 1)</option>
          <option value="many-to-many">Many to Many (N : M)</option>
        </select>
      </div>

      {/* Cascade rules: onDelete / onUpdate */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Reglas de Integridad Referencial
        </span>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>On Delete</label>
            <select
              value={selectedRef.onDelete || ''}
              onChange={(e) =>
                updateRef(selectedEdgeIndex, {
                  onDelete: e.target.value || undefined,
                })
              }
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                borderRadius: 6,
                padding: '5px 8px',
                fontSize: 11,
              }}
            >
              <option value="">(ninguno)</option>
              <option value="cascade">CASCADE</option>
              <option value="set null">SET NULL</option>
              <option value="restrict">RESTRICT</option>
              <option value="no action">NO ACTION</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>On Update</label>
            <select
              value={selectedRef.onUpdate || ''}
              onChange={(e) =>
                updateRef(selectedEdgeIndex, {
                  onUpdate: e.target.value || undefined,
                })
              }
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                borderRadius: 6,
                padding: '5px 8px',
                fontSize: 11,
              }}
            >
              <option value="">(ninguno)</option>
              <option value="cascade">CASCADE</option>
              <option value="restrict">RESTRICT</option>
              <option value="no action">NO ACTION</option>
            </select>
          </div>
        </div>
      </div>

      {/* Delete Relationship Action */}
      <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
        <button
          className="btn btn-danger"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
          onClick={() => {
            if (
              confirm(
                `¿Eliminar relación entre ${selectedRef.from.table} y ${selectedRef.to.table}?`
              )
            ) {
              removeRef(selectedEdgeIndex);
            }
          }}
        >
          <Trash2 size={13} /> Desvincular Relación
        </button>
      </div>
    </div>
  );
}
