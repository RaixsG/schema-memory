import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  planAddProject,
  applyAddProject,
  adoptProject,
  ProjectConflictError,
  listProjects,
  readConfig,
  clearRegistryCache,
} from '../src/index.js';

describe('Adopt already-configured projects', () => {
  let home: string;
  let repoA: string;
  let repoB: string;
  const originalHome = process.env.SCHEMA_MEMORY_HOME;

  async function makeConfiguredRepo(dir: string, id: string) {
    const sm = join(dir, '.schema-memory');
    await mkdir(join(sm, 'adr'), { recursive: true });
    await writeFile(
      join(sm, 'config.json'),
      JSON.stringify(
        {
          version: 1,
          id,
          name: 'Cloned Shop',
          dialect: 'mysql',
          stack: [],
          createdAgentsMd: false,
          createdAt: '2025-01-01T00:00:00.000Z',
        },
        null,
        2
      ) + '\n'
    );
    await writeFile(
      join(sm, 'schema.dbml'),
      'Table users {\n  id int [pk]\n}\n'
    );
    await writeFile(join(sm, 'layout.json'), '{"users":{"x":1,"y":2}}\n');
    await writeFile(join(sm, '.gitignore'), 'custom-entry\n');
  }

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), 'sm-adopt-home-'));
    repoA = await mkdtemp(join(tmpdir(), 'sm-adopt-a-'));
    repoB = await mkdtemp(join(tmpdir(), 'sm-adopt-b-'));
    process.env.SCHEMA_MEMORY_HOME = home;
    clearRegistryCache();
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env.SCHEMA_MEMORY_HOME;
    else process.env.SCHEMA_MEMORY_HOME = originalHome;
    clearRegistryCache();
    await rm(home, { recursive: true, force: true });
    await rm(repoA, { recursive: true, force: true });
    await rm(repoB, { recursive: true, force: true });
  });

  it('plans a fresh folder as mode "new"', async () => {
    const plan = await planAddProject(repoA);
    expect(plan.mode).toBe('new');
    expect(plan.needsBootstrap).toBe(true);
    expect(plan.existing).toBeUndefined();
  });

  it('plans a configured repo as mode "adopt" with existing info', async () => {
    await makeConfiguredRepo(repoA, 'cloned-shop');
    const plan = await planAddProject(repoA);
    expect(plan.mode).toBe('adopt');
    expect(plan.existing).toMatchObject({
      id: 'cloned-shop',
      name: 'Cloned Shop',
      dialect: 'mysql',
      tablesCount: 1,
      adrCount: 0,
      hasSchema: true,
    });
    expect(plan.needsBootstrap).toBe(false);
    expect(plan.registry.registered).toBe(false);
    expect(plan.registry.conflict).toBeUndefined();
    // Only the managed AGENTS.md block may be touched.
    expect(plan.actions.map((a) => a.file)).toEqual(['AGENTS.md']);
  });

  it('applyAddProject adopts without overwriting repo config or files', async () => {
    await makeConfiguredRepo(repoA, 'cloned-shop');
    const plan = await planAddProject(repoA);
    const config = await applyAddProject(plan, {
      name: 'SHOULD BE IGNORED',
      dialect: 'postgres',
    });

    expect(config.id).toBe('cloned-shop');
    expect(config.name).toBe('Cloned Shop');
    expect(config.dialect).toBe('mysql');

    const onDisk = await readConfig(repoA);
    expect(onDisk?.createdAt).toBe('2025-01-01T00:00:00.000Z');
    expect(onDisk?.dialect).toBe('mysql');

    expect(
      await readFile(join(repoA, '.schema-memory', '.gitignore'), 'utf8')
    ).toBe('custom-entry\n');
    expect(
      await readFile(join(repoA, '.schema-memory', 'layout.json'), 'utf8')
    ).toBe('{"users":{"x":1,"y":2}}\n');

    const projects = await listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({ id: 'cloned-shop', name: 'Cloned Shop' });

    // Now it is reported as registered.
    const replan = await planAddProject(repoA);
    expect(replan.registry.registered).toBe(true);
  });

  it('throws ProjectConflictError when the id is registered at another path', async () => {
    await makeConfiguredRepo(repoA, 'cloned-shop');
    await makeConfiguredRepo(repoB, 'cloned-shop');
    await adoptProject(await planAddProject(repoA));

    const planB = await planAddProject(repoB);
    expect(planB.registry.conflict?.id).toBe('cloned-shop');

    await expect(adoptProject(planB)).rejects.toBeInstanceOf(
      ProjectConflictError
    );
    expect(await listProjects()).toHaveLength(1);
  });

  it('resolves a conflict with "replace" (repoints the registry entry)', async () => {
    await makeConfiguredRepo(repoA, 'cloned-shop');
    await makeConfiguredRepo(repoB, 'cloned-shop');
    await adoptProject(await planAddProject(repoA));

    await adoptProject(await planAddProject(repoB), {
      resolveConflict: 'replace',
    });

    const projects = await listProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0]!.path).toBe(repoB);
    expect((await readConfig(repoB))?.id).toBe('cloned-shop');
  });

  it('resolves a conflict with "new" (distinct id, updates repo config.id)', async () => {
    await makeConfiguredRepo(repoA, 'cloned-shop');
    await makeConfiguredRepo(repoB, 'cloned-shop');
    await adoptProject(await planAddProject(repoA));

    const config = await adoptProject(await planAddProject(repoB), {
      resolveConflict: 'new',
    });

    expect(config.id).toBe('cloned-shop-2');
    expect((await readConfig(repoB))?.id).toBe('cloned-shop-2');
    expect((await readConfig(repoB))?.createdAt).toBe(
      '2025-01-01T00:00:00.000Z'
    );
    const agents = await readFile(join(repoB, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('cloned-shop-2');

    const projects = await listProjects();
    expect(projects.map((p) => p.id).sort()).toEqual([
      'cloned-shop',
      'cloned-shop-2',
    ]);
  });
});
