import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { chmod, rm, symlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createWindowsShim } from '../windows-shim.js';
import {
  atomicWrite,
  ensureDir,
  readIfExists,
  listProjects,
  updateAgentsMdContent,
} from '@schema-memory/core';
import {
  isWindows,
  findCommandOnPath,
  getBinDir,
  isDirOnPath,
  detectEphemeralRunner,
  isWithinDir,
  type EphemeralRunner,
  getPlatform,
} from '../platform/index.js';
import {
  readSetupState,
  writeSetupState,
} from '../setup-state.js';

export type SetupTarget = 'all' | 'opencode' | 'antigravity' | 'agents';

export function resolveGlobalInstallCommand(
  runner: EphemeralRunner | null
): { command: string; args: string[] } {
  if (runner === 'bunx') {
    return { command: 'bun', args: ['add', '-g', 'schema-memory'] };
  }
  if (runner === 'pnpm-dlx') {
    return { command: 'pnpm', args: ['add', '-g', 'schema-memory'] };
  }
  return { command: 'npm', args: ['i', '-g', 'schema-memory'] };
}

export function runGlobalInstall(
  command: string,
  args: string[],
  spawnFn: typeof spawnSync = spawnSync
): { success: boolean; detail?: string } {
  try {
    const res = spawnFn(command, args, {
      stdio: 'inherit',
      shell: isWindows,
    });
    if (res.error) {
      return { success: false, detail: res.error.message };
    }
    const success = res.status === 0;
    return {
      success,
      detail: success ? undefined : `Exited with code ${res.status}`,
    };
  } catch (err: any) {
    return { success: false, detail: err.message };
  }
}

const START_MARKER = '<!-- schema-memory:start -->';
const END_MARKER = '<!-- schema-memory:end -->';

/**
 * Resolves the MCP stdio invocation:
 * - When executed via an ephemeral runner (npx, bunx, pnpm dlx), registers the
 *   runner itself (`npx -y schema-memory mcp`, `bunx schema-memory mcp`, etc.)
 *   so the agent config never points to a temporary cache folder.
 * - When executed from a global install (`npm i -g` / `bun add -g`) or local
 *   repo build, uses the direct `node <cliDistPath> mcp` entrypoint.
 */
export function buildMcpCommand(cliDistPath: string): {
  command: string;
  args: string[];
} {
  const runner = detectEphemeralRunner(cliDistPath);
  if (runner === 'bunx') {
    return { command: 'bunx', args: ['schema-memory', 'mcp'] };
  }
  if (runner === 'pnpm-dlx') {
    return { command: 'pnpm', args: ['dlx', 'schema-memory', 'mcp'] };
  }
  if (runner === 'npx') {
    return { command: 'npx', args: ['-y', 'schema-memory', 'mcp'] };
  }
  return { command: 'node', args: [cliDistPath, 'mcp'] };
}

/**
 * Merges the schema-memory MCP server into an OpenCode configuration file
 * using the native V2 shape (`mcp.servers.<name>`). Legacy flat entries
 * (`mcp.<name>`, V1) are preserved for other servers; a legacy entry for
 * schema-memory itself is migrated to the V2 shape.
 */
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
    parsed.mcp && typeof parsed.mcp === 'object' ? { ...parsed.mcp } : {};

  const existingServers =
    existingMcp.servers && typeof existingMcp.servers === 'object'
      ? { ...existingMcp.servers }
      : {};

  // Migrate our own legacy V1 flat entry (if any) to the native V2 shape.
  delete existingMcp['schema-memory'];

  const mcpCmd = buildMcpCommand(cliDistPath);
  existingServers['schema-memory'] = {
    type: 'local',
    command: [mcpCmd.command, ...mcpCmd.args],
  };

  existingMcp.servers = existingServers;
  parsed.mcp = existingMcp;

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

  const mcpCmd = buildMcpCommand(cliDistPath);
  parsed.mcpServers = {
    ...existingServers,
    'schema-memory-mcp': {
      command: mcpCmd.command,
      args: mcpCmd.args,
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

export interface LinkCliResult {
  binDir: string;
  linked: boolean;
  detail: string;
}

/**
 * Makes `sm` / `schema-memory` globally available:
 * - Skips linking when the command already resolves on PATH outside our
 *   managed bin dir (e.g. an npm/pnpm global install, which is the
 *   recommended, cross-platform way).
 * - Windows: generates .cmd / .ps1 / sh shims with createWindowsShim (cross-drive aware),
 *   since symlinks without extensions are not executable there.
 * - Unix: keeps the chmod + symlink approach.
 */
export async function linkCliBinary(cliDistPath: string): Promise<LinkCliResult> {
  const platform = getPlatform();
  const binDir = platform.getBinDir();
  return platform.linkCli(cliDistPath, binDir);
}

function printPathHint(binDir: string): void {
  const platform = getPlatform();
  console.log(
    `\nℹ️  "${binDir}" is not on your PATH, so the "sm" command will not resolve in new terminals.`
  );
  console.log(
    '   Option A (recommended): run via "npx schema-memory" / "bunx schema-memory", or install globally with "npm i -g schema-memory" / "bun add -g schema-memory".'
  );
  console.log(`   Option B: ${platform.getPathHint(binDir)}.`);
}

export interface SetupCommandOptions {
  print?: boolean;
  cliOnly?: boolean;
  target?: string;
  installGlobal?: boolean;
}

export async function setupCommand(options: SetupCommandOptions): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const cliDistPath = resolve(dirname(currentFile), '..', 'dist', 'index.js');

  if (!options.print && !existsSync(cliDistPath)) {
    throw new Error(
      `Compiled CLI entrypoint not found at "${cliDistPath}". Please run "pnpm build" inside schema-memory first.`
    );
  }

  if (options.cliOnly) {
    try {
      const link = await linkCliBinary(cliDistPath);
      console.log(
        link.linked
          ? `\n✅ Global CLI linked at: ${link.binDir} (sm, schema-memory)`
          : `\n✅ Global CLI already available: ${link.detail}`
      );
      if (link.linked && !isDirOnPath(link.binDir)) {
        printPathHint(link.binDir);
      }
      console.log(
        'You can now run "sm", "sm init", "sm ls", "sm rm", "sm doctor" from any directory.\n'
      );
    } catch (error: any) {
      throw new Error(
        `Could not link the global CLI: ${error.message}. ` +
          'A cross-platform alternative is "npm i -g schema-memory" or "bun add -g schema-memory", which installs the "sm" and "schema-memory" commands everywhere.'
      );
    }
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
- **Fail-fast if MCP is missing**: If the MCP tools (\`get_schema\`, \`import_schema\`, \`get_pending_changes\`, etc.) are not available in your active session, STOP immediately without searching the filesystem and ask the user to run \`sm setup\` (or \`npx schema-memory setup\` / \`bunx schema-memory setup\`) and reload the agent session.
`;

  const rulesContent = `# schema-memory Global Rule
When working on a repository that contains \`.schema-memory/\` or references \`schema-memory\` in \`AGENTS.md\`:
1. Call \`get_decisions\` and \`get_schema\` (passing \`project\`) before making or proposing any database schema change.
2. Never write schema changes directly to code without recording decisions via \`confirm_change(userConfirmed=true)\`.
3. **Strict Isolation**: Interact with \`schema-memory\` ONLY via its MCP tools (\`schema-memory\` / \`schema-memory-mcp\`). NEVER search for or read the \`schema-memory\` source code repository. If the MCP tools are not loaded in your current session, stop immediately and ask the user to run \`sm setup\` (or \`npx schema-memory setup\` / \`bunx schema-memory setup\`) and reload the agent.
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
    console.log('=== 1. OpenCode Global Config (~/.config/opencode/opencode.json) ===');
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
  const warnings: string[] = [];
  const ephemeralRunner = detectEphemeralRunner(cliDistPath);

  if (ephemeralRunner) {
    const mcpCmd = buildMcpCommand(cliDistPath);
    console.log(
      `\nℹ️  Detected ephemeral runner (${ephemeralRunner}). ` +
        `Registering MCP via "${mcpCmd.command} ${mcpCmd.args.join(' ')}" so it stays valid across cache cleanups.`
    );
  }

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
  const binDir = getBinDir();
  const smOnPath = findCommandOnPath('sm') ?? findCommandOnPath('schema-memory');
  const isExternalGlobal = smOnPath && !isWithinDir(smOnPath, binDir);

  if (isExternalGlobal) {
    installedTargets.push(`Global CLI: already available on PATH (${smOnPath})`);
  } else if (smOnPath && isWithinDir(smOnPath, binDir)) {
    try {
      const link = await linkCliBinary(cliDistPath);
      installedTargets.push(`Global CLI: refreshed in ${link.binDir}`);
    } catch (error: any) {
      warnings.push(`Could not refresh global CLI shims: ${error.message}`);
    }
  } else if (options.installGlobal === false) {
    if (!ephemeralRunner) {
      try {
        const link = await linkCliBinary(cliDistPath);
        installedTargets.push(`Global CLI: ${link.detail}`);
        if (link.linked && !isDirOnPath(link.binDir)) {
          warnings.push(
            `Add "${link.binDir}" to PATH (or run "npm i -g schema-memory" / "bun add -g schema-memory").`
          );
        }
      } catch (error: any) {
        warnings.push(`Could not link CLI (${error.message}).`);
      }
    } else {
      warnings.push(
        `Global CLI install skipped. Run via "${ephemeralRunner} schema-memory" or install manually.`
      );
    }
  } else {
    const installCmd = resolveGlobalInstallCommand(ephemeralRunner);
    let shouldRun = options.installGlobal === true;

    if (options.installGlobal === undefined) {
      if (process.stdin.isTTY && process.stdout.isTTY) {
        console.log(
          `\n📦 The "sm" command is not yet available globally on your PATH.`
        );
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>((resolveAnswer) => {
          rl.question(
            `   Install "sm" globally via "${installCmd.command} ${installCmd.args.join(' ')}"? (Y/n) `,
            (val) => {
              rl.close();
              resolveAnswer(val);
            }
          );
        });
        const normalized = answer.trim().toLowerCase();
        shouldRun = normalized === '' || normalized === 'y' || normalized === 'yes';
        if (!shouldRun) {
          await writeSetupState({
            globalInstallDeclined: true,
            lastOfferedAt: new Date().toISOString(),
          });
        }
      } else {
        warnings.push(
          `"sm" is not on PATH. Run "${installCmd.command} ${installCmd.args.join(' ')}" to install it globally.`
        );
      }
    }

    if (shouldRun) {
      console.log(`\n⚙️  Running: ${installCmd.command} ${installCmd.args.join(' ')}...`);
      const res = runGlobalInstall(installCmd.command, installCmd.args);
      if (res.success) {
        installedTargets.push(
          `Global CLI: installed via "${installCmd.command} ${installCmd.args.join(' ')}"`
        );
        await writeSetupState({
          lastInstalledMethod: `${installCmd.command} ${installCmd.args.join(' ')}`,
        });
      } else {
        warnings.push(
          `Global install via ${installCmd.command} failed (${res.detail || 'unknown error'}). Falling back to local bin link.`
        );
        try {
          const link = await linkCliBinary(cliDistPath);
          installedTargets.push(`Global CLI: ${link.detail}`);
          if (link.linked && !isDirOnPath(link.binDir)) {
            printPathHint(link.binDir);
          }
        } catch (linkError: any) {
          warnings.push(`Could not link CLI binary: ${linkError.message}`);
        }
      }
    } else if (!ephemeralRunner) {
      try {
        const link = await linkCliBinary(cliDistPath);
        installedTargets.push(`Global CLI: ${link.detail}`);
        if (link.linked && !isDirOnPath(link.binDir)) {
          warnings.push(
            `Add "${link.binDir}" to PATH (or run "npm i -g schema-memory").`
          );
        }
      } catch (linkErr: any) {
        warnings.push(`Could not link CLI binary: ${linkErr.message}`);
      }
    }
  }

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

  await writeSetupState({
    completedAt: new Date().toISOString(),
    interrupted: false,
  });

  console.log('\n✅ Global setup complete:');
  for (const item of installedTargets) {
    console.log(`   • ${item}`);
  }
  for (const warning of warnings) {
    console.log(`   ⚠️  ${warning}`);
  }
  if (warnings.length > 0 && isWindows) {
    console.log(
      '\nℹ️  Tip: the simplest cross-platform options are "npx schema-memory", "bunx schema-memory", "npm i -g schema-memory", or "bun add -g schema-memory".'
    );
  }
  console.log(
    '\n💡 Tip: Run "sm doctor" (or "npx schema-memory doctor" / "bunx schema-memory doctor") anytime to verify your installation.\n'
  );
}

