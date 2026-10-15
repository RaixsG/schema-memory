import { useState } from 'react';
import { useSchemaStore } from '../store';
import { X, AlertTriangle, Trash2, Copy, Check, MessageSquare } from 'lucide-react';

export function PendingDrawer() {
  const activeDrawer = useSchemaStore((s) => s.activeDrawer);
  const setActiveDrawer = useSchemaStore((s) => s.setActiveDrawer);
  const pending = useSchemaStore((s) => s.pending);
  const projectId = useSchemaStore((s) => s.projectId);
  const discardPending = useSchemaStore((s) => s.discardPending);

  const [copied, setCopied] = useState(false);

  if (activeDrawer !== 'pending') return null;

  const promptText = `Revisa los cambios pendientes en el esquema del proyecto "${projectId}" mediante MCP y debatamos las razones para generar un ADR.`;

  const handleCopy = () => {
    navigator.clipboard.writeText(promptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 420,
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
          <span style={{ fontWeight: 700, fontSize: 15 }}>Cambios Pendientes</span>
          {pending && (
            <span className="badge badge-yellow">
              {pending.changes.length} cambio(s)
            </span>
          )}
        </div>
        <button
          onClick={() => setActiveDrawer(null)}
          style={{ color: 'var(--text-muted)' }}
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: 20, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {pending ? (
          <>
            {pending.stale && (
              <div
                style={{
                  backgroundColor: 'var(--danger-bg)',
                  border: '1px solid var(--danger)',
                  borderRadius: 6,
                  padding: 12,
                  display: 'flex',
                  gap: 10,
                  fontSize: 13,
                  color: '#fca5a5',
                }}
              >
                <AlertTriangle size={18} color="var(--danger)" style={{ flexShrink: 0 }} />
                <div>
                  <strong>Cambio Desactualizado (Stale):</strong> El archivo <code>schema.dbml</code> en el disco ha cambiado desde que se propuso este cambio. Te recomendamos descartarlo o re-evaluarlo con tu agente.
                </div>
              </div>
            )}

            <div>
              <h4 style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}>
                DIFERENCIAS ESTRUCTURALES
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pending.changes.map((c, i) => (
                  <div
                    key={i}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'var(--bg-tertiary)',
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: 'var(--font-mono)',
                      borderLeft: `3px solid ${
                        c.kind.endsWith('_added')
                          ? 'var(--success)'
                          : c.kind.endsWith('_removed')
                            ? 'var(--danger)'
                            : 'var(--warning)'
                      }`,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{c.kind}</div>
                    <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                      {c.table && `Table: ${c.table}`}
                      {c.column && ` • Column: ${c.column}`}
                      {c.name && ` • Name: ${c.name}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Confirmation Instruction Box */}
            <div
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--accent)',
                borderRadius: 8,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontWeight: 600, fontSize: 13 }}>
                <MessageSquare size={16} />
                <span>Confirmación con IA (MCP)</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Por diseño, los cambios de esquema requieren debatir el <em>por qué</em> con tu agente de IA antes de aplicarse al código. Copia este mensaje y envíalo a tu agente:
              </p>
              <div
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  padding: 10,
                  borderRadius: 6,
                  fontSize: 12,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-primary)',
                  position: 'relative',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>{promptText}</span>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 10px', fontSize: 11, marginLeft: 8, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}
                  onClick={handleCopy}
                >
                  {copied ? (
                    <>
                      <Check size={13} color="var(--success)" />
                      <span style={{ color: 'var(--success)', fontWeight: 600 }}>Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy size={13} />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Discard Button */}
            <div style={{ marginTop: 'auto', paddingTop: 16 }}>
              <button
                className="btn btn-danger"
                style={{ width: '100%' }}
                onClick={discardPending}
              >
                <Trash2 size={14} /> Descartar Cambios Pendientes
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 60 }}>
            <p>No hay cambios pendientes de esquema.</p>
            <p style={{ fontSize: 12, marginTop: 4 }}>
              Cualquier modificación que hagas en las tablas o columnas aparecerá aquí para ser debatida y documentada.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
