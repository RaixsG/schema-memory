import { useState } from 'react';
import { useSchemaStore } from './store';
import { Navbar } from './components/Navbar';
import { ProjectsPage } from './pages/ProjectsPage';
import { SchemaPage } from './pages/SchemaPage';
import { AddProjectModal } from './components/AddProjectModal';

export function App() {
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const isAddModalOpen = useSchemaStore((s) => s.isAddModalOpen);
  const setAddModalOpen = useSchemaStore((s) => s.setAddModalOpen);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
      <Navbar onGoHome={() => setCurrentProjectId(null)} />

      <main style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {currentProjectId ? (
          <SchemaPage projectId={currentProjectId} />
        ) : (
          <ProjectsPage onSelectProject={(id) => setCurrentProjectId(id)} />
        )}
      </main>

      {isAddModalOpen && (
        <AddProjectModal
          onClose={() => setAddModalOpen(false)}
          onAdded={(id) => {
            setCurrentProjectId(id);
            setAddModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
