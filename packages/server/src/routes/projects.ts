import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import {
  listProjects,
  resolveProject,
  readConfig,
  readIfExists,
  atomicWrite,
  parseSchema,
  planAddProject,
  applyAddProject,
  ProjectConflictError,
  removeProject,
  savePending,
  getPending,
  getPendingStatus,
  clearPending,
  listAdrs,
  countAdrsStatus,
  readAdr,
  AdrStatus,
  Dialect,
  computeProjectFingerprint,
} from '@schema-memory/core';
import { validate } from '../schemas/validator.js';
import {
  planProjectSchema,
  addProjectSchema,
  removeProjectQuerySchema,
  saveLayoutSchema,
  savePendingSchema,
  listAdrsQuerySchema,
} from '../schemas/projects.js';

export const projectsRouter = new Hono()
  // 1. Projects listing with stats
  .get('/', async (c) => {
    try {
      const projects = await listProjects();
      const list = await Promise.all(
        projects.map(async (p) => {
          const [config, pendingStatus, adrCounts] = await Promise.all([
            readConfig(p.path),
            getPendingStatus(p.path),
            countAdrsStatus(p.path),
          ]);

          return {
            id: p.id,
            name: p.name,
            path: p.path,
            dialect: config?.dialect || 'postgres',
            stack: config?.stack || [],
            hasPending: pendingStatus.hasPending,
            pendingStale: pendingStatus.stale,
            unconfirmedAdrs: adrCounts.unconfirmedAdrs,
            totalAdrs: adrCounts.totalAdrs,
          };
        })
      );
      return c.json({ projects: list });
    } catch (err: any) {
      return c.json({ error: err.message }, 500);
    }
  })

  // 2. Plan add project (Dry Run)
  .post('/plan', validate('json', planProjectSchema), async (c) => {
    try {
      const body = c.req.valid('json' as never) as { path: string };
      const plan = await planAddProject(body.path);
      return c.json({ plan });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  })

  // 3. Apply add project (or adopt an already-configured repo)
  .post('/', validate('json', addProjectSchema), async (c) => {
    try {
      const body = c.req.valid('json' as never) as {
        path: string;
        id?: string;
        name?: string;
        dialect?: Dialect;
        installProjectSkill?: boolean;
        resolveConflict?: 'replace' | 'new';
      };
      const plan = await planAddProject(body.path);
      const config = await applyAddProject(plan, {
        id: body.id,
        name: body.name,
        dialect: body.dialect,
        installProjectSkill: body.installProjectSkill,
        resolveConflict: body.resolveConflict,
      });
      return c.json({
        project: config,
        adopted: plan.mode === 'adopt',
        needsBootstrap: plan.needsBootstrap,
      });
    } catch (err: any) {
      if (err instanceof ProjectConflictError) {
        return c.json(
          {
            error: err.message,
            code: 'PROJECT_CONFLICT',
            id: err.id,
            existingPath: err.existingPath,
          },
          409
        );
      }
      return c.json({ error: err.message }, 400);
    }
  })

  // 4. Remove project
  .delete('/:id', validate('query', removeProjectQuerySchema), async (c) => {
    try {
      const id = c.req.param('id');
      const { deleteData } = c.req.valid('query' as never) as { deleteData?: boolean };
      const result = await removeProject(id, { deleteData });
      return c.json({ removed: true, ...result });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  })

  // 5. Project Schema (supports ETag / 304 Not Modified and includes pending + fingerprint)
  .get('/:id/schema', async (c) => {
    try {
      const id = c.req.param('id');
      const resolved = await resolveProject({ project: id });
      const fingerprint = await computeProjectFingerprint(resolved.path);
      const etag = `"${fingerprint}"`;

      c.header('ETag', etag);
      const ifNoneMatch = c.req.header('If-None-Match');
      if (ifNoneMatch && (ifNoneMatch === etag || ifNoneMatch === fingerprint)) {
        return c.body(null, 304);
      }

      const schemaPath = resolve(resolved.path, '.schema-memory', 'schema.dbml');
      const layoutPath = resolve(resolved.path, '.schema-memory', 'layout.json');

      const [config, dbmlRaw, pending, layoutRaw] = await Promise.all([
        readConfig(resolved.path),
        readIfExists(schemaPath),
        getPending(resolved.path),
        readIfExists(layoutPath),
      ]);

      const dbml = dbmlRaw || '';
      const model = parseSchema(dbml);

      let pendingModel = null;
      if (pending && !pending.stale && pending.change?.proposedDbml) {
        try {
          pendingModel = parseSchema(pending.change.proposedDbml);
        } catch {
          pendingModel = null;
        }
      }

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
        pendingModel,
        pending,
        layout,
        fingerprint,
      });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  })

  // 6. Fast O(1) Sync Fingerprint for live agent updates
  .get('/:id/sync', async (c) => {
    try {
      const id = c.req.param('id');
      const resolved = await resolveProject({ project: id });

      const [fingerprint, pendingStatus, adrCounts] = await Promise.all([
        computeProjectFingerprint(resolved.path),
        getPendingStatus(resolved.path),
        countAdrsStatus(resolved.path),
      ]);

      return c.json({
        fingerprint,
        hasPending: pendingStatus.hasPending,
        adrCount: adrCounts.totalAdrs,
      });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  })

  // 7. Server-Sent Events (SSE) for Real-Time Reactivity
  .get('/:id/events', async (c) => {
    try {
      const id = c.req.param('id');
      const resolved = await resolveProject({ project: id });
      const schemaDir = resolve(resolved.path, '.schema-memory');

      return streamSSE(c, async (stream) => {
        const initialFp = await computeProjectFingerprint(resolved.path);
        await stream.writeSSE({
          data: JSON.stringify({ type: 'connected', fingerprint: initialFp }),
          event: 'message',
        });

        let lastFp = initialFp;
        let debounceTimer: any = null;
        let watcher: any = null;

        try {
          if (existsSync(schemaDir)) {
            const { watch } = await import('node:fs');
            watcher = watch(schemaDir, { recursive: true }, () => {
              clearTimeout(debounceTimer);
              debounceTimer = setTimeout(async () => {
                try {
                  const currentFp = await computeProjectFingerprint(resolved.path);
                  if (currentFp !== lastFp) {
                    lastFp = currentFp;
                    await stream.writeSSE({
                      data: JSON.stringify({ type: 'sync', fingerprint: currentFp }),
                      event: 'message',
                    });
                  }
                } catch {
                  // ignore transient read errors
                }
              }, 150);
            });
          }
        } catch {
          // ignore watcher failure
        }

        const pingInterval = setInterval(async () => {
          try {
            await stream.writeSSE({
              data: JSON.stringify({ type: 'ping' }),
              event: 'ping',
            });
          } catch {
            clearInterval(pingInterval);
          }
        }, 15000);

        stream.onAbort(() => {
          clearTimeout(debounceTimer);
          clearInterval(pingInterval);
          if (watcher) {
            try {
              watcher.close();
            } catch {
              // ignore
            }
          }
        });
      });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  })

  // 8. Update Canvas Layout
  .put('/:id/layout', validate('json', saveLayoutSchema), async (c) => {
    try {
      const id = c.req.param('id');
      const resolved = await resolveProject({ project: id });
      const body = c.req.valid('json' as never) as { layout: Record<string, { x: number; y: number }> };
      const layout = body.layout || {};
      const layoutPath = resolve(resolved.path, '.schema-memory', 'layout.json');
      await atomicWrite(layoutPath, JSON.stringify(layout, null, 2) + '\n');
      return c.json({ saved: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  })

  // 9. Pending Changes
  .get('/:id/pending', async (c) => {
    try {
      const id = c.req.param('id');
      const resolved = await resolveProject({ project: id });
      const pending = await getPending(resolved.path);
      return c.json({ pending });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  })

  .put('/:id/pending', validate('json', savePendingSchema), async (c) => {
    try {
      const id = c.req.param('id');
      const resolved = await resolveProject({ project: id });
      const body = c.req.valid('json' as never) as {
        proposedDbml?: string;
        model?: any;
        note?: string;
      };

      const details = await savePending(resolved.path, {
        proposedDbml: body.proposedDbml,
        model: body.model,
        source: 'ui',
        note: body.note,
      });
      const fingerprint = await computeProjectFingerprint(resolved.path);
      return c.json({ details, fingerprint });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  })

  .delete('/:id/pending', async (c) => {
    try {
      const id = c.req.param('id');
      const resolved = await resolveProject({ project: id });
      await clearPending(resolved.path);
      return c.json({ cleared: true });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  })

  // 10. ADRs Timeline
  .get('/:id/adrs', validate('query', listAdrsQuerySchema), async (c) => {
    try {
      const id = c.req.param('id');
      const { table, column, status } = c.req.valid('query' as never) as {
        table?: string;
        column?: string;
        status?: AdrStatus;
      };

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
  })

  .get('/:id/adrs/:adrId', async (c) => {
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
  })

  // 11. Bootstrap Prompt for AI agent
  .get('/:id/bootstrap-prompt', async (c) => {
    try {
      const id = c.req.param('id');
      const resolved = await resolveProject({ project: id });
      const config = await readConfig(resolved.path);
      const stackList = config?.stack.join(', ') || 'generic';

      const prompt = [
        `Hola! Este proyecto "${resolved.name}" (id: "${resolved.id}", ruta: "${resolved.path}") utiliza schema-memory.`,
        `Stack detectado: ${stackList}.`,
        `1. Inspecciona ÚNICAMENTE los modelos y archivos de base de datos dentro de este proyecto ("${resolved.path}").`,
        `2. Genera el esquema canónico inicial en DBML llamando a la herramienta MCP \`import_schema\` con \`project: "${resolved.id}"\`.`,
        `3. Crea también los ADRs iniciales con \`status="reconstruido"\` para documentar las decisiones observadas.`,
        `IMPORTANTE: Interactúa con schema-memory ÚNICAMENTE mediante sus herramientas MCP (\`schema-memory\` / \`schema-memory-mcp\`). NUNCA busques, leas ni analices el repositorio de código fuente de schema-memory. Si las herramientas MCP (\`import_schema\`, \`get_schema\`, etc.) no están activas en tu sesión actual, detente de inmediato sin buscar en el disco y pídeme ejecutar \`sm setup\` (o \`pnpm sm setup\`) y recargar el agente.`,
      ].join('\n');

      return c.json({ prompt });
    } catch (err: any) {
      return c.json({ error: err.message }, 400);
    }
  });
