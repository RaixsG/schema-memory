import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';
import { gzipBuffer } from '@schema-memory/core';

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

      // 5. Schema endpoint (with ETag and bundled pending + fingerprint)
      const schemaRes = await app.request('/api/projects/rest-project/schema', {
        headers: localHeaders,
      });
      expect(schemaRes.status).toBe(200);
      const etag = schemaRes.headers.get('etag');
      expect(etag).toBeTruthy();
      const schemaData = await schemaRes.json();
      expect(schemaData.id).toBe('rest-project');
      expect(schemaData.model).toBeDefined();
      expect(typeof schemaData.fingerprint).toBe('string');

      // 5b. Conditional GET with If-None-Match returns 304 Not Modified
      const schema304Res = await app.request('/api/projects/rest-project/schema', {
        headers: { ...localHeaders, 'if-none-match': etag! },
      });
      expect(schema304Res.status).toBe(304);

      // 6. Update layout
      const layoutRes = await app.request('/api/projects/rest-project/layout', {
        method: 'PUT',
        headers: localHeaders,
        body: JSON.stringify({ layout: { users: { x: 100, y: 150 } } }),
      });
      expect(layoutRes.status).toBe(200);

      // 6b. Sync fingerprint before pending change
      const syncRes1 = await app.request('/api/projects/rest-project/sync', {
        headers: localHeaders,
      });
      expect(syncRes1.status).toBe(200);
      const syncData1 = await syncRes1.json();
      expect(typeof syncData1.fingerprint).toBe('string');
      expect(syncData1.hasPending).toBe(false);

      // 7. Put pending change (using Content-Encoding: gzip compressed request body)
      const pendingDbml = 'Table users {\n  id int [pk]\n  name varchar\n}\n';
      const compressedBody = await gzipBuffer(
        JSON.stringify({ proposedDbml: pendingDbml })
      );
      const putPendingRes = await app.request(
        '/api/projects/rest-project/pending',
        {
          method: 'PUT',
          headers: {
            ...localHeaders,
            'content-encoding': 'gzip',
          },
          body: new Uint8Array(compressedBody),
        }
      );
      expect(putPendingRes.status).toBe(200);
      const putPendingData = await putPendingRes.json();
      expect(putPendingData.details.changes.length).toBe(1);
      expect(typeof putPendingData.fingerprint).toBe('string');

      // 7b. Sync fingerprint after pending change should differ
      const syncRes2 = await app.request('/api/projects/rest-project/sync', {
        headers: localHeaders,
      });
      const syncData2 = await syncRes2.json();
      expect(syncData2.hasPending).toBe(true);
      expect(syncData2.fingerprint).not.toBe(syncData1.fingerprint);

      // 7c. SSE events endpoint responds with text/event-stream
      const eventsRes = await app.request('/api/projects/rest-project/events', {
        headers: localHeaders,
      });
      expect(eventsRes.status).toBe(200);
      expect(eventsRes.headers.get('content-type')).toContain('text/event-stream');

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
