import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import {
  listProjects,
  resolveProject,
  readConfig,
  readIfExists,
  parseSchema,
  filterSchemaByTables,
  serializeDbml,
  savePending,
  getPending,
  getPendingStatus,
  saveAdrDraft,
  clearPending,
  confirmChange,
  listAdrs,
  countAdrsStatus,
  readAdr,
  promoteAdr,
  checkDrift,
  writeAdr,
  atomicWrite,
  validateDbml,
  nextAdrId,
  renderAdrMarkdown,
  AdrDraft,
  AdrMetadata,
  AdrStatus,
} from '@schema-memory/core';
import { resolve } from 'node:path';

export const SERVER_INSTRUCTIONS = `
Instructions for AI Agent using schema-memory:
1. CONTEXT FIRST: Always inspect canonical schema (via resource schema://{project}/dbml or tool get_schema) and past architectural decisions (get_decisions) before proposing schema modifications.
2. PROPOSING CHANGES: Call propose_change with your proposed DBML. If it reports zero differences, do not draft an ADR.
3. DEBATE ETIQUETTE: When a pending change exists, debate reasons and trade-offs with the user. Ask at most 1-2 focused questions at a time. Identify viable alternatives and consequences before calling draft_adr.
4. STRICT APPROVAL: NEVER call confirm_change without the user's explicit, conversational approval (userConfirmed=true).
5. MEMORY INTEGRATION: After confirm_change succeeds, save the returned engramSummary into Engram using your Engram tool. ONLY after that, proceed to modify application code, ORM models, or migration files in the project.
6. STRICT ISOLATION: Interact with schema-memory ONLY via its MCP tools and resources. Never search for, read, or edit .schema-memory files directly.
`.trim();

function stringifyJson(data: unknown): string {
  return process.env.SCHEMA_MEMORY_PRETTY_JSON === '1'
    ? JSON.stringify(data, null, 2)
    : JSON.stringify(data);
}

function jsonResponse(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: stringifyJson(data) }],
  };
}

function errorResponse(message: string, code = 'ERROR') {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: stringifyJson({ code, message }),
      },
    ],
  };
}

function getServerVersion(): string {
  // Prefer the package.json version; when bundled into the CLI this resolves
  // to the CLI's own package.json.
  try {
    const pkgUrl = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgUrl, 'utf-8')) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {
    // ignore and fall back below
  }
  return '0.0.0';
}

export function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'schema-memory-mcp',
      version: getServerVersion(),
    },
    {
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  // ==========================================
  // MCP RESOURCES
  // ==========================================

  // 1. Canonical DBML schema (text/plain)
  server.registerResource(
    'canonical-dbml',
    new ResourceTemplate('schema://{project}/dbml', {
      list: async () => {
        try {
          const projects = await listProjects();
          return {
            resources: projects.map((p) => ({
              uri: `schema://${p.id}/dbml`,
              name: `Canonical DBML: ${p.name}`,
              mimeType: 'text/plain',
            })),
          };
        } catch {
          return { resources: [] };
        }
      },
      complete: {
        project: async (value) => {
          const projects = await listProjects();
          return projects.map((p) => p.id).filter((id) => id.startsWith(value));
        },
      },
    }),
    {
      description: 'Canonical DBML schema definition of the project',
      mimeType: 'text/plain',
    },
    async (uri, { project }) => {
      const resolved = await resolveProject({ project: project as string });
      const schemaPath = resolve(resolved.path, '.schema-memory', 'schema.dbml');
      const dbml = (await readIfExists(schemaPath)) || '';
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/plain',
            text: dbml,
          },
        ],
      };
    }
  );

  // 2. Parsed Model AST (application/json)
  server.registerResource(
    'canonical-model',
    new ResourceTemplate('schema://{project}/model', {
      list: async () => {
        try {
          const projects = await listProjects();
          return {
            resources: projects.map((p) => ({
              uri: `schema://${p.id}/model`,
              name: `Parsed Schema Model (JSON): ${p.name}`,
              mimeType: 'application/json',
            })),
          };
        } catch {
          return { resources: [] };
        }
      },
      complete: {
        project: async (value) => {
          const projects = await listProjects();
          return projects.map((p) => p.id).filter((id) => id.startsWith(value));
        },
      },
    }),
    {
      description: 'Parsed structural model (tables, columns, relations, indexes) in JSON format',
      mimeType: 'application/json',
    },
    async (uri, { project }) => {
      const resolved = await resolveProject({ project: project as string });
      const schemaPath = resolve(resolved.path, '.schema-memory', 'schema.dbml');
      const dbml = (await readIfExists(schemaPath)) || '';
      const model = parseSchema(dbml);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: stringifyJson(model),
          },
        ],
      };
    }
  );

  // 3. Pending Change (application/json)
  server.registerResource(
    'pending-change',
    new ResourceTemplate('schema://{project}/pending', {
      list: async () => {
        try {
          const projects = await listProjects();
          return {
            resources: projects.map((p) => ({
              uri: `schema://${p.id}/pending`,
              name: `Pending changes: ${p.name}`,
              mimeType: 'application/json',
            })),
          };
        } catch {
          return { resources: [] };
        }
      },
      complete: {
        project: async (value) => {
          const projects = await listProjects();
          return projects.map((p) => p.id).filter((id) => id.startsWith(value));
        },
      },
    }),
    {
      description: 'Currently pending schema change diff, proposed DBML, and draft ADR (JSON)',
      mimeType: 'application/json',
    },
    async (uri, { project }) => {
      const resolved = await resolveProject({ project: project as string });
      const pending = await getPending(resolved.path);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: stringifyJson(
              pending || { hasPending: false, message: 'No pending changes.' }
            ),
          },
        ],
      };
    }
  );

  // 4. Project ADRs (application/json)
  server.registerResource(
    'project-adrs',
    new ResourceTemplate('schema://{project}/adrs', {
      list: async () => {
        try {
          const projects = await listProjects();
          return {
            resources: projects.map((p) => ({
              uri: `schema://${p.id}/adrs`,
              name: `ADRs list: ${p.name}`,
              mimeType: 'application/json',
            })),
          };
        } catch {
          return { resources: [] };
        }
      },
      complete: {
        project: async (value) => {
          const projects = await listProjects();
          return projects.map((p) => p.id).filter((id) => id.startsWith(value));
        },
      },
    }),
    {
      description: 'Summary listing of Architecture Decision Records (ADRs) for the project',
      mimeType: 'application/json',
    },
    async (uri, { project }) => {
      const resolved = await resolveProject({ project: project as string });
      const adrs = await listAdrs(resolved.path);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: stringifyJson(
              adrs.map((a) => ({
                id: a.metadata.id,
                title: a.metadata.title,
                status: a.metadata.status,
                date: a.metadata.date,
                affects: a.metadata.affects,
                decision: a.decision,
              }))
            ),
          },
        ],
      };
    }
  );

  // 5. Specific ADR Content (text/markdown)
  server.registerResource(
    'adr-content',
    new ResourceTemplate('adr://{project}/{id}', {
      list: async () => {
        try {
          const projects = await listProjects();
          const resources: Array<{ uri: string; name: string; mimeType: string }> = [];
          for (const p of projects) {
            const adrs = await listAdrs(p.path);
            for (const a of adrs) {
              resources.push({
                uri: `adr://${p.id}/${a.metadata.id}`,
                name: `ADR-${a.metadata.id}: ${a.metadata.title} (${p.name})`,
                mimeType: 'text/markdown',
              });
            }
          }
          return { resources };
        } catch {
          return { resources: [] };
        }
      },
      complete: {
        project: async (value) => {
          const projects = await listProjects();
          return projects.map((p) => p.id).filter((id) => id.startsWith(value));
        },
        id: async (value) => {
          const projects = await listProjects();
          const allIds: string[] = [];
          for (const p of projects) {
            const adrs = await listAdrs(p.path);
            allIds.push(...adrs.map((a) => a.metadata.id));
          }
          return allIds.filter((id) => id.startsWith(value));
        },
      },
    }),
    {
      description: 'Full markdown content of a specific Architecture Decision Record (ADR)',
      mimeType: 'text/markdown',
    },
    async (uri, { project, id }) => {
      const resolved = await resolveProject({ project: project as string });
      const adr = await readAdr(resolved.path, id as string);
      if (!adr) {
        throw new Error(`ADR "${id}" not found in project "${project}".`);
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: adr.content,
          },
        ],
      };
    }
  );

  // ==========================================
  // MCP PROMPTS
  // ==========================================

  // 1. bootstrap_project prompt
  server.registerPrompt(
    'bootstrap_project',
    {
      title: 'Bootstrap Project Schema',
      description:
        'Step-by-step workflow for the agent to inspect a codebase, infer the canonical DBML schema, and generate initial reconstructed ADRs.',
      argsSchema: {
        project: z.string().optional().describe('Project ID or directory path'),
      },
    },
    async (args) => {
      let resolvedInfo = '';
      try {
        if (args.project) {
          const resolved = await resolveProject({ project: args.project });
          const config = await readConfig(resolved.path);
          resolvedInfo = `\nTarget Project: "${resolved.name}" (${resolved.id})\nLocation: "${resolved.path}"\nDetected Stack: ${config?.stack.join(', ') || 'generic'}`;
        }
      } catch {
        // ignore
      }

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                `Please bootstrap schema-memory for the repository.${resolvedInfo}`,
                '',
                'Execution steps:',
                '1. Inspect ONLY models, migration files, and ORM schema definitions inside this project repository.',
                '2. Synthesize the canonical database schema into standard DBML format.',
                '3. Call the MCP tool `import_schema` with the synthesized DBML and reconstructed ADRs documenting existing architectural decisions.',
                '4. Important: Never search for, read, or analyze schema-memory source code. Strictly inspect the application codebase.',
              ].join('\n'),
            },
          },
        ],
      };
    }
  );

  // 2. debate_pending_change prompt
  server.registerPrompt(
    'debate_pending_change',
    {
      title: 'Debate Pending Schema Change',
      description:
        'Guides the agent to review pending changes, interview the user about trade-offs, and draft an ADR.',
      argsSchema: {
        project: z.string().optional().describe('Project ID or directory path'),
      },
    },
    async (args) => {
      let pendingSummary = 'No project specified or no pending change loaded.';
      try {
        const resolved = await resolveProject({ project: args.project });
        const pending = await getPending(resolved.path);
        if (pending) {
          const diffSummary = pending.changes
            .map((c) => `- ${c.kind}: ${'table' in c ? c.table : 'name' in c ? (c as any).name : 'schema'}`)
            .join('\n');
          pendingSummary = `Project "${resolved.name}" has pending changes affecting: ${pending.affects.join(', ') || 'general'}\nSummary of changes:\n${diffSummary || '(none)'}`;
        }
      } catch {
        // ignore
      }

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                'Please review and debate the pending schema change with the user:',
                '',
                pendingSummary,
                '',
                'Workflow instructions:',
                '1. Review the proposed diff against canonical architecture and past ADRs (call `get_decisions`).',
                '2. Ask the user 1 or 2 targeted, high-impact questions about context, motivation, or business requirements.',
                '3. Discuss alternative designs considered and why they might be discarded.',
                '4. Once aligned with the user, call `draft_adr` with title, context, decision, alternatives, and consequences.',
                '5. Ask the user for explicit confirmation before calling `confirm_change(userConfirmed: true)`.',
              ].join('\n'),
            },
          },
        ],
      };
    }
  );

  // 3. check_drift prompt
  server.registerPrompt(
    'check_drift',
    {
      title: 'Check Schema Drift',
      description:
        'Guides the agent to extract the latest schema from application code and check for drift against schema.dbml.',
      argsSchema: {
        project: z.string().optional().describe('Project ID or directory path'),
      },
    },
    async () => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: [
                'Please verify if the project database schema has drifted from schema-memory:',
                '1. Inspect application models, migrations, or database definitions in the repository.',
                '2. Represent the current code state in standard DBML format.',
                '3. Call `check_drift` passing `candidateDbml` to compare against canonical schema.dbml.',
                '4. Report any discrepancies found to the user and suggest next steps.',
              ].join('\n'),
            },
          },
        ],
      };
    }
  );

  // ==========================================
  // MCP TOOLS
  // ==========================================

  // 1. list_projects
  server.registerTool(
    'list_projects',
    {
      description:
        'List all registered projects managed by schema-memory, including status and pending flags.',
      inputSchema: {},
    },
    async () => {
      try {
        const projects = await listProjects();
        const details = await Promise.all(
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
        return jsonResponse(details);
      } catch (err: any) {
        return errorResponse(err.message);
      }
    }
  );

  // 2. get_schema
  server.registerTool(
    'get_schema',
    {
      description:
        'Get the canonical DBML schema and/or structured model of the project.',
      inputSchema: {
        project: z
          .string()
          .optional()
          .describe('Project ID or directory path (defaults to auto-detection)'),
        format: z
          .enum(['dbml', 'summary', 'both'])
          .optional()
          .default('both')
          .describe('Output format'),
        tables: z
          .array(z.string())
          .optional()
          .describe(
            'Optional list of table names to filter the schema and its connected relations (saves context tokens on large schemas)'
          ),
      },
    },
    async (args) => {
      try {
        const resolved = await resolveProject({ project: args.project });
        const schemaPath = resolve(resolved.path, '.schema-memory', 'schema.dbml');
        const rawDbml = (await readIfExists(schemaPath)) || '';
        const fullModel = parseSchema(rawDbml);
        const hasTableFilter = Array.isArray(args.tables) && args.tables.length > 0;
        const model = hasTableFilter
          ? filterSchemaByTables(fullModel, args.tables!, true)
          : fullModel;
        const dbml = hasTableFilter ? serializeDbml(model) : rawDbml;

        const summary = {
          tablesCount: model.tables.length,
          tables: model.tables.map((t) => ({
            name: t.name,
            columns: t.columns.map((c) => ({
              name: c.name,
              type: c.type,
              pk: c.pk || undefined,
              unique: c.unique || undefined,
              notNull: c.notNull || undefined,
            })),
            note: t.note || undefined,
          })),
          enums: model.enums.map((e) => ({
            name: e.name,
            values: e.values.map((v) => v.name),
          })),
          refsCount: model.refs.length,
        };

        const filterMeta = hasTableFilter ? { filteredTables: args.tables } : {};

        if (args.format === 'dbml') {
          return jsonResponse({ project: resolved.id, ...filterMeta, dbml });
        }
        if (args.format === 'summary') {
          return jsonResponse({ project: resolved.id, ...filterMeta, summary });
        }
        return jsonResponse({ project: resolved.id, ...filterMeta, dbml, summary });
      } catch (err: any) {
        return errorResponse(err.message);
      }
    }
  );

  // 3. get_pending_changes
  server.registerTool(
    'get_pending_changes',
    {
      description:
        'Get currently pending schema changes (from UI editor or agent) waiting to be debated and confirmed.',
      inputSchema: {
        project: z.string().optional().describe('Project ID or directory path'),
      },
    },
    async (args) => {
      try {
        const resolved = await resolveProject({ project: args.project });
        const pending = await getPending(resolved.path);
        if (!pending) {
          return jsonResponse({
            project: resolved.id,
            hasPending: false,
            message: 'No pending schema changes.',
          });
        }
        return jsonResponse({
          project: resolved.id,
          hasPending: true,
          source: pending.change.source,
          stale: pending.stale,
          changes: pending.changes,
          affects: pending.affects,
          draft: pending.draft,
          proposedDbml: pending.change.proposedDbml,
        });
      } catch (err: any) {
        return errorResponse(err.message);
      }
    }
  );

  // 4. propose_change
  server.registerTool(
    'propose_change',
    {
      description:
        'Propose a new schema as a pending change for review and debate before confirmation.',
      inputSchema: {
        project: z.string().optional().describe('Project ID or directory path'),
        dbml: z.string().describe('Proposed DBML schema content'),
        note: z.string().optional().describe('Optional context note for proposal'),
      },
    },
    async (args) => {
      try {
        const resolved = await resolveProject({ project: args.project });

        // Pre-validate DBML syntax with clear diagnostics
        const valid = validateDbml(args.dbml);
        if (!valid.ok) {
          const first = valid.errors[0];
          return errorResponse(
            `Invalid DBML syntax: ${first?.message} (line ${first?.line}, col ${first?.column})`,
            'INVALID_DBML'
          );
        }

        const details = await savePending(resolved.path, {
          proposedDbml: args.dbml,
          source: 'agent',
          note: args.note,
        });

        // Zero-diff guardrail: detect if proposed DBML matches canonical schema exactly
        if (details.changes.length === 0) {
          return jsonResponse({
            project: resolved.id,
            proposed: false,
            changesCount: 0,
            message:
              'No schema differences detected between proposed DBML and canonical schema.dbml.',
            changes: [],
            affects: [],
          });
        }

        return jsonResponse({
          project: resolved.id,
          proposed: true,
          stale: details.stale,
          changesCount: details.changes.length,
          changes: details.changes,
          affects: details.affects,
        });
      } catch (err: any) {
        return errorResponse(err.message);
      }
    }
  );

  // 5. draft_adr
  server.registerTool(
    'draft_adr',
    {
      description:
        'Create or update an ADR draft attached to the pending schema change.',
      inputSchema: {
        project: z.string().optional().describe('Project ID or directory path'),
        title: z.string().describe('Concise title of the decision'),
        context: z
          .string()
          .describe('Context and problem statement that led to this change'),
        decision: z
          .string()
          .describe('What was decided and how it is implemented'),
        alternatives: z
          .array(
            z.object({
              option: z.string().describe('Alternative option considered'),
              whyDiscarded: z.string().describe('Reason why it was discarded'),
            })
          )
          .min(1)
          .describe('Alternatives discarded and why'),
        consequences: z
          .string()
          .describe('Positive and negative consequences or trade-offs'),
      },
    },
    async (args) => {
      try {
        const resolved = await resolveProject({ project: args.project });
        const pending = await getPending(resolved.path);
        if (!pending) {
          return errorResponse(
            'Cannot draft ADR: no pending schema change exists. Call propose_change first or edit schema in UI.'
          );
        }

        const draft: AdrDraft = {
          title: args.title,
          context: args.context,
          decision: args.decision,
          alternatives: args.alternatives,
          consequences: args.consequences,
        };

        await saveAdrDraft(resolved.path, draft);
        return jsonResponse({
          project: resolved.id,
          draftSaved: true,
          draft,
        });
      } catch (err: any) {
        return errorResponse(err.message);
      }
    }
  );

  // 6. confirm_change
  server.registerTool(
    'confirm_change',
    {
      description:
        'Confirm the pending change and ADR. Writes to disk and produces engramSummary. REQUIRES userConfirmed=true.',
      inputSchema: {
        project: z.string().optional().describe('Project ID or directory path'),
        userConfirmed: z
          .boolean()
          .describe('Must be explicitly true, confirming user approval in conversation'),
      },
    },
    async (args) => {
      if (!args.userConfirmed) {
        return errorResponse(
          'Confirmation blocked: userConfirmed must be true. You must ask the user for explicit confirmation before confirming changes.'
        );
      }

      try {
        const resolved = await resolveProject({ project: args.project });
        const pending = await getPending(resolved.path);
        if (pending?.stale) {
          return errorResponse(
            'Confirmation blocked: pending change is stale. The canonical schema on disk changed after this change was proposed. Re-propose or discard.',
            'STALE_CHANGE'
          );
        }

        const result = await confirmChange(resolved.path);
        return jsonResponse({
          project: resolved.id,
          confirmed: true,
          adrId: result.adrId,
          adrPath: result.adrPath,
          changes: result.changes,
          affects: result.affects,
          engramSummary: result.engramSummary,
          instructions:
            'Now save engramSummary into Engram using your Engram tool. Then proceed to update codebase / ORM / migrations.',
        });
      } catch (err: any) {
        return errorResponse(err.message);
      }
    }
  );

  // 7. discard_change
  server.registerTool(
    'discard_change',
    {
      description: 'Discard any current pending schema change and ADR draft.',
      inputSchema: {
        project: z.string().optional().describe('Project ID or directory path'),
      },
    },
    async (args) => {
      try {
        const resolved = await resolveProject({ project: args.project });
        await clearPending(resolved.path);
        return jsonResponse({
          project: resolved.id,
          discarded: true,
        });
      } catch (err: any) {
        return errorResponse(err.message);
      }
    }
  );

  // 8. get_decisions
  server.registerTool(
    'get_decisions',
    {
      description:
        'Query past Architecture Decision Records (ADRs) with optional filters by table, column, or status.',
      inputSchema: {
        project: z.string().optional().describe('Project ID or directory path'),
        table: z.string().optional().describe('Filter by affected table name'),
        column: z.string().optional().describe('Filter by affected column name'),
        status: z
          .enum(['propuesto', 'confirmado', 'reconstruido'])
          .optional()
          .describe('Filter by ADR status'),
        limit: z.number().optional().default(20),
      },
    },
    async (args) => {
      try {
        const resolved = await resolveProject({ project: args.project });
        const adrs = await listAdrs(resolved.path, {
          table: args.table,
          column: args.column,
          status: args.status as AdrStatus | undefined,
        });

        const limited = adrs.slice(0, args.limit).map((a) => ({
          id: a.metadata.id,
          title: a.metadata.title,
          status: a.metadata.status,
          date: a.metadata.date,
          affects: a.metadata.affects,
          decision: a.decision,
        }));

        return jsonResponse({
          project: resolved.id,
          total: adrs.length,
          adrs: limited,
        });
      } catch (err: any) {
        return errorResponse(err.message);
      }
    }
  );

  // 9. get_adr
  server.registerTool(
    'get_adr',
    {
      description: 'Get the full details and markdown content of an ADR by ID.',
      inputSchema: {
        project: z.string().optional().describe('Project ID or directory path'),
        id: z.string().describe('ADR ID (e.g. "0001")'),
        includeRawMarkdown: z
          .boolean()
          .optional()
          .default(false)
          .describe('Include rawMarkdown field (defaults to false to save context tokens)'),
      },
    },
    async (args) => {
      try {
        const resolved = await resolveProject({ project: args.project });
        const adr = await readAdr(resolved.path, args.id);
        if (!adr) {
          return errorResponse(`ADR "${args.id}" not found.`);
        }
        return jsonResponse({
          project: resolved.id,
          id: adr.metadata.id,
          metadata: adr.metadata,
          context: adr.context,
          decision: adr.decision,
          alternatives: adr.alternatives,
          consequences: adr.consequences,
          diffText: adr.diffText,
          ...(args.includeRawMarkdown === true
            ? { rawMarkdown: adr.content }
            : {}),
        });
      } catch (err: any) {
        return errorResponse(err.message);
      }
    }
  );

  // 10. confirm_adr
  server.registerTool(
    'confirm_adr',
    {
      description:
        'Promote an existing "reconstruido" ADR to "confirmado" status after human review.',
      inputSchema: {
        project: z.string().optional().describe('Project ID or directory path'),
        id: z.string().describe('ADR ID to promote'),
        title: z.string().optional(),
        context: z.string().optional(),
        decision: z.string().optional(),
        consequences: z.string().optional(),
        userConfirmed: z
          .boolean()
          .describe('Must be explicitly true, confirming user approval in conversation'),
      },
    },
    async (args) => {
      if (!args.userConfirmed) {
        return errorResponse(
          'Confirmation blocked: userConfirmed must be true.'
        );
      }

      try {
        const resolved = await resolveProject({ project: args.project });
        const promoted = await promoteAdr(resolved.path, args.id, {
          title: args.title,
          context: args.context,
          decision: args.decision,
          consequences: args.consequences,
        });

        return jsonResponse({
          project: resolved.id,
          promoted: true,
          id: promoted.metadata.id,
          status: promoted.metadata.status,
        });
      } catch (err: any) {
        return errorResponse(err.message);
      }
    }
  );

  // 11. import_schema
  server.registerTool(
    'import_schema',
    {
      description:
        'Bootstrap schema-memory with an existing schema from code/migrations and optional reconstructed ADRs.',
      inputSchema: {
        project: z.string().optional().describe('Project ID or directory path'),
        dbml: z.string().describe('Initial canonical DBML schema to import'),
        adrs: z
          .array(
            z.object({
              title: z.string(),
              context: z.string(),
              decision: z.string(),
              alternatives: z.array(
                z.object({ option: z.string(), whyDiscarded: z.string() })
              ),
              consequences: z.string(),
              affects: z.array(z.string()).optional(),
            })
          )
          .optional()
          .describe('Optional initial reconstructed ADRs'),
        overwrite: z
          .boolean()
          .optional()
          .default(false)
          .describe('Whether to overwrite existing schema if not empty'),
      },
    },
    async (args) => {
      try {
        const resolved = await resolveProject({ project: args.project });
        const schemaPath = resolve(resolved.path, '.schema-memory', 'schema.dbml');
        const current = (await readIfExists(schemaPath)) || '';

        if (current.trim() && !args.overwrite) {
          const parsed = parseSchema(current);
          if (parsed.tables.length > 0) {
            return errorResponse(
              'Project already has an existing schema with tables. Pass overwrite: true to force import.'
            );
          }
        }

        const valid = validateDbml(args.dbml);
        if (!valid.ok) {
          const err = valid.errors[0];
          return errorResponse(
            `Invalid DBML: ${err?.message} (line ${err?.line})`
          );
        }

        await atomicWrite(schemaPath, args.dbml);

        const createdAdrs: string[] = [];
        if (args.adrs && args.adrs.length > 0) {
          const baseNextNum = parseInt(await nextAdrId(resolved.path), 10);
          const today = new Date().toISOString().slice(0, 10);
          await Promise.all(
            args.adrs.map(async (item, idx) => {
              const nextId = String(baseNextNum + idx).padStart(4, '0');
              const metadata: AdrMetadata = {
                id: nextId,
                title: item.title,
                status: 'reconstruido',
                date: today,
                affects: item.affects || [],
              };
              const draft: AdrDraft = {
                title: item.title,
                context: item.context,
                decision: item.decision,
                alternatives: item.alternatives,
                consequences: item.consequences,
              };
              const md = renderAdrMarkdown({
                metadata,
                draft,
              });
              await writeAdr(resolved.path, metadata, md);
              createdAdrs[idx] = nextId;
            })
          );
        }

        return jsonResponse({
          project: resolved.id,
          imported: true,
          reconstructedAdrs: createdAdrs,
        });
      } catch (err: any) {
        return errorResponse(err.message);
      }
    }
  );

  // 12. check_drift
  server.registerTool(
    'check_drift',
    {
      description:
        'Compare a candidate DBML derived from project code/migrations against schema.dbml to detect drift.',
      inputSchema: {
        project: z.string().optional().describe('Project ID or directory path'),
        candidateDbml: z
          .string()
          .describe('Candidate DBML schema extracted from code/ORM/migrations'),
      },
    },
    async (args) => {
      try {
        const resolved = await resolveProject({ project: args.project });
        const report = await checkDrift(resolved.path, args.candidateDbml);
        return jsonResponse({
          project: resolved.id,
          inSync: report.inSync,
          changesCount: report.changes.length,
          changes: report.changes,
          affected: report.affected,
          suggestion: report.suggestion,
        });
      } catch (err: any) {
        return errorResponse(err.message);
      }
    }
  );

  return server;
}
