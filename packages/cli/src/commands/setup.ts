import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chmod, rm, symlink } from 'node:fs/promises';
import { atomicWrite, ensureDir, readIfExists } from '@schema-memory/core';

export type SetupTarget = 'all' | 'opencode' | 'antigravity' | 'agents';

const START_MARKER = '<!-- schema-memory:start -->';
const END_MARKER = '<!-- schema-memory:end -->';

export function mergeOpenCodeConfig(
  existingRaw: string | null,
  cliDistPath: string
): string {
  let parsed: Record<string, any> = {};
  if (existingRaw && existingRaw.trim()) {
    try {
      parsed = JSON.parse(existingRaw);
    } catch {
      throw new Error(
        'Existing ~/.config/opencode/opencode.json is not valid JSON. Please fix syntax errors or use "sm setup --print" to copy manually.'
      );
    }
  }

  if (!parsed.$schema) {
    parsed.$schema = 'https://opencode.ai/config.json';
  }

  const existingMcp =
    parsed.mcp && typeof parsed.mcp === 'object' ? parsed.mcp : {};

  parsed.mcp = {
    ...existingMcp,
    'schema-memory': {
      type: 'local',
      command: ['node', cliDistPath, 'mcp'],
      enabled: true,
    },
  };

  return JSON.stringify(parsed, null, 2) + '\n';
}

export function mergeGlobalAgentsMd(
  existingRaw: string | null,
  rulesBody: string
): string {
  const managedBlock = `${START_MARKER}\n${rulesBody.trim()}\n${END_MARKER}`;
  if (!existingRaw || !existingRaw.trim()) {
    return `${managedBlock}\n`;
  }

  const startIdx = existingRaw.indexOf(START_MARKER);
  const endIdx = existingRaw.indexOf(END_MARKER);

  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = existingRaw.slice(0, startIdx);
    const after = existingRaw.slice(endIdx + END_MARKER.length);
    return `${before}${managedBlock}${after}`;
  }

  return `${existingRaw.trimEnd()}\n\n${managedBlock}\n`;
}

async function linkCliBinary(cliDistPath: string): Promise<string> {
  await chmod(cliDistPath, 0o755);
  const binDir = resolve(homedir(), '.local', 'bin');
  await ensureDir(binDir);

  for (const name of ['sm', 'schema-memory']) {
    const linkPath = resolve(binDir, name);
    await rm(linkPath, { force: true });
    await symlink(cliDistPath, linkPath);
  }
  return binDir;
}

export async function setupCommand(options: {
  print?: boolean;
  cliOnly?: boolean;
  target?: string;
}): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const cliDistPath = resolve(dirname(currentFile), '..', 'dist', 'index.js');

  if (options.cliOnly) {
    const binDir = await linkCliBinary(cliDistPath);
    console.log(
      `\n✅ Global CLI linked at: ${binDir}/sm and ${binDir}/schema-memory`
    );
    console.log(
      'You can now run "sm", "sm init", "sm ls", "sm rm" from any directory.\n'
    );
    return;
  }

  const target = ((options.target || 'all').toLowerCase() as SetupTarget);
  if (!['all', 'opencode', 'antigravity', 'agents'].includes(target)) {
    throw new Error(
      `Invalid target "${options.target}". Valid targets: all, opencode, antigravity, agents`
    );
  }

  const skillContent = `---
name: schema-memory
description: Workflow rules for inspecting database schemas, debating pending changes, creating ADRs, and maintaining memory in Engram.
---

# schema-memory AI Workflow

Always follow these 8 steps when touching database schemas:

1. **Inspect Existing Context**: Call \`get_decisions\` and \`get_schema\` first.
2. **Detect Pending Changes**: Call \`get_pending_changes\` to see what was edited in the UI.
3. **Engage in Targeted Debate**: Interrogate the user about the "why", trade-offs, and discarded alternatives. Ask one focused question at a time.
4. **Draft the ADR**: Call \`draft_adr\` with structured context, decision, alternatives, and consequences.
5. **Request Explicit Approval**: Present the summary to the user and ask for explicit confirmation.
6. **Confirm the Change**: Call \`confirm_change(userConfirmed=true)\`.
7. **Persist to Engram**: Save the returned \`engramSummary\` into Engram using your Engram tool.
8. **Update Code / Migrations**: ONLY now proceed to update ORM models or database migration files.
`;

  const rulesContent = `# schema-memory Global Rule
Before making or proposing any database schema change:
1. Call \`get_decisions\` to understand the historical context and rejected alternatives.
2. Call \`get_schema\` to inspect current tables, fields, and relationships.
3. Never write schema changes directly to code without recording decisions in schema-memory.
`;

  const pluginManifest = {
    name: 'schema-memory',
    displayName: 'Schema Memory',
    description:
      'Live database schema memory, ADR workflow and AI pair programming companion.',
    suggestedPrompts: [
      'Check current database schema and decisions',
      'Review pending schema changes and draft ADR',
      'Check for database schema drift against codebase',
    ],
  };

  const antigravityMcpConfig = {
    mcpServers: {
      'schema-memory-mcp': {
        command: 'node',
        args: [cliDistPath, 'mcp'],
      },
    },
  };

  if (options.print) {
    console.log('=== 1. OpenCode (~/.config/opencode/opencode.json) ===');
    console.log(mergeOpenCodeConfig(null, cliDistPath).trim());
    console.log('\n=== 2. Standard Agent Skill (~/.agents/skills/schema-memory/SKILL.md) ===');
    console.log(skillContent.trim());
    console.log('\n=== 3. Global Rule (~/.config/opencode/AGENTS.md) ===');
    console.log(mergeGlobalAgentsMd(null, rulesContent).trim());
    console.log('\n=== 4. Antigravity MCP (~/.gemini/config/plugins/schema-memory/mcp_config.json) ===');
    console.log(JSON.stringify(antigravityMcpConfig, null, 2));
    return;
  }

  const home = homedir();
  const installedTargets: string[] = [];

  // 1. Standard Agent Skills (~/.agents/skills/schema-memory/SKILL.md)
  if (target === 'all' || target === 'agents' || target === 'opencode') {
    const stdSkillDir = resolve(home, '.agents', 'skills', 'schema-memory');
    await ensureDir(stdSkillDir);
    await atomicWrite(resolve(stdSkillDir, 'SKILL.md'), skillContent);
    installedTargets.push(`Standard Agent Skill: ${stdSkillDir}/SKILL.md`);
  }

  // 2. OpenCode Global (~/.config/opencode/)
  if (target === 'all' || target === 'opencode') {
    const openCodeDir = resolve(home, '.config', 'opencode');
    const openCodeSkillDir = resolve(openCodeDir, 'skills', 'schema-memory');
    await ensureDir(openCodeDir);
    await ensureDir(openCodeSkillDir);

    const openCodeJsonPath = resolve(openCodeDir, 'opencode.json');
    const existingOpenCodeJson = await readIfExists(openCodeJsonPath);
    const mergedOpenCodeJson = mergeOpenCodeConfig(
      existingOpenCodeJson,
      cliDistPath
    );
    await atomicWrite(openCodeJsonPath, mergedOpenCodeJson);

    const openCodeAgentsPath = resolve(openCodeDir, 'AGENTS.md');
    const existingAgentsMd = await readIfExists(openCodeAgentsPath);
    const mergedAgentsMd = mergeGlobalAgentsMd(existingAgentsMd, rulesContent);
    await atomicWrite(openCodeAgentsPath, mergedAgentsMd);

    await atomicWrite(resolve(openCodeSkillDir, 'SKILL.md'), skillContent);
    installedTargets.push(`OpenCode Global Config: ${openCodeDir} (opencode.json, AGENTS.md, skills/)`);
  }

  // 3. Antigravity Plugin (~/.gemini/config/plugins/schema-memory/)
  if (target === 'all' || target === 'antigravity') {
    const agyDir = resolve(home, '.gemini', 'config', 'plugins', 'schema-memory');
    await ensureDir(agyDir);
    await ensureDir(resolve(agyDir, 'skills', 'schema-memory'));
    await ensureDir(resolve(agyDir, 'rules'));

    await atomicWrite(
      resolve(agyDir, 'plugin.json'),
      JSON.stringify(pluginManifest, null, 2) + '\n'
    );
    await atomicWrite(
      resolve(agyDir, 'mcp_config.json'),
      JSON.stringify(antigravityMcpConfig, null, 2) + '\n'
    );
    await atomicWrite(
      resolve(agyDir, 'skills', 'schema-memory', 'SKILL.md'),
      skillContent
    );
    await atomicWrite(resolve(agyDir, 'rules', 'AGENTS.md'), rulesContent);
    installedTargets.push(`Antigravity Plugin: ${agyDir}`);
  }

  // 4. Global CLI binary
  const binDir = await linkCliBinary(cliDistPath);
  installedTargets.push(`Global CLI Binary: ${binDir}/sm`);

  console.log('\n✅ Global setup complete:');
  for (const item of installedTargets) {
    console.log(`   • ${item}`);
  }
  console.log();
}
