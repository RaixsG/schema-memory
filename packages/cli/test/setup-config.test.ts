import { describe, expect, it } from 'vitest';
import {
  SETUP_TARGETS,
  SCHEMA_MEMORY_SKILL_CONTENT,
  buildAntigravityPluginManifest,
  componentsFor,
  hasComponent,
  parseSetupTargets,
  parseTargetSelection,
  resolveSetupProfile,
} from '../src/commands/setup-config.js';

describe('setup target selection', () => {
  it('expands all and preserves the explicit target order', () => {
    expect(parseSetupTargets('all')).toEqual(SETUP_TARGETS);
    expect(parseSetupTargets('opencode, agents')).toEqual([
      'opencode',
      'agents',
    ]);
    expect(parseSetupTargets('antigravity-app,antigravity-cli')).toEqual([
      'antigravity',
      'antigravity-cli',
    ]);
  });

  it('rejects unknown targets with an actionable error', () => {
    expect(() => parseSetupTargets('opencode,unknown')).toThrow(
      /Invalid setup target "unknown"/
    );
  });

  it('resolves profiles and rejects unknown values', () => {
    expect(resolveSetupProfile()).toBe('recommended');
    expect(resolveSetupProfile('minimal')).toBe('minimal');
    expect(resolveSetupProfile('strict')).toBe('strict');
    expect(() => resolveSetupProfile('turbo')).toThrow(
      /Invalid setup profile "turbo"/
    );
  });

  it('maps profiles to focused components', () => {
    expect(componentsFor('opencode', 'minimal')).toEqual(['mcp']);
    expect(componentsFor('opencode', 'recommended')).toEqual(['mcp', 'skill']);
    expect(componentsFor('opencode', 'strict')).toEqual([
      'mcp',
      'skill',
      'rules',
    ]);
    expect(componentsFor('antigravity', 'minimal')).toEqual(['mcp']);
    expect(componentsFor('antigravity', 'recommended')).toEqual(['plugin']);
    expect(componentsFor('antigravity', 'strict')).toEqual([
      'plugin',
      'rules',
    ]);
    expect(componentsFor('agents', 'strict')).toEqual(['skill']);
    expect(hasComponent('opencode', 'strict', 'rules')).toBe(true);
    expect(hasComponent('opencode', 'minimal', 'rules')).toBe(false);
  });

  it('parses interactive target selections by number, name, or detected defaults', () => {
    const detected = [
      { id: 'opencode' as const, label: 'OpenCode', detected: true },
      { id: 'antigravity' as const, label: 'Antigravity App/IDE', detected: false },
      { id: 'antigravity-cli' as const, label: 'Antigravity CLI', detected: true },
      { id: 'agents' as const, label: 'Standard Agent Skills', detected: false },
    ];

    expect(parseTargetSelection('', detected)).toEqual([
      'opencode',
      'antigravity-cli',
    ]);
    expect(parseTargetSelection('2,4', detected)).toEqual([
      'antigravity',
      'agents',
    ]);
    expect(parseTargetSelection('opencode,agents', detected)).toEqual([
      'opencode',
      'agents',
    ]);
    expect(parseTargetSelection('all', detected)).toEqual(SETUP_TARGETS);
    expect(() => parseTargetSelection('99', detected)).toThrow(
      /Invalid target number "99"/
    );
  });
});

describe('antigravity plugin content', () => {
  it('generates only the fields allowed by the official plugin schema', () => {
    const manifest = buildAntigravityPluginManifest();

    expect(manifest).toEqual({
      $schema: 'https://antigravity.google/schemas/v1/plugin.json',
      name: 'schema-memory',
      description:
        'Live database schema memory, ADR workflow and AI pair programming companion.',
    });
    expect(manifest.displayName).toBeUndefined();
    expect(manifest.suggestedPrompts).toBeUndefined();
  });

  it('documents the OpenCode prompt commands in the shared skill', () => {
    expect(SCHEMA_MEMORY_SKILL_CONTENT).toContain(
      '/schema-memory:bootstrap_project'
    );
    expect(SCHEMA_MEMORY_SKILL_CONTENT).toContain(
      '/schema-memory:debate_pending_change'
    );
    expect(SCHEMA_MEMORY_SKILL_CONTENT).toContain('/schema-memory:check_drift');
  });
});
