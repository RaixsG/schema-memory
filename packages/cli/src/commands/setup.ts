import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { chmod, rm, symlink } from 'node:fs/promises';
import {
  atomicWrite,
  ensureDir,
  readIfExists,
  listProjects,
  updateAgentsMdContent,
} from '@schema-memory/core';

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

export function mergeAntigravityMcpConfig(
  existingRaw: string | null,
  cliDistPath: string
): string {
  let parsed: Record<string, any> = {};
  if (existingRaw && existingRaw.trim()) {
    try {
      parsed = JSON.parse(existingRaw);
    } catch {
      throw new Error(
        'Existing ~/.gemini/config/mcp_config.json is not valid JSON. Please fix syntax errors or use "sm setup --print" to copy manually.'
      );
    }
  }

  const existingServers =
    parsed.mcpServers && typeof parsed.mcpServers === 'object'
      ? parsed.mcpServers
      : {};

  parsed.mcpServers = {
    ...existingServers,
    'schema-memory-mcp': {
      command: 'node',
      args: [cliDistPath, 'mcp'],
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

  if (!options.print && !existsSync(cliDistPath)) {
    throw new Error(
      `Compiled CLI entrypoint not found at "${cliDistPath}". Please run "pnpm build" inside schema-memory first.`
    );
  }

  if (options.cliOnly) {
    const binDir = await linkCliBinary(cliDistPath);
    console.log(
      `\n✅ Global CLI linked at: ${binDir}/sm and ${binDir}/schema-memory`
    );
    console.log(
      'You can now run "sm", "sm init", "sm ls", "sm rm", "sm doctor" from any directory.\n'
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

Always follow these 8 steps when touching database schemas in any registered client project:

1. **Inspect Existing Context**: Call \`get_decisions\` and \`get_schema\` first (always pass the \`project\` ID or path).
2. **Detect Pending Changes**: Call \`get_pending_changes\` to see what was edited in the UI.
3. **Engage in Targeted Debate**: Interrogate the user about the "why", trade-offs, and discarded alternatives. Ask one focused question at a time.
4. **Draft the ADR**: Call \`draft_adr\` with structured context, decision, alternatives, and consequences.
5. **Request Explicit Approval**: Present the summary to the user and ask for explicit confirmation.
6. **Confirm the Change**: Call \`confirm_change(userConfirmed=true)\`.
7. **Persist to Engram**: Save the returned \`engramSummary\` into Engram using your Engram tool.
8. **Update Code / Migrations**: ONLY now proceed to update ORM models or database migration files.

## Strict Isolation Guardrails
- **Use ONLY MCP tools**: Interact with \`schema-memory\` exclusively through its MCP tools (\`schema-memory\` / \`schema-memory-mcp\`).
- **NEVER inspect the schema-memory repository**: When working on a client project, NEVER search for, read, or analyze the \`schema-memory\` tool's own source code repository. Inspect only the client project's files.
- **Fail-fast if MCP is missing**: If the MCP tools (\`get_schema\`, \`import_schema\`, \`get_pending_changes\`, etc.) are not available in your active session, STOP immediately without searching the filesystem and ask the user to run \`sm setup\` (or \`pnpm sm setup\`) and reload the agent session.
`;

  const rulesContent = `# schema-memory Global Rule
When working on a repository that contains \`.schema-memory/\` or references \`schema-memory\` in \`AGENTS.md\`:
1. Call \`get_decisions\` and \`get_schema\` (passing \`project\`) before making or proposing any database schema change.
2. Never write schema changes directly to code without recording decisions via \`confirm_change(userConfirmed=true)\`.
3. **Strict Isolation**: Interact with \`schema-memory\` ONLY via its MCP tools (\`schema-memory\` / \`schema-memory-mcp\`). NEVER search for or read the \`schema-memory\` source code repository. If the MCP tools are not loaded in your current session, stop immediately and ask the user to run \`sm setup\` (or \`pnpm sm setup\`) and reload the agent.
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

  if (options.print) {
    console.log('=== 1. OpenCode (~/.config/opencode/opencode.json) ===');
    console.log(mergeOpenCodeConfig(null, cliDistPath).trim());
    console.log('\n=== 2. Antigravity Global MCP (~/.gemini/config/mcp_config.json) ===');
    console.log(mergeAntigravityMcpConfig(null, cliDistPath).trim());
    console.log('\n=== 3. Standard Agent Skill (~/.agents/skills/schema-memory/SKILL.md) ===');
    console.log(skillContent.trim());
    console.log('\n=== 4. Global Rule (~/.config/opencode/AGENTS.md & ~/.gemini/config/GEMINI.md) ===');
    console.log(mergeGlobalAgentsMd(null, rulesContent).trim());
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
    installedTargets.push(
      `OpenCode Global Config: ${openCodeDir} (opencode.json, AGENTS.md, skills/)`
    );
  }

  // 3. Antigravity Direct Global MCP + Plugin (~/.gemini/config/)
  if (target === 'all' || target === 'antigravity') {
    const geminiConfigDir = resolve(home, '.gemini', 'config');
    await ensureDir(geminiConfigDir);

    // 3a. Direct Global MCP in ~/.gemini/config/mcp_config.json (active immediately without plugin enablement)
    const agyDirectMcpPath = resolve(geminiConfigDir, 'mcp_config.json');
    const existingAgyMcp = await readIfExists(agyDirectMcpPath);
    const mergedAgyMcp = mergeAntigravityMcpConfig(existingAgyMcp, cliDistPath);
    await atomicWrite(agyDirectMcpPath, mergedAgyMcp);

    // 3b. Direct Global Rule in ~/.gemini/config/GEMINI.md
    const geminiMdPath = resolve(geminiConfigDir, 'GEMINI.md');
    const existingGeminiMd = await readIfExists(geminiMdPath);
    const mergedGeminiMd = mergeGlobalAgentsMd(existingGeminiMd, rulesContent);
    await atomicWrite(geminiMdPath, mergedGeminiMd);

    // 3c. Antigravity Plugin bundle in ~/.gemini/config/plugins/schema-memory/
    const agyPluginDir = resolve(geminiConfigDir, 'plugins', 'schema-memory');
    await ensureDir(agyPluginDir);
    await ensureDir(resolve(agyPluginDir, 'skills', 'schema-memory'));
    await ensureDir(resolve(agyPluginDir, 'rules'));

    await atomicWrite(
      resolve(agyPluginDir, 'plugin.json'),
      JSON.stringify(pluginManifest, null, 2) + '\n'
    );
    await atomicWrite(
      resolve(agyPluginDir, 'mcp_config.json'),
      mergeAntigravityMcpConfig(null, cliDistPath)
    );
    await atomicWrite(
      resolve(agyPluginDir, 'skills', 'schema-memory', 'SKILL.md'),
      skillContent
    );
    await atomicWrite(resolve(agyPluginDir, 'rules', 'AGENTS.md'), rulesContent);
    installedTargets.push(
      `Antigravity Direct MCP & Rules: ${agyDirectMcpPath} + ${geminiMdPath}`
    );
    installedTargets.push(`Antigravity Plugin Bundle: ${agyPluginDir}`);
  }

  // 4. Global CLI binary
  const binDir = await linkCliBinary(cliDistPath);
  installedTargets.push(`Global CLI Binary: ${binDir}/sm`);

  // 5. Refresh AGENTS.md managed block in already-registered client projects
  const projects = await listProjects();
  let refreshedCount = 0;
  for (const proj of projects) {
    if (existsSync(proj.path)) {
      const agentsPath = resolve(proj.path, 'AGENTS.md');
      const existing = await readIfExists(agentsPath);
      const { content } = updateAgentsMdContent(existing, proj.id);
      await atomicWrite(agentsPath, content);
      refreshedCount++;
    }
  }
  if (refreshedCount > 0) {
    installedTargets.push(
      `Refreshed AGENTS.md guardrails in ${refreshedCount} registered project(s)`
    );
  }

  console.log('\n✅ Global setup complete:');
  for (const item of installedTargets) {
    console.log(`   • ${item}`);
  }
  console.log(
    '\n💡 Tip: Run "sm doctor" (or "pnpm sm doctor") anytime to verify your installation.\n'
  );
}
