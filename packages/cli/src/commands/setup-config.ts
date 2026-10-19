import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { findCommandOnPath } from '../platform/index.js';

export type SetupTarget =
  | 'opencode'
  | 'antigravity'
  | 'antigravity-cli'
  | 'agents';

export type SetupTargetSelection = SetupTarget | 'all';

export type SetupProfile = 'minimal' | 'recommended' | 'strict';

export type SetupComponent = 'mcp' | 'skill' | 'rules' | 'plugin';

export const SETUP_TARGETS: SetupTarget[] = [
  'opencode',
  'antigravity',
  'antigravity-cli',
  'agents',
];

export const SETUP_PROFILES: SetupProfile[] = [
  'minimal',
  'recommended',
  'strict',
];

export const SETUP_TARGET_LABELS: Record<SetupTarget, string> = {
  opencode: 'OpenCode',
  antigravity: 'Antigravity App/IDE',
  'antigravity-cli': 'Antigravity CLI',
  agents: 'Standard Agent Skills',
};

export const SCHEMA_MEMORY_SKILL_CONTENT = `---
name: schema-memory
description: Workflow rules for inspecting database schemas, debating pending changes, creating ADRs, and maintaining memory in Engram.
---

# schema-memory AI Workflow

Always follow these 8 steps when touching database schemas in any registered client project:

1. **Inspect Existing Context**: Call \`get_decisions\` and \`get_schema\` first (always pass the \`project\` ID or path).
2. **Detect Pending Changes**: Call \`get_pending_changes\` to see what was edited in the UI.
3. **Engage in Targeted Debate**: Interrogate the user about the "why", trade-offs, and discarded alternatives. Ask one focused question at a time.
4. **Draft the ADR**: Call \`draft_adr\` with structured context, decision, alternatives, and consequences.
5. **Request Explicit Approval**: Present the summary to the user and ask for explicit confirmation.
6. **Confirm the Change**: Call \`confirm_change(userConfirmed=true)\`.
7. **Persist to Engram**: Save the returned \`engramSummary\` into Engram using your Engram tool.
8. **Update Code / Migrations**: ONLY now proceed to update ORM models or database migration files.

## Guided MCP Prompts

When the host exposes MCP prompts as slash commands, prefer these entry points:

- \`bootstrap_project\`: inspect the repository, infer DBML, and import the initial schema.
- \`debate_pending_change\`: review pending changes, debate trade-offs, and draft an ADR.
- \`check_drift\`: compare the current code schema against \`schema.dbml\`.

In OpenCode the commands are namespaced by the MCP server key: \`/schema-memory:bootstrap_project\`, \`/schema-memory:debate_pending_change\`, and \`/schema-memory:check_drift\`.

## Strict Isolation Guardrails

- **Use ONLY MCP tools**: Interact with \`schema-memory\` exclusively through its MCP tools (\`schema-memory\` / \`schema-memory-mcp\`).
- **NEVER inspect the schema-memory repository**: When working on a client project, NEVER search for, read, or analyze the \`schema-memory\` tool's own source code repository. Inspect only the client project's files.
- **Fail-fast if MCP is missing**: If the MCP tools (\`get_schema\`, \`import_schema\`, \`get_pending_changes\`, etc.) are not available in your active session, STOP immediately without searching the filesystem and ask the user to run \`sm setup\` (or \`npx schema-memory setup\` / \`bunx schema-memory setup\`) and reload the agent session.
`;

export const SCHEMA_MEMORY_RULES_CONTENT = `# schema-memory Global Rule
When working on a repository that contains \`.schema-memory/\` or references \`schema-memory\` in \`AGENTS.md\`:
1. Call \`get_decisions\` and \`get_schema\` (passing \`project\`) before making or proposing any database schema change.
2. Never write schema changes directly to code without recording decisions via \`confirm_change(userConfirmed=true)\`.
3. **Strict Isolation**: Interact with \`schema-memory\` ONLY via its MCP tools (\`schema-memory\` / \`schema-memory-mcp\`). NEVER search for or read the \`schema-memory\` source code repository. If the MCP tools are not loaded in your current session, stop immediately and ask the user to run \`sm setup\` (or \`npx schema-memory setup\` / \`bunx schema-memory setup\`) and reload the agent.
`;

export function parseSetupTargets(raw?: string): SetupTarget[] {
  if (!raw || raw.trim() === '') {
    return [...SETUP_TARGETS];
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'all') {
    return [...SETUP_TARGETS];
  }

  const tokens = normalized
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error(
      'No setup targets provided. Use "all" or a comma-separated list of: opencode, antigravity, antigravity-cli, agents.'
    );
  }

  const targets: SetupTarget[] = [];
  for (const token of tokens) {
    const aliased =
      token === 'antigravity-app' || token === 'antigravity-ide'
        ? 'antigravity'
        : token === 'skills' || token === 'skill'
          ? 'agents'
          : token;

    if (!SETUP_TARGETS.includes(aliased as SetupTarget)) {
      throw new Error(
        `Invalid setup target "${token}". Valid targets: all, opencode, antigravity, antigravity-cli, agents.`
      );
    }

    const target = aliased as SetupTarget;
    if (!targets.includes(target)) {
      targets.push(target);
    }
  }

  return targets;
}

export function resolveSetupProfile(raw?: string): SetupProfile {
  if (!raw || raw.trim() === '') {
    return 'recommended';
  }

  const normalized = raw.trim().toLowerCase();
  if (!SETUP_PROFILES.includes(normalized as SetupProfile)) {
    throw new Error(
      `Invalid setup profile "${raw}". Valid profiles: minimal, recommended, strict.`
    );
  }

  return normalized as SetupProfile;
}

export function componentsFor(
  target: SetupTarget,
  profile: SetupProfile
): SetupComponent[] {
  if (target === 'agents') {
    return ['skill'];
  }

  if (target === 'opencode') {
    if (profile === 'minimal') return ['mcp'];
    if (profile === 'recommended') return ['mcp', 'skill'];
    return ['mcp', 'skill', 'rules'];
  }

  if (profile === 'minimal') {
    return ['mcp'];
  }

  if (profile === 'recommended') {
    return ['plugin'];
  }

  return ['plugin', 'rules'];
}

export function hasComponent(
  target: SetupTarget,
  profile: SetupProfile,
  component: SetupComponent
): boolean {
  return componentsFor(target, profile).includes(component);
}

export interface DetectedSetupTarget {
  id: SetupTarget;
  label: string;
  detected: boolean;
}

export function detectSetupTargets(homeDir: string): DetectedSetupTarget[] {
  const hasOpenCode =
    existsSync(resolve(homeDir, '.config', 'opencode')) ||
    findCommandOnPath('opencode') !== null;
  const hasAntigravityConfig = existsSync(resolve(homeDir, '.gemini', 'config'));
  const hasAgy = findCommandOnPath('agy') !== null;

  return [
    {
      id: 'opencode',
      label: SETUP_TARGET_LABELS.opencode,
      detected: hasOpenCode,
    },
    {
      id: 'antigravity',
      label: SETUP_TARGET_LABELS.antigravity,
      detected: hasAntigravityConfig || hasAgy,
    },
    {
      id: 'antigravity-cli',
      label: SETUP_TARGET_LABELS['antigravity-cli'],
      detected: hasAgy,
    },
    {
      id: 'agents',
      label: SETUP_TARGET_LABELS.agents,
      detected: existsSync(resolve(homeDir, '.agents')),
    },
  ];
}

export function parseTargetSelection(
  raw: string,
  detected: DetectedSetupTarget[]
): SetupTarget[] {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'all') {
    return [...SETUP_TARGETS];
  }

  if (trimmed === '') {
    const selected = detected.filter((item) => item.detected).map((item) => item.id);
    if (selected.length > 0) {
      return selected;
    }
    return ['opencode', 'antigravity', 'agents'];
  }

  const tokens = trimmed
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  const targets: SetupTarget[] = [];
  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const index = Number(token) - 1;
      const item = detected[index];
      if (!item) {
        throw new Error(`Invalid target number "${token}".`);
      }
      if (!targets.includes(item.id)) {
        targets.push(item.id);
      }
      continue;
    }

    for (const target of parseSetupTargets(token)) {
      if (!targets.includes(target)) {
        targets.push(target);
      }
    }
  }

  return targets;
}

export function buildAntigravityPluginManifest(): Record<string, unknown> {
  return {
    $schema: 'https://antigravity.google/schemas/v1/plugin.json',
    name: 'schema-memory',
    description:
      'Live database schema memory, ADR workflow and AI pair programming companion.',
  };
}

export function antigravityPluginRelativePaths(profile: SetupProfile): string[] {
  const paths = ['plugin.json', 'mcp_config.json'];
  if (profile !== 'minimal') {
    paths.push('skills/schema-memory/SKILL.md');
  }
  if (profile === 'strict') {
    paths.push('rules/AGENTS.md');
  }
  return paths;
}
