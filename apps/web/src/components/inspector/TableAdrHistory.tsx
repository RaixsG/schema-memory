import { useState } from 'react';
import { useSchemaStore } from '../../store';
import { BookOpen, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react';

interface TableAdrHistoryProps {
  tableName: string;
}

export function TableAdrHistory({ tableName }: TableAdrHistoryProps) {
  const adrs = useSchemaStore((s) => s.adrs);
  const setActiveDrawer = useSchemaStore((s) => s.setActiveDrawer);

  const [expandedAdrId, setExpandedAdrId] = useState<string | null>(null);

  // Filter ADRs affecting the currently selected table (sorted newest first)
  const tableAdrs = [...adrs]
    .filter((adr) =>
      adr.metadata.affects.some(
        (aff) => aff === tableName || aff.startsWith(`${tableName}.`)
      )
    )
    .sort((a, b) => b.metadata.id.localeCompare(a.metadata.id));

  return (
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
          Sin decisiones registradas aún para <strong>{tableName}</strong>.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tableAdrs.map((adr, idx) => {
            const isExpanded =
              expandedAdrId === adr.metadata.id ||
              (expandedAdrId === null && idx === 0);
            const tableSpecificCols = adr.metadata.affects
              .filter((a) => a.startsWith(`${tableName}.`))
              .map((a) => a.slice(tableName.length + 1));

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
                    setExpandedAdrId(isExpanded ? '__none__' : adr.metadata.id)
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
                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
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
                        <ul
                          style={{
                            marginTop: 2,
                            paddingLeft: 14,
                            color: 'var(--text-secondary)',
                          }}
                        >
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
  );
}
