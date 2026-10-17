import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { planAddProject, applyAddProject } from '@schema-memory/core';
import { createMcpServer } from '../src/server.js';

describe('M4: MCP Server and Tool Integration', () => {
  let tempHome: string;
  let tempRepo: string;
  const originalHome = process.env.SCHEMA_MEMORY_HOME;
  let client: Client;
  let server: ReturnType<typeof createMcpServer>;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'sm-mcp-home-'));
    tempRepo = await mkdtemp(join(tmpdir(), 'sm-mcp-repo-'));
    process.env.SCHEMA_MEMORY_HOME = tempHome;

    const plan = await planAddProject(tempRepo);
    await applyAddProject(plan, { name: 'MCP Test Project' });

    server = createMcpServer();
    client = new Client(
      { name: 'test-agent', version: '1.0.0' },
      { capabilities: {} }
    );

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    process.env.SCHEMA_MEMORY_HOME = originalHome;
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempRepo, { recursive: true, force: true });
  });

  it('registers all 12 MCP tools with expected names and schemas', async () => {
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);

    const expectedTools = [
      'list_projects',
      'get_schema',
      'get_pending_changes',
      'propose_change',
      'draft_adr',
      'confirm_change',
      'discard_change',
      'get_decisions',
      'get_adr',
      'confirm_adr',
      'import_schema',
      'check_drift',
    ];

    for (const name of expectedTools) {
      expect(toolNames).toContain(name);
    }
    expect(tools.length).toBe(12);
  });

  it('exposes native MCP resources and templates for ambient schema access', async () => {
    // 1. List resource templates
    const { resourceTemplates } = await client.listResourceTemplates();
    const uris = resourceTemplates?.map((r) => r.uriTemplate) || [];
    expect(uris).toContain('schema://{project}/dbml');
    expect(uris).toContain('schema://{project}/model');
    expect(uris).toContain('schema://{project}/pending');
    expect(uris).toContain('schema://{project}/adrs');
    expect(uris).toContain('adr://{project}/{id}');

    // 2. Read canonical DBML resource
    const dbmlRes = await client.readResource({
      uri: 'schema://mcp-test-project/dbml',
    });
    expect(dbmlRes.contents.length).toBe(1);
    expect(dbmlRes.contents[0].mimeType).toBe('text/plain');

    // 3. Read model AST resource
    const modelRes = await client.readResource({
      uri: 'schema://mcp-test-project/model',
    });
    expect(modelRes.contents.length).toBe(1);
    expect(modelRes.contents[0].mimeType).toBe('application/json');
    const modelObj = JSON.parse(modelRes.contents[0].text as string);
    expect(modelObj.tables).toBeDefined();
  });

  it('exposes interactive MCP prompts for guided agent workflows', async () => {
    const { prompts } = await client.listPrompts();
    const promptNames = prompts.map((p) => p.name);
    expect(promptNames).toContain('bootstrap_project');
    expect(promptNames).toContain('debate_pending_change');
    expect(promptNames).toContain('check_drift');

    // Test getPrompt on debate_pending_change
    const promptRes = await client.getPrompt({
      name: 'debate_pending_change',
      arguments: { project: 'mcp-test-project' },
    });
    expect(promptRes.messages.length).toBe(1);
    expect(promptRes.messages[0].content.text).toContain('debate the pending schema change');
  });

  it('enforces zero-diff guardrail in propose_change', async () => {
    // Initial import
    const dbml = 'Table users {\n  id int [pk]\n}\n';
    await client.callTool({
      name: 'import_schema',
      arguments: {
        project: 'mcp-test-project',
        dbml,
      },
    });

    // Propose identical DBML
    const res = (await client.callTool({
      name: 'propose_change',
      arguments: {
        project: 'mcp-test-project',
        dbml,
      },
    })) as any;

    const data = JSON.parse(res.content[0].text);
    expect(data.proposed).toBe(false);
    expect(data.changesCount).toBe(0);
    expect(data.message).toContain('No schema differences detected');
  });

  it('runs complete agent lifecycle: import -> propose -> debate -> confirm -> drift', async () => {
    // 1. list_projects
    const listRes = (await client.callTool({
      name: 'list_projects',
      arguments: {},
    })) as any;
    const projects = JSON.parse(listRes.content[0].text);
    expect(projects.length).toBe(1);
    expect(projects[0].name).toBe('MCP Test Project');

    // 2. import_schema
    const initialDbml = 'Table users {\n  id int [pk]\n}\n';
    const importRes = (await client.callTool({
      name: 'import_schema',
      arguments: {
        project: 'mcp-test-project',
        dbml: initialDbml,
        adrs: [
          {
            title: 'Initial Users Table',
            context: 'System needs user identity',
            decision: 'Create users table',
            alternatives: [{ option: 'External auth', whyDiscarded: 'Too early' }],
            consequences: 'Local users managed',
            affects: ['users'],
          },
        ],
      },
    })) as any;
    const importData = JSON.parse(importRes.content[0].text);
    expect(importData.imported).toBe(true);
    expect(importData.reconstructedAdrs.length).toBe(1);

    // 3. get_decisions
    const decisionsRes = (await client.callTool({
      name: 'get_decisions',
      arguments: { project: 'mcp-test-project', table: 'users' },
    })) as any;
    const decisions = JSON.parse(decisionsRes.content[0].text);
    expect(decisions.total).toBe(1);
    expect(decisions.adrs[0].title).toBe('Initial Users Table');
    expect(decisions.adrs[0].status).toBe('reconstruido');

    // 4. confirm_adr (promoting reconstructed ADR)
    const confirmAdrRes = (await client.callTool({
      name: 'confirm_adr',
      arguments: {
        project: 'mcp-test-project',
        id: decisions.adrs[0].id,
        userConfirmed: true,
      },
    })) as any;
    const promoted = JSON.parse(confirmAdrRes.content[0].text);
    expect(promoted.promoted).toBe(true);
    expect(promoted.status).toBe('confirmado');

    // 5. propose_change
    const proposedDbml =
      'Table users {\n  id int [pk]\n  email varchar [unique]\n}\n';
    const proposeRes = (await client.callTool({
      name: 'propose_change',
      arguments: {
        project: 'mcp-test-project',
        dbml: proposedDbml,
        note: 'Adding user email',
      },
    })) as any;
    const proposeData = JSON.parse(proposeRes.content[0].text);
    expect(proposeData.proposed).toBe(true);
    expect(proposeData.changes.length).toBe(1);

    // 6. get_pending_changes
    const pendingRes = (await client.callTool({
      name: 'get_pending_changes',
      arguments: { project: 'mcp-test-project' },
    })) as any;
    const pendingData = JSON.parse(pendingRes.content[0].text);
    expect(pendingData.hasPending).toBe(true);
    expect(pendingData.affects).toContain('users.email');

    // 7. draft_adr
    const draftRes = (await client.callTool({
      name: 'draft_adr',
      arguments: {
        project: 'mcp-test-project',
        title: 'Add email to users',
        context: 'Need email for login',
        decision: 'Add unique email column',
        alternatives: [
          { option: 'Phone number', whyDiscarded: 'Email preferred for MVP' },
        ],
        consequences: 'Requires migration',
      },
    })) as any;
    const draftData = JSON.parse(draftRes.content[0].text);
    expect(draftData.draftSaved).toBe(true);

    // 8. confirm_change without userConfirmed -> blocked!
    const unconfirmedRes = (await client.callTool({
      name: 'confirm_change',
      arguments: {
        project: 'mcp-test-project',
        userConfirmed: false,
      },
    })) as any;
    expect(unconfirmedRes.isError).toBe(true);

    // 9. confirm_change with userConfirmed: true -> confirmed!
    const confirmedRes = (await client.callTool({
      name: 'confirm_change',
      arguments: {
        project: 'mcp-test-project',
        userConfirmed: true,
      },
    })) as any;
    const confirmData = JSON.parse(confirmedRes.content[0].text);
    expect(confirmData.confirmed).toBe(true);
    expect(confirmData.adrId).toBe('0002');
    expect(confirmData.engramSummary).toContain('ADR-0002');
    expect(confirmData.engramSummary).toContain('Add email to users');

    // 10. check_drift
    const driftRes = (await client.callTool({
      name: 'check_drift',
      arguments: {
        project: 'mcp-test-project',
        candidateDbml: proposedDbml,
      },
    })) as any;
    const driftData = JSON.parse(driftRes.content[0].text);
    expect(driftData.inSync).toBe(true);

    // 11. get_schema with tables filter
    const filteredSchemaRes = (await client.callTool({
      name: 'get_schema',
      arguments: {
        project: 'mcp-test-project',
        tables: ['users'],
      },
    })) as any;
    const filteredSchemaData = JSON.parse(filteredSchemaRes.content[0].text);
    expect(filteredSchemaData.filteredTables).toEqual(['users']);
    expect(filteredSchemaData.summary.tables.length).toBe(1);
    expect(filteredSchemaData.summary.tables[0].name).toBe('users');

    // 12. get_adr with includeRawMarkdown: false (default) vs true
    const adrCompactRes = (await client.callTool({
      name: 'get_adr',
      arguments: {
        project: 'mcp-test-project',
        id: '0002',
      },
    })) as any;
    const adrCompactData = JSON.parse(adrCompactRes.content[0].text);
    expect(adrCompactData.id).toBe('0002');
    expect(adrCompactData.rawMarkdown).toBeUndefined();

    const adrFullRes = (await client.callTool({
      name: 'get_adr',
      arguments: {
        project: 'mcp-test-project',
        id: '0002',
        includeRawMarkdown: true,
      },
    })) as any;
    const adrFullData = JSON.parse(adrFullRes.content[0].text);
    expect(adrFullData.rawMarkdown).toContain('## Contexto');
  });
});
