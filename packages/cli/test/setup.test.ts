import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  mergeOpenCodeConfig,
  mergeAntigravityMcpConfig,
  mergeGlobalAgentsMd,
  resolveGlobalInstallCommand,
  runGlobalInstall,
  setupCommand,
} from '../src/commands/setup.js';
import { runDoctorChecks } from '../src/commands/doctor.js';
import {
  isEphemeralInstall,
  isWithinDir,
} from '../src/platform.js';
import {
  shouldOfferPrompt,
  readSetupState,
  writeSetupState,
} from '../src/setup-state.js';

const isWindows = process.platform === 'win32';

describe('Universal Setup Helpers (OpenCode, Antigravity & Doctor)', () => {
  it('creates a valid opencode.json with the native V2 MCP shape when none exists', () => {
    const result = mergeOpenCodeConfig(null, '/abs/path/cli/dist/index.js');
    const parsed = JSON.parse(result);

    expect(parsed.$schema).toBe('https://opencode.ai/config.json');
    expect(parsed.mcp.servers['schema-memory']).toEqual({
      type: 'local',
      command: ['node', '/abs/path/cli/dist/index.js', 'mcp'],
    });
    // V2 does not accept an `enabled` field
    expect(parsed.mcp.servers['schema-memory'].enabled).toBeUndefined();
    expect(parsed.mcp['schema-memory']).toBeUndefined();
  });

  it('preserves existing providers, models, and other MCPs in opencode.json', () => {
    const existing = JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      theme: 'tokyonight',
      provider: { anthropic: { options: {} } },
      mcp: {
        engram: {
          type: 'local',
          command: ['engram-mcp'],
          enabled: true,
        },
        servers: {
          context7: {
            type: 'remote',
            url: 'https://mcp.context7.com/mcp',
          },
        },
      },
    });

    const result = mergeOpenCodeConfig(existing, '/abs/path/cli/dist/index.js');
    const parsed = JSON.parse(result);

    expect(parsed.theme).toBe('tokyonight');
    expect(parsed.provider.anthropic).toBeDefined();
    // Legacy V1 flat entry from another server is preserved as-is
    expect(parsed.mcp.engram).toEqual({
      type: 'local',
      command: ['engram-mcp'],
      enabled: true,
    });
    // Existing native V2 entries are preserved
    expect(parsed.mcp.servers.context7).toEqual({
      type: 'remote',
      url: 'https://mcp.context7.com/mcp',
    });
    expect(parsed.mcp.servers['schema-memory']).toEqual({
      type: 'local',
      command: ['node', '/abs/path/cli/dist/index.js', 'mcp'],
    });
  });

  it('migrates a legacy flat schema-memory entry to the native V2 shape', () => {
    const existing = JSON.stringify({
      mcp: {
        'schema-memory': {
          type: 'local',
          command: ['node', '/old/path/dist/index.js', 'mcp'],
          enabled: true,
        },
      },
    });

    const result = mergeOpenCodeConfig(existing, '/new/path/dist/index.js');
    const parsed = JSON.parse(result);

    expect(parsed.mcp['schema-memory']).toBeUndefined();
    expect(parsed.mcp.servers['schema-memory']).toEqual({
      type: 'local',
      command: ['node', '/new/path/dist/index.js', 'mcp'],
    });
  });

  it('non-destructively merges schema-memory-mcp into Antigravity mcp_config.json', () => {
    const existing = JSON.stringify({
      mcpServers: {
        context7: {
          command: 'npx',
          args: ['-y', '@upstash/context7-mcp'],
        },
      },
    });

    const result = mergeAntigravityMcpConfig(
      existing,
      '/abs/path/cli/dist/index.js'
    );
    const parsed = JSON.parse(result);

    expect(parsed.mcpServers.context7).toEqual({
      command: 'npx',
      args: ['-y', '@upstash/context7-mcp'],
    });
    expect(parsed.mcpServers['schema-memory-mcp']).toEqual({
      command: 'node',
      args: ['/abs/path/cli/dist/index.js', 'mcp'],
    });
  });

  it('idempotently injects and updates global AGENTS.md without losing existing rules', () => {
    const initial = '# My Personal OpenCode Rules\nAlways use pnpm.\n';
    const firstMerge = mergeGlobalAgentsMd(initial, '# schema-memory rule v1');

    expect(firstMerge).toContain('# My Personal OpenCode Rules');
    expect(firstMerge).toContain('<!-- schema-memory:start -->');
    expect(firstMerge).toContain('# schema-memory rule v1');
    expect(firstMerge).toContain('<!-- schema-memory:end -->');

    const secondMerge = mergeGlobalAgentsMd(firstMerge, '# schema-memory rule v2');
    expect(secondMerge).toContain('# My Personal OpenCode Rules');
    expect(secondMerge).toContain('# schema-memory rule v2');
    expect(secondMerge).not.toContain('# schema-memory rule v1');
  });

  it('verifies doctor checks against a simulated home directory', async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), 'sm-doc-home-'));
    try {
      const fakeDist = resolve(fakeHome, 'index.js');
      await writeFile(fakeDist, '// compiled cli\n', 'utf-8');

      // Write OpenCode and Antigravity configs pointing to fakeDist
      const ocDir = resolve(fakeHome, '.config', 'opencode');
      const agyDir = resolve(fakeHome, '.gemini', 'config');
      const skillDir = resolve(fakeHome, '.agents', 'skills', 'schema-memory');
      const binDir = resolve(fakeHome, '.local', 'bin');
      await mkdir(ocDir, { recursive: true });
      await mkdir(agyDir, { recursive: true });
      await mkdir(skillDir, { recursive: true });
      await mkdir(binDir, { recursive: true });

      await writeFile(
        resolve(ocDir, 'opencode.json'),
        mergeOpenCodeConfig(null, fakeDist),
        'utf-8'
      );
      await writeFile(
        resolve(agyDir, 'mcp_config.json'),
        mergeAntigravityMcpConfig(null, fakeDist),
        'utf-8'
      );
      await writeFile(resolve(skillDir, 'SKILL.md'), '# skill', 'utf-8');
      const shimName = isWindows ? 'sm.cmd' : 'sm';
      await writeFile(resolve(binDir, shimName), '@echo off\n', 'utf-8');

      const results = await runDoctorChecks({
        homeDir: fakeHome,
        cwd: fakeHome,
        cliDistPath: fakeDist,
      });

      expect(results.every((r) => r.ok)).toBe(true);
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
    }
  });

  it('detects ephemeral npx / bunx / dlx installs and registers stable runner MCP commands', async () => {
    const npxPath =
      'C:\\Users\\ana\\AppData\\Local\\npm-cache\\_npx\\abc123\\node_modules\\schema-memory\\dist\\index.js';
    const bunxPath =
      '/Users/ana/.bun/install/cache/schema-memory@0.1.1@@@1/dist/index.js';
    const dlxPath =
      '/home/ana/.pnpm-store/v3/tmp/dlx-1234/node_modules/schema-memory/dist/index.js';
    const globalPath =
      '/usr/local/lib/node_modules/schema-memory/dist/index.js';

    expect(isEphemeralInstall(npxPath)).toBe(true);
    expect(isEphemeralInstall(bunxPath)).toBe(true);
    expect(isEphemeralInstall(dlxPath)).toBe(true);
    expect(isEphemeralInstall(globalPath)).toBe(false);

    // npx registers `npx -y schema-memory mcp` instead of temporary cache path
    const ocNpx = JSON.parse(mergeOpenCodeConfig(null, npxPath));
    expect(ocNpx.mcp.servers['schema-memory'].command).toEqual([
      'npx',
      '-y',
      'schema-memory',
      'mcp',
    ]);
    const agyNpx = JSON.parse(mergeAntigravityMcpConfig(null, npxPath));
    expect(agyNpx.mcpServers['schema-memory-mcp']).toEqual({
      command: 'npx',
      args: ['-y', 'schema-memory', 'mcp'],
    });

    // bunx registers `bunx schema-memory mcp` instead of temporary cache path
    const ocBunx = JSON.parse(mergeOpenCodeConfig(null, bunxPath));
    expect(ocBunx.mcp.servers['schema-memory'].command).toEqual([
      'bunx',
      'schema-memory',
      'mcp',
    ]);
    const agyBunx = JSON.parse(mergeAntigravityMcpConfig(null, bunxPath));
    expect(agyBunx.mcpServers['schema-memory-mcp']).toEqual({
      command: 'bunx',
      args: ['schema-memory', 'mcp'],
    });
  });

  it('isWithinDir respects path boundaries', () => {
    expect(isWithinDir('/usr/local/bin/sm', '/usr/local/bin')).toBe(true);
    expect(isWithinDir('/usr/local/bin-other/sm', '/usr/local/bin')).toBe(false);
  });

  it('manages setup prompt cooldown and completion state', () => {
    const now = 1700000000000;
    const oneHour = 60 * 60 * 1000;
    const twoDays = 48 * 60 * 60 * 1000;

    // Never offered -> should offer
    expect(shouldOfferPrompt({}, now)).toBe(true);

    // Declined 1 hour ago -> should NOT offer (cooldown 24h)
    expect(
      shouldOfferPrompt(
        { lastOfferedAt: new Date(now - oneHour).toISOString() },
        now
      )
    ).toBe(false);

    // Declined 2 days ago -> should offer
    expect(
      shouldOfferPrompt(
        { lastOfferedAt: new Date(now - twoDays).toISOString() },
        now
      )
    ).toBe(true);

    // Completed setup -> never offer again
    expect(
      shouldOfferPrompt(
        {
          completedAt: new Date(now - twoDays).toISOString(),
          lastOfferedAt: new Date(now - twoDays).toISOString(),
        },
        now
      )
    ).toBe(false);

    // Interrupted setup -> should offer
    expect(
      shouldOfferPrompt(
        {
          interrupted: true,
          completedAt: new Date(now - twoDays).toISOString(),
        },
        now
      )
    ).toBe(true);
  });

  it('resolves correct global package manager install command per ephemeral runner', () => {
    expect(resolveGlobalInstallCommand('bunx')).toEqual({
      command: 'bun',
      args: ['add', '-g', 'schema-memory'],
    });
    expect(resolveGlobalInstallCommand('pnpm-dlx')).toEqual({
      command: 'pnpm',
      args: ['add', '-g', 'schema-memory'],
    });
    expect(resolveGlobalInstallCommand('npx')).toEqual({
      command: 'npm',
      args: ['i', '-g', 'schema-memory'],
    });
    expect(resolveGlobalInstallCommand(null)).toEqual({
      command: 'npm',
      args: ['i', '-g', 'schema-memory'],
    });
  });

  it('executes global install using spawn runner and handles exit codes', () => {
    const successSpawn = ((cmd: string, args: string[]) => {
      return { status: 0, error: undefined } as any;
    }) as any;

    const failSpawn = ((cmd: string, args: string[]) => {
      return { status: 1, error: undefined } as any;
    }) as any;

    const errorSpawn = ((cmd: string, args: string[]) => {
      return { status: null, error: new Error('Command failed: EACCES') } as any;
    }) as any;

    expect(runGlobalInstall('npm', ['i', '-g'], successSpawn)).toEqual({
      success: true,
      detail: undefined,
    });
    expect(runGlobalInstall('npm', ['i', '-g'], failSpawn)).toEqual({
      success: false,
      detail: 'Exited with code 1',
    });
    expect(runGlobalInstall('npm', ['i', '-g'], errorSpawn)).toEqual({
      success: false,
      detail: 'Command failed: EACCES',
    });
  });

  it('reports interrupted setup state in doctor checks', async () => {
    const fakeHome = await mkdtemp(join(tmpdir(), 'sm-doc-interrupted-'));
    try {
      const smDir = resolve(fakeHome, '.schema-memory');
      await mkdir(smDir, { recursive: true });
      await writeSetupState({ interrupted: true }, smDir);

      const state = await readSetupState(smDir);
      expect(state.interrupted).toBe(true);

      const results = await runDoctorChecks({
        homeDir: fakeHome,
        cwd: fakeHome,
      });

      const setupCheck = results.find((r) => r.name === 'Setup Status');
      expect(setupCheck).toBeDefined();
      expect(setupCheck?.ok).toBe(false);
      expect(setupCheck?.detail).toContain('cancelled or interrupted');
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
    }
  });
});

describe('Selective setup installation', () => {
  const originalHome = process.env.SCHEMA_MEMORY_HOME;

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.SCHEMA_MEMORY_HOME;
    } else {
      process.env.SCHEMA_MEMORY_HOME = originalHome;
    }
  });

  async function createFakeHome(): Promise<{
    fakeHome: string;
    fakeDist: string;
  }> {
    const fakeHome = await mkdtemp(join(tmpdir(), 'sm-setup-'));
    const fakeDist = resolve(fakeHome, 'cli', 'dist', 'index.js');
    await mkdir(dirname(fakeDist), { recursive: true });
    await writeFile(fakeDist, '// compiled cli\n', 'utf-8');
    process.env.SCHEMA_MEMORY_HOME = resolve(fakeHome, '.schema-memory');
    return { fakeHome, fakeDist };
  }

  it('writes only OpenCode files for the opencode target', async () => {
    const { fakeHome, fakeDist } = await createFakeHome();
    try {
      await setupCommand({
        target: 'opencode',
        profile: 'strict',
        homeDir: fakeHome,
        cliDistPath: fakeDist,
        skipCliInstall: true,
      });

      expect(
        existsSync(resolve(fakeHome, '.config', 'opencode', 'opencode.json'))
      ).toBe(true);
      expect(
        existsSync(
          resolve(
            fakeHome,
            '.config',
            'opencode',
            'skills',
            'schema-memory',
            'SKILL.md'
          )
        )
      ).toBe(true);
      expect(
        existsSync(resolve(fakeHome, '.config', 'opencode', 'AGENTS.md'))
      ).toBe(true);

      expect(existsSync(resolve(fakeHome, '.agents'))).toBe(false);
      expect(existsSync(resolve(fakeHome, '.gemini'))).toBe(false);
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
    }
  });

  it('writes only the Antigravity plugin bundle for the antigravity target', async () => {
    const { fakeHome, fakeDist } = await createFakeHome();
    try {
      await setupCommand({
        target: 'antigravity',
        profile: 'recommended',
        homeDir: fakeHome,
        cliDistPath: fakeDist,
        skipCliInstall: true,
      });

      const pluginDir = resolve(
        fakeHome,
        '.gemini',
        'config',
        'plugins',
        'schema-memory'
      );
      const manifest = JSON.parse(
        await readFile(resolve(pluginDir, 'plugin.json'), 'utf-8')
      );
      expect(manifest).toEqual({
        $schema: 'https://antigravity.google/schemas/v1/plugin.json',
        name: 'schema-memory',
        description:
          'Live database schema memory, ADR workflow and AI pair programming companion.',
      });
      expect(
        existsSync(resolve(pluginDir, 'skills', 'schema-memory', 'SKILL.md'))
      ).toBe(true);
      expect(existsSync(resolve(pluginDir, 'rules'))).toBe(false);

      expect(existsSync(resolve(fakeHome, '.config', 'opencode'))).toBe(false);
      expect(existsSync(resolve(fakeHome, '.agents'))).toBe(false);
      expect(
        existsSync(resolve(fakeHome, '.gemini', 'config', 'mcp_config.json'))
      ).toBe(false);
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
    }
  });

  it('uses the global MCP config for Antigravity CLI in minimal mode', async () => {
    const { fakeHome, fakeDist } = await createFakeHome();
    try {
      await setupCommand({
        target: 'antigravity-cli',
        profile: 'minimal',
        homeDir: fakeHome,
        cliDistPath: fakeDist,
        skipCliInstall: true,
      });

      expect(
        existsSync(resolve(fakeHome, '.gemini', 'config', 'mcp_config.json'))
      ).toBe(true);
      expect(
        existsSync(
          resolve(
            fakeHome,
            '.gemini',
            'config',
            'plugins',
            'schema-memory'
          )
        )
      ).toBe(false);
      expect(existsSync(resolve(fakeHome, '.schema-memory', 'plugins'))).toBe(
        false
      );
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
    }
  });

  it('writes only the standard skill for the agents target', async () => {
    const { fakeHome, fakeDist } = await createFakeHome();
    try {
      await setupCommand({
        target: 'agents',
        homeDir: fakeHome,
        cliDistPath: fakeDist,
        skipCliInstall: true,
      });

      expect(
        existsSync(
          resolve(
            fakeHome,
            '.agents',
            'skills',
            'schema-memory',
            'SKILL.md'
          )
        )
      ).toBe(true);
      expect(existsSync(resolve(fakeHome, '.config', 'opencode'))).toBe(false);
      expect(existsSync(resolve(fakeHome, '.gemini'))).toBe(false);
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
    }
  });

  it('doctor checks only the targets recorded in setup state', async () => {
    const { fakeHome, fakeDist } = await createFakeHome();
    try {
      const ocDir = resolve(fakeHome, '.config', 'opencode');
      const skillDir = resolve(ocDir, 'skills', 'schema-memory');
      const binDir = resolve(fakeHome, '.local', 'bin');
      await mkdir(skillDir, { recursive: true });
      await mkdir(binDir, { recursive: true });

      await writeFile(
        resolve(ocDir, 'opencode.json'),
        mergeOpenCodeConfig(null, fakeDist),
        'utf-8'
      );
      await writeFile(
        resolve(skillDir, 'SKILL.md'),
        '# skill',
        'utf-8'
      );
      const shimName = isWindows ? 'sm.cmd' : 'sm';
      await writeFile(resolve(binDir, shimName), '@echo off\n', 'utf-8');

      await writeSetupState(
        { targets: ['opencode'], profile: 'recommended' },
        resolve(fakeHome, '.schema-memory')
      );

      const results = await runDoctorChecks({
        homeDir: fakeHome,
        cwd: fakeHome,
        cliDistPath: fakeDist,
      });

      expect(results.find((r) => r.name === 'OpenCode MCP (opencode.json)')?.ok).toBe(
        true
      );
      expect(results.find((r) => r.name === 'OpenCode Skill')?.ok).toBe(true);
      expect(
        results.find((r) => r.name === 'Antigravity Global MCP (mcp_config.json)')
      ).toBeUndefined();
      expect(
        results.find((r) => r.name === 'Universal Skill (~/.agents/skills)')
      ).toBeUndefined();
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
    }
  });
});
