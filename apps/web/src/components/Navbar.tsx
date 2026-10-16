import { useEffect, useState } from 'react';
import { useSchemaStore } from '../store';
import { Database, BookOpen, Clock, Plus, AlertCircle, RefreshCw } from 'lucide-react';

export function Navbar({ onGoHome }: { onGoHome: () => void }) {
  const projectId = useSchemaStore((s) => s.projectId);
  const projectName = useSchemaStore((s) => s.projectName);
  const projectDialect = useSchemaStore((s) => s.projectDialect);
  const pending = useSchemaStore((s) => s.pending);
  const adrs = useSchemaStore((s) => s.adrs);
  const lastSyncedAt = useSchemaStore((s) => s.lastSyncedAt);
  const activeDrawer = useSchemaStore((s) => s.activeDrawer);
  const setActiveDrawer = useSchemaStore((s) => s.setActiveDrawer);
  const setAddModalOpen = useSchemaStore((s) => s.setAddModalOpen);

  const [justSynced, setJustSynced] = useState(false);

  useEffect(() => {
    if (!lastSyncedAt) return;
    setJustSynced(true);
    const timer = setTimeout(() => setJustSynced(false), 4500);
    return () => clearTimeout(timer);
  }, [lastSyncedAt]);

  return (
    <header
      style={{
        height: 52,
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        flexShrink: 0,
        zIndex: 10,
      }}
    >
      {/* Brand & Project Selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div
          onClick={onGoHome}
          style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Database size={16} color="white" />
          </div>
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: '-0.3px' }}>
            schema-memory
          </span>
        </div>

        {projectId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12, borderLeft: '1px solid var(--border)' }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
              {projectName}
            </span>
            <span className="badge badge-gray">{projectDialect}</span>
            {justSynced && (
              <span
                className="badge badge-green"
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <RefreshCw size={11} /> Sincronizado con agente
              </span>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          className="btn btn-secondary"
          onClick={() => setAddModalOpen(true)}
          style={{ fontSize: 12, padding: '5px 10px' }}
        >
          <Plus size={14} /> Añadir Proyecto
        </button>

        {projectId && (
          <>
            <button
              className={`btn ${
                activeDrawer === 'decisions' ? 'btn-primary' : 'btn-secondary'
              }`}
              onClick={() =>
                setActiveDrawer(activeDrawer === 'decisions' ? null : 'decisions')
              }
              style={{ fontSize: 12, padding: '5px 10px' }}
            >
              <BookOpen size={14} /> Decisiones
              {adrs.length > 0 && (
                <span
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    borderRadius: 999,
                    padding: '1px 6px',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {adrs.length}
                </span>
              )}
            </button>

            <button
              className={`btn ${
                activeDrawer === 'pending'
                  ? 'btn-primary'
                  : pending
                    ? pending.stale
                      ? 'btn-danger'
                      : 'btn-secondary'
                    : 'btn-secondary'
              }`}
              onClick={() =>
                setActiveDrawer(activeDrawer === 'pending' ? null : 'pending')
              }
              style={{ fontSize: 12, padding: '5px 10px' }}
            >
              {pending?.stale ? (
                <AlertCircle size={14} color="var(--danger)" />
              ) : (
                <Clock size={14} />
              )}
              <span>Pendientes</span>
              {pending && (
                <span
                  style={{
                    backgroundColor: pending.stale ? 'var(--danger)' : 'var(--accent)',
                    color: 'white',
                    borderRadius: 999,
                    padding: '1px 5px',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  {pending.changes.length}
                </span>
              )}
            </button>
          </>
        )}
      </div>
    </header>
  );
}
