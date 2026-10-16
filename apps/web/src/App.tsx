import { useEffect, useState, useCallback } from 'react';
import { useSchemaStore } from './store';
import { Navbar } from './components/Navbar';
import { ProjectsPage } from './pages/ProjectsPage';
import { SchemaPage } from './pages/SchemaPage';
import { AddProjectModal } from './components/AddProjectModal';

function parseLocationRoute(): {
  projectId: string | null;
  table: string | null;
  drawer: 'pending' | 'decisions' | null;
} {
  const pathMatch = window.location.pathname.match(/^\/projects\/([^/]+)/);
  const params = new URLSearchParams(window.location.search);
  const projectId = pathMatch?.[1]
    ? decodeURIComponent(pathMatch[1])
    : params.get('project');
  const table = params.get('table');
  const rawDrawer = params.get('drawer');
  const drawer =
    rawDrawer === 'pending' || rawDrawer === 'decisions' ? rawDrawer : null;

  return { projectId: projectId || null, table, drawer };
}

export function App() {
  const initialRoute = parseLocationRoute();
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(
    initialRoute.projectId
  );
  const [initialTable, setInitialTable] = useState<string | null>(
    initialRoute.table
  );

  const isAddModalOpen = useSchemaStore((s) => s.isAddModalOpen);
  const setAddModalOpen = useSchemaStore((s) => s.setAddModalOpen);
  const selectedTable = useSchemaStore((s) => s.selectedTable);
  const activeDrawer = useSchemaStore((s) => s.activeDrawer);
  const setActiveDrawer = useSchemaStore((s) => s.setActiveDrawer);
  const isLoading = useSchemaStore((s) => s.isLoading);

  // Restore initial drawer from URL on mount
  useEffect(() => {
    if (initialRoute.drawer) {
      setActiveDrawer(initialRoute.drawer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen to browser Back / Forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const route = parseLocationRoute();
      setCurrentProjectId(route.projectId);
      setInitialTable(route.table);
      setActiveDrawer(route.drawer);
      if (!route.projectId) {
        useSchemaStore.setState({
          projectId: null,
          selectedTable: null,
          activeDrawer: null,
        });
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setActiveDrawer]);

  // Keep URL query params (?table=...&drawer=...) in sync when inside a project
  useEffect(() => {
    if (!currentProjectId || isLoading) return;
    const params = new URLSearchParams();
    if (selectedTable) params.set('table', selectedTable);
    if (activeDrawer) params.set('drawer', activeDrawer);
    const qs = params.toString();
    const targetUrl = `/projects/${encodeURIComponent(currentProjectId)}${
      qs ? `?${qs}` : ''
    }`;
    if (
      window.location.pathname + window.location.search !== targetUrl
    ) {
      window.history.replaceState({}, '', targetUrl);
    }
  }, [currentProjectId, selectedTable, activeDrawer, isLoading]);

  const navigateToProject = useCallback((id: string) => {
    setInitialTable(null);
    setCurrentProjectId(id);
    window.history.pushState({}, '', `/projects/${encodeURIComponent(id)}`);
  }, []);

  const navigateHome = useCallback(() => {
    setCurrentProjectId(null);
    setInitialTable(null);
    useSchemaStore.setState({
      projectId: null,
      selectedTable: null,
      activeDrawer: null,
    });
    window.history.pushState({}, '', '/');
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <Navbar onGoHome={navigateHome} />

      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {currentProjectId ? (
          <SchemaPage projectId={currentProjectId} initialTable={initialTable} />
        ) : (
          <ProjectsPage onSelectProject={navigateToProject} />
        )}
      </main>

      {isAddModalOpen && (
        <AddProjectModal
          onClose={() => setAddModalOpen(false)}
          onAdded={(id) => {
            navigateToProject(id);
            setAddModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
