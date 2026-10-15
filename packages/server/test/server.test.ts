import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

describe('M5: Server REST API and Security', () => {
  let tempHome: string;
  let tempRepo: string;
  const originalHome = process.env.SCHEMA_MEMORY_HOME;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'sm-srv-home-'));
    tempRepo = await mkdtemp(join(tmpdir(), 'sm-srv-repo-'));
    process.env.SCHEMA_MEMORY_HOME = tempHome;
    app = createApp();
  });

  afterEach(async () => {
    process.env.SCHEMA_MEMORY_HOME = originalHome;
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempRepo, { recursive: true, force: true });
  });

  describe('Security Middleware', () => {
    it('blocks request with untrusted Host header', async () => {
      const res = await app.request('/healthz', {
        headers: { host: 'evil.attacker.com' },
      });
      expect(res.status).toBe(403);
      const text = await res.text();
      expect(text).toContain('Host header');
    });

    it('allows request with localhost or 127.0.0.1 Host', async () => {
      const res = await app.request('/healthz', {
        headers: { host: '127.0.0.1:4317' },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('ok');
    });
  });

  describe('REST Endpoints Workflow', () => {
    const localHeaders = {
      host: '127.0.0.1:4317',
      'content-type': 'application/json',
    };

    it('manages project planning, addition, pending changes, and schema retrieval', async () => {
      // 1. Initial projects list should be empty
      const listRes1 = await app.request('/api/projects', {
        headers: localHeaders,
      });
      expect(listRes1.status).toBe(200);
      const list1 = await listRes1.json();
      expect(list1.projects.length).toBe(0);

      // 2. Plan add project (Dry Run)
      const planRes = await app.request('/api/projects/plan', {
        method: 'POST',
        headers: localHeaders,
        body: JSON.stringify({ path: tempRepo }),
      });
      expect(planRes.status).toBe(200);
      const { plan } = await planRes.json();
      expect(plan.actions.length).toBeGreaterThan(0);

      // 3. Apply add project
      const addRes = await app.request('/api/projects', {
        method: 'POST',
        headers: localHeaders,
        body: JSON.stringify({
          path: tempRepo,
          name: 'Rest Project',
          dialect: 'postgres',
        }),
      });
      expect(addRes.status).toBe(200);
      const { project } = await addRes.json();
      expect(project.id).toBe('rest-project');

      // 4. Projects list now contains 1 project
      const listRes2 = await app.request('/api/projects', {
        headers: localHeaders,
      });
      const list2 = await listRes2.json();
      expect(list2.projects.length).toBe(1);
      expect(list2.projects[0].id).toBe('rest-project');

      // 5. Schema endpoint
      const schemaRes = await app.request('/api/projects/rest-project/schema', {
        headers: localHeaders,
      });
      expect(schemaRes.status).toBe(200);
      const schemaData = await schemaRes.json();
      expect(schemaData.id).toBe('rest-project');
      expect(schemaData.model).toBeDefined();

      // 6. Update layout
      const layoutRes = await app.request('/api/projects/rest-project/layout', {
        method: 'PUT',
        headers: localHeaders,
        body: JSON.stringify({ layout: { users: { x: 100, y: 150 } } }),
      });
      expect(layoutRes.status).toBe(200);

      // 7. Put pending change
      const pendingDbml = 'Table users {\n  id int [pk]\n  name varchar\n}\n';
      const putPendingRes = await app.request(
        '/api/projects/rest-project/pending',
        {
          method: 'PUT',
          headers: localHeaders,
          body: JSON.stringify({ proposedDbml: pendingDbml }),
        }
      );
      expect(putPendingRes.status).toBe(200);
      const putPendingData = await putPendingRes.json();
      expect(putPendingData.details.changes.length).toBe(1);

      // 8. Get pending change
      const getPendingRes = await app.request(
        '/api/projects/rest-project/pending',
        {
          headers: localHeaders,
        }
      );
      expect(getPendingRes.status).toBe(200);
      const getPendingData = await getPendingRes.json();
      expect(getPendingData.pending.hasPending).toBeUndefined(); // getPending returns PendingDetails directly
      expect(getPendingData.pending.changes.length).toBe(1);

      // 9. Clear pending change
      const delPendingRes = await app.request(
        '/api/projects/rest-project/pending',
        {
          method: 'DELETE',
          headers: localHeaders,
        }
      );
      expect(delPendingRes.status).toBe(200);

      // 10. Bootstrap prompt
      const promptRes = await app.request(
        '/api/projects/rest-project/bootstrap-prompt',
        {
          headers: localHeaders,
        }
      );
      expect(promptRes.status).toBe(200);
      const promptData = await promptRes.json();
      expect(promptData.prompt).toContain('import_schema');
    });
  });

  describe('Directory Browser', () => {
    it('lists directories safely', async () => {
      const res = await app.request(`/api/fs/list?path=${encodeURIComponent(tmpdir())}`, {
        headers: { host: '127.0.0.1:4317' },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.current).toBeDefined();
      expect(Array.isArray(json.directories)).toBe(true);
    });
  });
});
