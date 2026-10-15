import { useEffect } from 'react';
import { useSchemaStore } from '../store';
import { SchemaCanvas } from '../components/SchemaCanvas';
import { Inspector } from '../components/Inspector';
import { PendingDrawer } from '../components/PendingDrawer';
import { DecisionsDrawer } from '../components/DecisionsDrawer';

export function SchemaPage({ projectId }: { projectId: string }) {
  const loadProject = useSchemaStore((s) => s.loadProject);
  const isLoading = useSchemaStore((s) => s.isLoading);
  const error = useSchemaStore((s) => s.error);

  useEffect(() => {
    loadProject(projectId);
  }, [projectId, loadProject]);

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        Cargando esquema de {projectId}...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)' }}>
        Error cargando esquema: {error}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden' }}>
      {/* Canvas */}
      <div style={{ flex: 1, height: '100%' }}>
        <SchemaCanvas />
      </div>

      {/* Inspector Sidebar */}
      <Inspector />

      {/* Slide-over Drawers */}
      <PendingDrawer />
      <DecisionsDrawer />
    </div>
  );
}
