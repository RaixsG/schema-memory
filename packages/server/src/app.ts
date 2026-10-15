import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { securityMiddleware } from './security.js';
import { listDirectories } from './fs-browser.js';
import {
  listProjects,
  resolveProject,
  readConfig,
  readIfExists,
  atomicWrite,
  parseSchema,
  planAddProject,
  applyAddProject,
  removeProject,
  savePending,
  getPending,
  clearPending,
  listAdrs,
  readAdr,
  AdrStatus,
  Dialect,
} from '@schema-memory/core';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { serveStatic } from '@hono/node-server/serve-static';

function findWebDistDir(): string | null {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      resolve(currentDir, '../../../apps/web/dist'),
      resolve(currentDir, '../../apps/web/dist'),
      resolve(currentDir, '../apps/web/dist'),
      resolve(process.cwd(), 'apps/web/dist'),
    ];
    for (const c of candidates) {
      if (existsSync(resolve(c, 'index.html'))) {
        return c;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function createApp(): Hono {
  const app = new Hono();

  // Security & CORS
  app.use('*', securityMiddleware);
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return '*';
        if (
          origin.startsWith('http://127.0.0.1') ||
          origin.startsWith('http://localhost')
        ) {
          return origin;
        }
        return null;
      },
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Health check
  app.get('/healthz', (c) => c.json({ status: 'ok', service: 'schema-memory-server' }));

  // --- API Routes ---

  // 1. Projects listing with stats
  app.get('/api/projects', async (c) => {
    try {
      const projects = await listProjects();
      const list = await Promise.all(
        projects.map(async (p) => {
          const config = await readConfig(p.path);
          const pending = await getPending(p.path);
          const adrs = await listAdrs(p.path);
          const unconfirmedAdrs = adrs.filter(
            (a) => a.metadata.status !== 'confirmado'
          ).length;

          return {
            id: p.id,
            name: p.name,
            path: p.path,
            dialect: config?.dialect || 'postgres',
            stack: config?.stack || [],
            hasPending: pending !== null,
            pendingStale: pending?.stale || false,
            unconfirmedAdrs,
            totalAdrs: adrs.length,
          };
        })
      );
      return c.json({ projects: list });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  });

  // 2. Plan add project (Dry Run)
  app.post('/api/projects/plan', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.path) {
        return c.json({ error: 'Field "path" is required.' }, 400);
      }
      const plan = await planAddProject(body.path);
      return c.json({ plan });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  // 3. Apply add project
  app.post('/api/projects', async (c) => {
    try {
      const body = await c.req.json();
      if (!body.path) {
        return c.json({ error: 'Field "path" is required.' }, 400);
      }
      const plan = await planAddProject(body.path);
      const config = await applyAddProject(plan, {
        id: body.id,
        name: body.name,
        dialect: body.dialect as Dialect,
        installProjectSkill: body.installProjectSkill,
      });
      return c.json({ project: config });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  // 4. Remove project
  app.delete('/api/projects/:id', async (c) => {
    try {
      const id = c.req.param('id');
      const deleteData = c.req.query('deleteData') === 'true';
      const result = await removeProject(id, { deleteData });
      return c.json({ removed: true, ...result });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  // 5. FS Directory Browser
  app.get('/api/fs/list', async (c) => {
    try {
      const pathParam = c.req.query('path');
      const result = await listDirectories(pathParam);
      return c.json(result);
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  // 6. Project Schema
  app.get('/api/projects/:id/schema', async (c) => {
    try {
      const id = c.req.param('id');
      const resolved = await resolveProject({ project: id });
      const config = await readConfig(resolved.path);
      const schemaPath = resolve(resolved.path, '.schema-memory', 'schema.dbml');
      const dbml = (await readIfExists(schemaPath)) || '';
      const model = parseSchema(dbml);

      const layoutPath = resolve(resolved.path, '.schema-memory', 'layout.json');
      const layoutRaw = await readIfExists(layoutPath);
      let layout: Record<string, { x: number; y: number }> = {};
      if (layoutRaw) {
        try {
          layout = JSON.parse(layoutRaw);
        } catch {
          // ignore layout parse error
        }
      }

      return c.json({
        id: resolved.id,
        name: resolved.name,
        path: resolved.path,
        config,
        dbml,
        model,
        layout,
      });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  // 7. Update Canvas Layout
  app.put('/api/projects/:id/layout', async (c) => {
    try {
      const id = c.req.param('id');
      const resolved = await resolveProject({ project: id });
      const body = await c.req.json();
      const layout = body.layout || {};
      const layoutPath = resolve(resolved.path, '.schema-memory', 'layout.json');
      await atomicWrite(layoutPath, JSON.stringify(layout, null, 2) + '\n');
      return c.json({ saved: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  // 8. Pending Changes
  app.get('/api/projects/:id/pending', async (c) => {
    try {
      const id = c.req.param('id');
      const resolved = await resolveProject({ project: id });
      const pending = await getPending(resolved.path);
      return c.json({ pending });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  app.put('/api/projects/:id/pending', async (c) => {
    try {
      const id = c.req.param('id');
      const resolved = await resolveProject({ project: id });
      const body = await c.req.json();

      const details = await savePending(resolved.path, {
        proposedDbml: body.proposedDbml,
        model: body.model,
        source: 'ui',
        note: body.note,
      });
      return c.json({ details });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  app.delete('/api/projects/:id/pending', async (c) => {
    try {
      const id = c.req.param('id');
      const resolved = await resolveProject({ project: id });
      await clearPending(resolved.path);
      return c.json({ cleared: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  // 9. ADRs Timeline
  app.get('/api/projects/:id/adrs', async (c) => {
    try {
      const id = c.req.param('id');
      const table = c.req.query('table');
      const column = c.req.query('column');
      const status = c.req.query('status') as AdrStatus | undefined;

      const resolved = await resolveProject({ project: id });
      const adrs = await listAdrs(resolved.path, { table, column, status });

      return c.json({
        adrs: adrs.map((a) => ({
          metadata: a.metadata,
          context: a.context,
          decision: a.decision,
          alternatives: a.alternatives,
          consequences: a.consequences,
          diffText: a.diffText,
        })),
      });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  app.get('/api/projects/:id/adrs/:adrId', async (c) => {
    try {
      const id = c.req.param('id');
      const adrId = c.req.param('adrId');
      const resolved = await resolveProject({ project: id });
      const adr = await readAdr(resolved.path, adrId);
      if (!adr) {
        return c.json({ error: `ADR "${adrId}" not found.` }, 404);
      }
      return c.json({ adr });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  // 10. Bootstrap Prompt for AI agent
  app.get('/api/projects/:id/bootstrap-prompt', async (c) => {
    try {
      const id = c.req.param('id');
      const resolved = await resolveProject({ project: id });
      const config = await readConfig(resolved.path);
      const stackList = config?.stack.join(', ') || 'generic';

      const prompt = [
        `Hola! Este proyecto "${resolved.name}" (id: ${resolved.id}) utiliza schema-memory.`,
        `Stack detectado: ${stackList}.`,
        'Por favor, inspecciona los modelos y archivos de base de datos existentes en el proyecto,',
        'y genera el esquema canónico inicial llamando a la herramienta MCP "import_schema".',
        'Crea también los ADRs iniciales con status="reconstruido" para documentar las decisiones observadas.',
      ].join('\n');

      return c.json({ prompt });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });

  // 11. Static files & SPA fallback for web UI
  const webDist = findWebDistDir();
  if (webDist) {
    app.use('/assets/*', serveStatic({ root: webDist }));
    app.get('*', serveStatic({ path: resolve(webDist, 'index.html') }));
  }

  return app;
}
