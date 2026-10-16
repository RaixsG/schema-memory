import { describe, it, expect } from 'vitest';
import {
  mergeOpenCodeConfig,
  mergeGlobalAgentsMd,
} from '../src/commands/setup.js';

describe('Universal Setup Helpers (OpenCode & Global AGENTS.md)', () => {
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
});
