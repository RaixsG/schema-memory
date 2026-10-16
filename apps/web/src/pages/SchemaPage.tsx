import { useEffect } from 'react';
import { useSchemaStore } from '../store';
import { SchemaCanvas } from '../components/SchemaCanvas';
import { Inspector } from '../components/Inspector';
import { PendingDrawer } from '../components/PendingDrawer';
import { DecisionsDrawer } from '../components/DecisionsDrawer';

export function SchemaPage({
  projectId,
  initialTable,
}: {
  projectId: string;
  initialTable?: string | null;
}) {
  const loadProject = useSchemaStore((s) => s.loadProject);
  const syncIfNeeded = useSchemaStore((s) => s.syncIfNeeded);
  const isLoading = useSchemaStore((s) => s.isLoading);
  const error = useSchemaStore((s) => s.error);

  useEffect(() => {
    loadProject(projectId, {
      initialTable: initialTable ?? undefined,
    });
  }, [projectId, initialTable, loadProject]);

  // Live real-time auto-sync via SSE when the AI agent modifies schema, pending changes, or ADRs via MCP
  useEffect(() => {
    // 1. Setup real-time Server-Sent Events (SSE)
    let eventSource: EventSource | null = null;
    try {
      eventSource = new EventSource(`/api/projects/${encodeURIComponent(projectId)}/events`);
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'sync') {
            syncIfNeeded();
          }
        } catch {
          // ignore
        }
      };
    } catch {
      // EventSource not supported
    }

    // 2. Passive relaxed fallback interval (15s) and window focus
    const interval = setInterval(() => {
      syncIfNeeded();
    }, 15000);

    const handleFocusOrVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncIfNeeded();
      }
    };

    window.addEventListener('focus', handleFocusOrVisibility);
    document.addEventListener('visibilitychange', handleFocusOrVisibility);

    return () => {
      if (eventSource) {
        eventSource.close();
      }
      clearInterval(interval);
      window.removeEventListener('focus', handleFocusOrVisibility);
      document.removeEventListener('visibilitychange', handleFocusOrVisibility);
    };
  }, [projectId, syncIfNeeded]);

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
