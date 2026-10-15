import { useEffect, useState } from 'react';
import { useSchemaStore } from '../store';
import { api } from '../api';
import { AdrItem } from '../types';
import { X, BookOpen, ChevronDown, ChevronRight } from 'lucide-react';

export function DecisionsDrawer() {
  const activeDrawer = useSchemaStore((s) => s.activeDrawer);
  const setActiveDrawer = useSchemaStore((s) => s.setActiveDrawer);
  const projectId = useSchemaStore((s) => s.projectId);
  const selectedTable = useSchemaStore((s) => s.selectedTable);

  const [adrs, setAdrs] = useState<AdrItem[]>([]);
  const [filterByTable, setFilterByTable] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeDrawer === 'decisions' && projectId) {
      setLoading(true);
      const params = filterByTable && selectedTable ? { table: selectedTable } : undefined;
      api
        .getAdrs(projectId, params)
        .then((data) => setAdrs(data.adrs))
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [activeDrawer, projectId, selectedTable, filterByTable]);

  if (activeDrawer !== 'decisions') return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 440,
        backgroundColor: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.4)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BookOpen size={16} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 15 }}>Decisiones (ADRs)</span>
        </div>
        <button
          onClick={() => setActiveDrawer(null)}
          style={{ color: 'var(--text-muted)' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Filter toolbar */}
      {selectedTable && (
        <div
          style={{
            padding: '8px 20px',
            backgroundColor: 'var(--bg-tertiary)',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 12,
          }}
        >
          <span>Tabla: <strong>{selectedTable}</strong></span>
          <button
            onClick={() => setFilterByTable(!filterByTable)}
            style={{ color: 'var(--accent)', textDecoration: 'underline' }}
          >
            {filterByTable ? 'Ver todas las tablas' : 'Filtrar por esta tabla'}
          </button>
        </div>
      )}

      {/* ADR List */}
      <div style={{ padding: 20, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Cargando decisiones...</p>
        ) : adrs.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40 }}>
            <p>No se encontraron registros de decisiones {filterByTable && selectedTable ? `para ${selectedTable}` : ''}.</p>
          </div>
        ) : (
          adrs.map((adr) => {
            const isExpanded = expandedId === adr.metadata.id;
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
                  onClick={() => setExpandedId(isExpanded ? null : adr.metadata.id)}
                  style={{
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span style={{ fontWeight: 600, fontSize: 13 }}>
                      ADR-{adr.metadata.id}: {adr.metadata.title}
                    </span>
                  </div>
                  <span
                    className={`badge ${
                      adr.metadata.status === 'confirmado' ? 'badge-green' : 'badge-purple'
                    }`}
                  >
                    {adr.metadata.status}
                  </span>
                </div>

                {isExpanded && (
                  <div
                    style={{
                      padding: '12px 14px',
                      borderTop: '1px solid var(--border)',
                      fontSize: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                      backgroundColor: 'var(--bg-secondary)',
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--text-muted)' }}>Contexto:</strong>
                      <p style={{ marginTop: 2 }}>{adr.context || 'Sin contexto especificado.'}</p>
                    </div>

                    <div>
                      <strong style={{ color: 'var(--text-muted)' }}>Decisión:</strong>
                      <p style={{ marginTop: 2 }}>{adr.decision}</p>
                    </div>

                    {adr.alternatives.length > 0 && (
                      <div>
                        <strong style={{ color: 'var(--text-muted)' }}>Alternativas descartadas:</strong>
                        <ul style={{ marginTop: 2, paddingLeft: 16 }}>
                          {adr.alternatives.map((a, idx) => (
                            <li key={idx}>
                              <strong>{a.option}:</strong> {a.whyDiscarded}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {adr.consequences && (
                      <div>
                        <strong style={{ color: 'var(--text-muted)' }}>Consecuencias:</strong>
                        <p style={{ marginTop: 2 }}>{adr.consequences}</p>
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 4 }}>
                      Fecha: {adr.metadata.date} • Afecta: {adr.metadata.affects.join(', ')}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
