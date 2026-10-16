import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  mergeOpenCodeConfig,
  mergeAntigravityMcpConfig,
  mergeGlobalAgentsMd,
} from '../src/commands/setup.js';
import { runDoctorChecks } from '../src/commands/doctor.js';

describe('Universal Setup Helpers (OpenCode, Antigravity & Doctor)', () => {
  it('creates a valid opencode.json when none exists', () => {
    const result = mergeOpenCodeConfig(null, '/abs/path/cli/dist/index.js');
    const parsed = JSON.parse(result);

    expect(parsed.$schema).toBe('https://opencode.ai/config.json');
    expect(parsed.mcp['schema-memory']).toEqual({
      type: 'local',
      command: ['node', '/abs/path/cli/dist/index.js', 'mcp'],
      enabled: true,
    });
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
      },
    });

    const result = mergeOpenCodeConfig(existing, '/abs/path/cli/dist/index.js');
    const parsed = JSON.parse(result);

    expect(parsed.theme).toBe('tokyonight');
    expect(parsed.provider.anthropic).toBeDefined();
    expect(parsed.mcp.engram).toEqual({
      type: 'local',
      command: ['engram-mcp'],
      enabled: true,
    });
    expect(parsed.mcp['schema-memory']).toEqual({
      type: 'local',
      command: ['node', '/abs/path/cli/dist/index.js', 'mcp'],
      enabled: true,
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
      await writeFile(resolve(binDir, 'sm'), '#!/usr/bin/env node\n', 'utf-8');

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
});
