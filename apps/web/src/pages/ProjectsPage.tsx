import { useEffect, useState } from 'react';
import { api } from '../api';
import { ProjectSummary } from '../types';
import { useSchemaStore } from '../store';
import { Database, Plus, Trash2, Clock, BookOpen } from 'lucide-react';

export function ProjectsPage({ onSelectProject }: { onSelectProject: (id: string) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const setAddModalOpen = useSchemaStore((s) => s.setAddModalOpen);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const data = await api.getProjects();
      setProjects(data.projects);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleRemove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm(`¿Desvincular el proyecto "${id}" de schema-memory?`)) return;
    try {
      await api.removeProject(id);
      fetchProjects();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '36px 48px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        {/* Title & Add button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.5px' }}>Proyectos</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
              Administra los repositorios de tus clientes y sus decisiones de esquema.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setAddModalOpen(true)}>
            <Plus size={16} /> Añadir Proyecto
          </button>
        </div>

        {/* Projects list */}
        {loading ? (
          <p style={{ color: 'var(--text-muted)' }}>Cargando proyectos...</p>
        ) : projects.length === 0 ? (
          <div
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px dashed var(--border)',
              borderRadius: 12,
              padding: '60px 20px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                backgroundColor: 'var(--accent-light)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <Database size={24} />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 700 }}>No hay proyectos registrados</h3>
            <p style={{ color: 'var(--text-secondary)', maxWidth: 460, margin: '8px auto 20px', fontSize: 13 }}>
              Añade un proyecto existente (SQL, Prisma, Django, Knex, Laravel...) para acoplar la memoria de esquema y comenzar a documentar decisiones con IA.
            </p>
            <button className="btn btn-primary" onClick={() => setAddModalOpen(true)}>
              <Plus size={16} /> Añadir Primer Proyecto
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 16,
            }}
          >
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => onSelectProject(p.id)}
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 18,
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, transform 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-focus)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</h3>
                    <span className="badge badge-gray">{p.dialect}</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                    {p.id}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, wordBreak: 'break-all' }}>
                    {p.path}
                  </p>

                  {p.stack.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 10 }}>
                      {p.stack.map((s) => (
                        <span key={s} className="badge badge-blue">{s}</span>
                      ))}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 18,
                    paddingTop: 12,
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
                    {p.hasPending && (
                      <span className={`badge ${p.pendingStale ? 'badge-yellow' : 'badge-green'}`}>
                        <Clock size={11} /> Pendiente
                      </span>
                    )}
                    <span className="badge badge-gray">
                      <BookOpen size={11} /> {p.totalAdrs} ADRs
                    </span>
                  </div>

                  <button
                    onClick={(e) => handleRemove(e, p.id)}
                    style={{ color: 'var(--text-muted)', padding: 4 }}
                    title="Desvincular proyecto"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
