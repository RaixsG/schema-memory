import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import {
  planAddProject,
  applyAddProject,
  removeProject,
  resolveProject,
  listProjects,
  detectStack,
  readConfig,
  AmbiguousProjectError,
  ProjectMissingError,
} from '../src/index.js';

describe('M2: Project Management and Scaffold', () => {
  let tempHome: string;
  let tempRepo: string;
  const originalHome = process.env.SCHEMA_MEMORY_HOME;

  beforeEach(async () => {
    tempHome = await mkdtemp(join(tmpdir(), 'sm-home-'));
    tempRepo = await mkdtemp(join(tmpdir(), 'sm-repo-'));
    process.env.SCHEMA_MEMORY_HOME = tempHome;
  });

  afterEach(async () => {
    process.env.SCHEMA_MEMORY_HOME = originalHome;
    await rm(tempHome, { recursive: true, force: true });
    await rm(tempRepo, { recursive: true, force: true });
  });

  describe('Stack Detection', () => {
    it('detects prisma and django in sample fixtures', async () => {
      const prismaRepo = resolve(__dirname, '../../../fixtures/repos/prisma-repo');
      const djangoRepo = resolve(__dirname, '../../../fixtures/repos/django-repo');

      const prismaStack = await detectStack(prismaRepo);
      expect(prismaStack).toContain('prisma');

      const djangoStack = await detectStack(djangoRepo);
      expect(djangoStack).toContain('django');
    });
  });

  describe('Scaffold Planning (Dry Run)', () => {
    it('generates plan without writing any files to disk', async () => {
      const plan = await planAddProject(tempRepo);

      expect(plan.path).toBe(tempRepo);
      expect(plan.actions.length).toBeGreaterThan(0);
      expect(plan.alreadyAdded).toBe(false);

      // Verify no .schema-memory folder was created during plan
      const cfg = await readConfig(tempRepo);
      expect(cfg).toBeNull();
    });
  });

  describe('Apply and Remove Scaffold', () => {
    it('applies scaffold and preserves existing AGENTS.md content', async () => {
      const initialAgents = '# Existing Notes\nImportant rule.\n';
      await writeFile(resolve(tempRepo, 'AGENTS.md'), initialAgents, 'utf-8');

      const plan = await planAddProject(tempRepo);
      const config = await applyAddProject(plan, {
        name: 'My Store',
        dialect: 'postgres',
      });

      expect(config.id).toBe('my-store');
      expect(config.createdAgentsMd).toBe(false);

      // Verify AGENTS.md contains original content + managed block
      const agentsContent = await readFile(
        resolve(tempRepo, 'AGENTS.md'),
        'utf-8'
      );
      expect(agentsContent).toContain('# Existing Notes');
      expect(agentsContent).toContain('<!-- schema-memory:begin -->');
      expect(agentsContent).toContain('my-store');
      expect(agentsContent).toContain('<!-- schema-memory:end -->');

      // Verify registry contains the project
      const projects = await listProjects();
      expect(projects.length).toBe(1);
      expect(projects[0]?.id).toBe('my-store');

      // Revert with removeProject
      const removeResult = await removeProject('my-store', { deleteData: true });
      expect(removeResult.unlinked).toBe(true);
      expect(removeResult.dataDeleted).toBe(true);

      // Verify AGENTS.md reverted back to initial content
      const revertedAgents = await readFile(
        resolve(tempRepo, 'AGENTS.md'),
        'utf-8'
      );
      expect(revertedAgents.trim()).toBe(initialAgents.trim());
      expect(revertedAgents).not.toContain('<!-- schema-memory:begin -->');

      // Verify registry is empty
      const afterProjects = await listProjects();
      expect(afterProjects.length).toBe(0);
    });

    it('creates and later deletes AGENTS.md if it did not exist prior to scaffold', async () => {
      const plan = await planAddProject(tempRepo);
      const config = await applyAddProject(plan, { name: 'Clean Project' });

      expect(config.createdAgentsMd).toBe(true);

      const agentsPath = resolve(tempRepo, 'AGENTS.md');
      const exists = await readFile(agentsPath, 'utf-8');
      expect(exists).toContain('<!-- schema-memory:begin -->');

      // Remove project
      await removeProject(config.id);

      // AGENTS.md should be deleted because it was created by schema-memory and is now empty
      let readErr: any = null;
      try {
        await readFile(agentsPath, 'utf-8');
      } catch (err) {
        readErr = err;
      }
      expect(readErr?.code).toBe('ENOENT');
    });

    it('is idempotent when applied repeatedly', async () => {
      const plan1 = await planAddProject(tempRepo);
      await applyAddProject(plan1, { name: 'Idempotent Test' });

      const plan2 = await planAddProject(tempRepo);
      await applyAddProject(plan2, { name: 'Idempotent Test' });

      const agents = await readFile(resolve(tempRepo, 'AGENTS.md'), 'utf-8');
      const matches = agents.match(/<!-- schema-memory:begin -->/g);
      expect(matches?.length).toBe(1);
    });
  });

  describe('Project Resolution', () => {
    it('resolves by id, path, and single registered project', async () => {
      const plan = await planAddProject(tempRepo);
      const config = await applyAddProject(plan, { name: 'Resolve Test' });

      // 1. By id
      const byId = await resolveProject({ project: config.id });
      expect(byId.id).toBe(config.id);

      // 2. By path
      const byPath = await resolveProject({ project: tempRepo });
      expect(byPath.id).toBe(config.id);

      // 3. By single registered project (no args)
      const bySingle = await resolveProject({});
      expect(bySingle.id).toBe(config.id);

      // 4. By CWD inside project directory
      const subDir = resolve(tempRepo, 'src', 'deep');
      await mkdir(subDir, { recursive: true });
      const byCwd = await resolveProject({ cwd: subDir });
      expect(byCwd.id).toBe(config.id);
    });

    it('throws AmbiguousProjectError when multiple projects exist and none matched', async () => {
      const repo2 = await mkdtemp(join(tmpdir(), 'sm-repo2-'));
      try {
        const plan1 = await planAddProject(tempRepo);
        await applyAddProject(plan1, { name: 'Project 1' });

        const plan2 = await planAddProject(repo2);
        await applyAddProject(plan2, { name: 'Project 2' });

        // Calling from unrelated directory with no project arg
        let thrownError: any = null;
        try {
          await resolveProject({ cwd: tmpdir() });
        } catch (err) {
          thrownError = err;
        }

        expect(thrownError).toBeInstanceOf(AmbiguousProjectError);
      } finally {
        await rm(repo2, { recursive: true, force: true });
      }
    });

    it('throws ProjectMissingError when registered directory is deleted', async () => {
      const plan = await planAddProject(tempRepo);
      const config = await applyAddProject(plan, { name: 'Temp' });

      // Delete the directory
      await rm(tempRepo, { recursive: true, force: true });

      let thrownError: any = null;
      try {
        await resolveProject({ project: config.id });
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(ProjectMissingError);
    });
  });
});
