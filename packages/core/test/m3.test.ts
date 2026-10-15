import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import {
  planAddProject,
  applyAddProject,
  savePending,
  getPending,
  saveAdrDraft,
  clearPending,
  confirmChange,
  listAdrs,
  readAdr,
  promoteAdr,
  checkDrift,
  writeAdr,
  AdrDraft,
  AdrMetadata,
} from '../src/index.js';

describe('M3: Pending Changes, ADR Lifecycle, and Confirmation', () => {
  let tempHome: string;
  let tempRepo: string;
  const originalHome = process.env.SCHEMA_MEMORY_HOME;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'sm-home-'));
    tempRepo = await mkdtemp(join(tmpdir(), 'sm-repo-'));
    process.env.SCHEMA_MEMORY_HOME = tempHome;

    const plan = await planAddProject(tempRepo);
    await applyAddProject(plan, { name: 'M3 Test' });
  });

  afterEach(async () => {
    process.env.SCHEMA_MEMORY_HOME = originalHome;
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempRepo, { recursive: true, force: true });
  });

  it('manages pending change lifecycle with stale detection', async () => {
    const initialDbml = 'Table users {\n  id int [pk]\n}\n';
    await writeFile(
      resolve(tempRepo, '.schema-memory', 'schema.dbml'),
      initialDbml,
      'utf-8'
    );

    const proposed = 'Table users {\n  id int [pk]\n  email varchar\n}\n';
    const pending = await savePending(tempRepo, {
      proposedDbml: proposed,
      source: 'ui',
    });

    expect(pending.stale).toBe(false);
    expect(pending.affects).toContain('users.email');
    expect(pending.changes.length).toBe(1);

    // Modify schema.dbml on disk directly to simulate external drift
    await writeFile(
      resolve(tempRepo, '.schema-memory', 'schema.dbml'),
      'Table users {\n  id int [pk]\n  name varchar\n}\n',
      'utf-8'
    );

    const stalePending = await getPending(tempRepo);
    expect(stalePending?.stale).toBe(true);

    // Confirmation should fail when stale
    await expect(
      confirmChange(tempRepo, {
        draft: {
          title: 'Add email',
          context: 'Need email',
          decision: 'Add email column',
          alternatives: [{ option: 'Phone', whyDiscarded: 'No' }],
          consequences: 'Done',
        },
      })
    ).rejects.toThrow(/stale/);
  });

  it('executes confirmChange transaction and produces engram summary', async () => {
    const initialDbml = 'Table users {\n  id int [pk]\n}\n';
    await writeFile(
      resolve(tempRepo, '.schema-memory', 'schema.dbml'),
      initialDbml,
      'utf-8'
    );

    const proposed = 'Table users {\n  id int [pk]\n  email varchar [unique]\n}\n';
    await savePending(tempRepo, {
      proposedDbml: proposed,
      source: 'agent',
    });

    const draft: AdrDraft = {
      title: 'Add unique email to users',
      context: 'Users need a way to log in and receive notifications.',
      decision: 'Add unique varchar column email to users table.',
      alternatives: [
        {
          option: 'Username login',
          whyDiscarded: 'Less universal than email for password reset flows',
        },
      ],
      consequences: 'Requires email validation and migration script.',
    };

    await saveAdrDraft(tempRepo, draft);

    const result = await confirmChange(tempRepo);
    expect(result.adrId).toBe('0001');
    expect(result.affects).toContain('users.email');
    expect(result.engramSummary).toContain('[schema-memory]');
    expect(result.engramSummary).toContain('ADR-0001');
    expect(result.engramSummary).toContain('Add unique varchar column email');

    // Verify schema.dbml on disk updated
    const updatedDbml = await readFile(
      resolve(tempRepo, '.schema-memory', 'schema.dbml'),
      'utf-8'
    );
    expect(updatedDbml).toBe(proposed);

    // Verify pending is cleared
    const pendingAfter = await getPending(tempRepo);
    expect(pendingAfter).toBeNull();

    // Verify ADR file exists and is queryable
    const adrs = await listAdrs(tempRepo);
    expect(adrs.length).toBe(1);
    expect(adrs[0]?.metadata.id).toBe('0001');
    expect(adrs[0]?.metadata.status).toBe('confirmado');
    expect(adrs[0]?.decision).toContain('Add unique varchar column');
  });

  it('filters ADRs by table and column', async () => {
    const meta1: AdrMetadata = {
      id: '0001',
      title: 'Create orders',
      status: 'confirmado',
      date: '2026-10-15',
      affects: ['orders', 'orders.total', 'users'],
    };
    await writeAdr(tempRepo, meta1, '---\nid: "0001"\ntitle: "Create orders"\nstatus: confirmado\ndate: 2026-10-15\naffects: ["orders", "orders.total", "users"]\n---\n## Contexto\nC1\n## Decisión\nD1\n## Alternativas descartadas\n- **A**: B\n## Consecuencias\nCons\n');

    const meta2: AdrMetadata = {
      id: '0002',
      title: 'Add products',
      status: 'reconstruido',
      date: '2026-10-15',
      affects: ['products', 'products.price'],
    };
    await writeAdr(tempRepo, meta2, '---\nid: "0002"\ntitle: "Add products"\nstatus: reconstruido\ndate: 2026-10-15\naffects: ["products", "products.price"]\n---\n## Contexto\nC2\n## Decisión\nD2\n## Alternativas descartadas\n- **A**: B\n## Consecuencias\nCons\n');

    // Filter by table 'orders'
    const ordersAdrs = await listAdrs(tempRepo, { table: 'orders' });
    expect(ordersAdrs.length).toBe(1);
    expect(ordersAdrs[0]?.metadata.id).toBe('0001');

    // Filter by table + column 'orders.total'
    const totalAdrs = await listAdrs(tempRepo, {
      table: 'orders',
      column: 'total',
    });
    expect(totalAdrs.length).toBe(1);
    expect(totalAdrs[0]?.metadata.id).toBe('0001');

    // Filter by status 'reconstruido'
    const reconAdrs = await listAdrs(tempRepo, { status: 'reconstruido' });
    expect(reconAdrs.length).toBe(1);
    expect(reconAdrs[0]?.metadata.id).toBe('0002');

    // Promote reconstructed ADR to confirmed
    const promoted = await promoteAdr(tempRepo, '0002', {
      decision: 'Approved product table',
    });
    expect(promoted.metadata.status).toBe('confirmado');
    expect(promoted.decision).toBe('Approved product table');
  });

  it('detects schema drift accurately', async () => {
    const current = 'Table users {\n  id int [pk]\n}\n';
    await writeFile(
      resolve(tempRepo, '.schema-memory', 'schema.dbml'),
      current,
      'utf-8'
    );

    // 1. In sync
    const report1 = await checkDrift(tempRepo, current);
    expect(report1.inSync).toBe(true);
    expect(report1.changes.length).toBe(0);

    // 2. Out of sync
    const candidate = 'Table users {\n  id int [pk]\n  bio text\n}\n';
    const report2 = await checkDrift(tempRepo, candidate);
    expect(report2.inSync).toBe(false);
    expect(report2.changes.length).toBe(1);
    expect(report2.affected).toContain('users.bio');
    expect(report2.suggestion).toContain('propose_change');
  });
});
