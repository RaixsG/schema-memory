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
import { writeSetupState } from '../setup-state.js';
import {
  SETUP_TARGETS,
  SETUP_TARGET_LABELS,
  SCHEMA_MEMORY_RULES_CONTENT,
  SCHEMA_MEMORY_SKILL_CONTENT,
  buildAntigravityPluginManifest,
  detectSetupTargets,
  hasComponent,
  parseSetupTargets,
  parseTargetSelection,
  resolveSetupProfile,
  type SetupProfile,
  type SetupTarget,
} from './setup-config.js';

export type { SetupProfile, SetupTarget } from './setup-config.js';

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
  profile?: string;
  installGlobal?: boolean;
  yes?: boolean;
  refreshProjects?: boolean;
  homeDir?: string;
  interactive?: boolean;
  cliDistPath?: string;
  skipCliInstall?: boolean;
}

export async function setupCommand(options: SetupCommandOptions): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const cliDistPath =
    options.cliDistPath ||
    resolve(dirname(currentFile), '..', 'dist', 'index.js');

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

  const home = options.homeDir || homedir();
  const { targets, profile } = await resolveSetupSelection(options, home);

  if (options.print) {
    printSetupConfigs(targets, profile, cliDistPath);
    return;
  }

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

  console.log(
    `\n🧭 Configuring: ${targets.map((target) => SETUP_TARGET_LABELS[target]).join(', ')}`
  );
  console.log(`   Profile: ${profile}`);

  for (const target of targets) {
    if (target === 'agents') {
      installedTargets.push(...(await installAgentSkills(home)));
      continue;
    }

    if (target === 'opencode') {
      installedTargets.push(...(await installOpenCode(home, cliDistPath, profile)));
      continue;
    }

    if (target === 'antigravity') {
      const result = await installAntigravityApp(home, cliDistPath, profile, warnings);
      installedTargets.push(...result);
      continue;
    }

    if (target === 'antigravity-cli') {
      const result = await installAntigravityCli(
        home,
        cliDistPath,
        profile,
        options,
        warnings
      );
      installedTargets.push(...result);
    }
  }

  if (!options.skipCliInstall) {
    // 4. Global CLI binary
    const binDir = getBinDir();
    const smOnPath =
      findCommandOnPath('sm') ?? findCommandOnPath('schema-memory');
    const isExternalGlobal = smOnPath && !isWithinDir(smOnPath, binDir);

    if (isExternalGlobal) {
      installedTargets.push(
        `Global CLI: already available on PATH (${smOnPath})`
      );
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
          const rl = createInterface({
            input: process.stdin,
            output: process.stdout,
          });
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
          shouldRun =
            normalized === '' || normalized === 'y' || normalized === 'yes';
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
        console.log(
          `\n⚙️  Running: ${installCmd.command} ${installCmd.args.join(' ')}...`
        );
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
  }

  if (options.refreshProjects) {
    const refreshedCount = await refreshRegisteredProjects();
    if (refreshedCount > 0) {
      installedTargets.push(
        `Refreshed AGENTS.md guardrails in ${refreshedCount} registered project(s)`
      );
    }
  }

  await writeSetupState({
    completedAt: new Date().toISOString(),
    interrupted: false,
    targets,
    profile,
  });

  console.log(
    `\n✅ Setup complete for: ${targets
      .map((target) => SETUP_TARGET_LABELS[target])
      .join(', ')}`
  );
  console.log(`   Profile: ${profile}`);
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

async function resolveSetupSelection(
  options: SetupCommandOptions,
  home: string
): Promise<{ targets: SetupTarget[]; profile: SetupProfile }> {
  const hasExplicitTarget =
    typeof options.target === 'string' && options.target.trim() !== '';
  const targets = hasExplicitTarget
    ? parseSetupTargets(options.target)
    : [...SETUP_TARGETS];
  const profile = resolveSetupProfile(options.profile);

  const canPrompt =
    options.interactive !== false &&
    !hasExplicitTarget &&
    !options.print &&
    !options.cliOnly &&
    !options.yes &&
    process.stdin.isTTY &&
    process.stdout.isTTY;

  if (!canPrompt) {
    return { targets, profile };
  }

  return promptSetupSelection(home);
}

async function promptSetupSelection(
  home: string
): Promise<{ targets: SetupTarget[]; profile: SetupProfile }> {
  const detected = detectSetupTargets(home);

  console.log('\n🧭 schema-memory setup');
  console.log('   Choose only the agents you use; unselected agents are left untouched.\n');
  detected.forEach((item, index) => {
    const marker = item.detected ? 'x' : ' ';
    const suffix = item.detected ? ' (detected)' : '';
    console.log(`   ${index + 1}. [${marker}] ${item.label}${suffix}`);
  });

  const targetAnswer = await askQuestion(
    '   Select targets (comma-separated numbers/names, "all", or Enter for detected): '
  );
  const targets = parseTargetSelection(targetAnswer, detected);
  if (targets.length === 0) {
    throw new Error('Select at least one setup target.');
  }

  console.log('\n   Profiles:');
  console.log('     1. minimal     - MCP only');
  console.log('     2. recommended - MCP + workflow skill (default)');
  console.log('     3. strict      - MCP + skill + guardrail rules');
  const profileAnswer = await askQuestion('   Choose profile [1-3] (2): ');

  return {
    targets,
    profile: resolveProfileAnswer(profileAnswer),
  };
}

function resolveProfileAnswer(answer: string): SetupProfile {
  const normalized = answer.trim().toLowerCase();
  if (normalized === '1') return 'minimal';
  if (normalized === '2' || normalized === '') return 'recommended';
  if (normalized === '3') return 'strict';
  return resolveSetupProfile(normalized);
}

async function askQuestion(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<string>((resolveAnswer) => {
    rl.question(question, (value) => {
      rl.close();
      resolveAnswer(value);
    });
  });
}

async function confirmQuestion(question: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }
  const answer = await askQuestion(question);
  const normalized = answer.trim().toLowerCase();
  return normalized === '' || normalized === 'y' || normalized === 'yes';
}

async function installAgentSkills(home: string): Promise<string[]> {
  const skillDir = resolve(home, '.agents', 'skills', 'schema-memory');
  await ensureDir(skillDir);
  await atomicWrite(
    resolve(skillDir, 'SKILL.md'),
    SCHEMA_MEMORY_SKILL_CONTENT
  );
  return [`Standard Agent Skill: ${skillDir}/SKILL.md`];
}

async function installOpenCode(
  home: string,
  cliDistPath: string,
  profile: SetupProfile
): Promise<string[]> {
  const openCodeDir = resolve(home, '.config', 'opencode');
  await ensureDir(openCodeDir);

  const openCodeJsonPath = resolve(openCodeDir, 'opencode.json');
  const existingOpenCodeJson = await readIfExists(openCodeJsonPath);
  await atomicWrite(
    openCodeJsonPath,
    mergeOpenCodeConfig(existingOpenCodeJson, cliDistPath)
  );

  const installed = [`OpenCode MCP: ${openCodeJsonPath}`];

  if (hasComponent('opencode', profile, 'skill')) {
    const skillDir = resolve(openCodeDir, 'skills', 'schema-memory');
    await ensureDir(skillDir);
    await atomicWrite(
      resolve(skillDir, 'SKILL.md'),
      SCHEMA_MEMORY_SKILL_CONTENT
    );
    installed.push(`OpenCode Skill: ${skillDir}/SKILL.md`);
  }

  if (hasComponent('opencode', profile, 'rules')) {
    const agentsPath = resolve(openCodeDir, 'AGENTS.md');
    const existingAgentsMd = await readIfExists(agentsPath);
    await atomicWrite(
      agentsPath,
      mergeGlobalAgentsMd(existingAgentsMd, SCHEMA_MEMORY_RULES_CONTENT)
    );
    installed.push(`OpenCode Rules: ${agentsPath}`);
  }

  return installed;
}

async function writeAntigravityPluginBundle(
  pluginDir: string,
  cliDistPath: string,
  profile: SetupProfile
): Promise<void> {
  await ensureDir(pluginDir);

  await atomicWrite(
    resolve(pluginDir, 'plugin.json'),
    JSON.stringify(buildAntigravityPluginManifest(), null, 2) + '\n'
  );
  await atomicWrite(
    resolve(pluginDir, 'mcp_config.json'),
    mergeAntigravityMcpConfig(null, cliDistPath)
  );

  if (profile !== 'minimal') {
    const skillDir = resolve(pluginDir, 'skills', 'schema-memory');
    await ensureDir(skillDir);
    await atomicWrite(
      resolve(skillDir, 'SKILL.md'),
      SCHEMA_MEMORY_SKILL_CONTENT
    );
  }

  if (profile === 'strict') {
    const rulesDir = resolve(pluginDir, 'rules');
    await ensureDir(rulesDir);
    await atomicWrite(
      resolve(rulesDir, 'AGENTS.md'),
      SCHEMA_MEMORY_RULES_CONTENT
    );
  }
}

async function installAntigravityApp(
  home: string,
  cliDistPath: string,
  profile: SetupProfile,
  warnings: string[]
): Promise<string[]> {
  const geminiConfigDir = resolve(home, '.gemini', 'config');
  await ensureDir(geminiConfigDir);

  if (profile === 'minimal') {
    const mcpPath = resolve(geminiConfigDir, 'mcp_config.json');
    const existing = await readIfExists(mcpPath);
    await atomicWrite(
      mcpPath,
      mergeAntigravityMcpConfig(existing, cliDistPath)
    );
    return [`Antigravity MCP: ${mcpPath}`];
  }

  const pluginDir = resolve(geminiConfigDir, 'plugins', 'schema-memory');
  await writeAntigravityPluginBundle(pluginDir, cliDistPath, profile);

  const legacyMcpPath = resolve(geminiConfigDir, 'mcp_config.json');
  if (existsSync(legacyMcpPath)) {
    warnings.push(
      `Existing Antigravity global MCP config was left untouched: ${legacyMcpPath}. ` +
        'The plugin bundle already includes its own MCP server; remove the duplicate entry if your client lists the tools twice.'
    );
  }

  return [`Antigravity Plugin Bundle: ${pluginDir}`];
}

async function installAntigravityCli(
  home: string,
  cliDistPath: string,
  profile: SetupProfile,
  options: SetupCommandOptions,
  warnings: string[]
): Promise<string[]> {
  const geminiConfigDir = resolve(home, '.gemini', 'config');

  if (profile === 'minimal') {
    await ensureDir(geminiConfigDir);
    const mcpPath = resolve(geminiConfigDir, 'mcp_config.json');
    const existing = await readIfExists(mcpPath);
    await atomicWrite(
      mcpPath,
      mergeAntigravityMcpConfig(existing, cliDistPath)
    );
    return [`Antigravity CLI MCP: ${mcpPath}`];
  }

  const pluginDir = resolve(
    home,
    '.schema-memory',
    'plugins',
    'antigravity',
    'schema-memory'
  );
  await writeAntigravityPluginBundle(pluginDir, cliDistPath, profile);

  const installed = [`Antigravity CLI Plugin Staging: ${pluginDir}`];
  const agy = findCommandOnPath('agy');
  if (!agy) {
    warnings.push(
      `Antigravity CLI was not found. Import the plugin manually with: agy plugin install "${pluginDir}"`
    );
    return installed;
  }

  const shouldImport =
    options.yes === true ||
    (await confirmQuestion(
      '   Import the plugin into Antigravity CLI now? (Y/n) '
    ));

  if (!shouldImport) {
    warnings.push(
      `Plugin not imported. Run: agy plugin install "${pluginDir}"`
    );
    return installed;
  }

  const result = spawnSync('agy', ['plugin', 'install', pluginDir], {
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) {
    warnings.push(
      `agy plugin install failed${result.error ? `: ${result.error.message}` : ''}. ` +
        `Run manually: agy plugin install "${pluginDir}"`
    );
    return installed;
  }

  installed.push('Antigravity CLI Plugin: imported with agy plugin install');
  return installed;
}

async function refreshRegisteredProjects(): Promise<number> {
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
  return refreshedCount;
}

function printSetupConfigs(
  targets: SetupTarget[],
  profile: SetupProfile,
  cliDistPath: string
): void {
  for (const target of targets) {
    if (target === 'opencode') {
      console.log('\n=== OpenCode: ~/.config/opencode/opencode.json ===');
      console.log(mergeOpenCodeConfig(null, cliDistPath).trim());
      if (hasComponent('opencode', profile, 'skill')) {
        console.log('\n=== OpenCode: ~/.config/opencode/skills/schema-memory/SKILL.md ===');
        console.log(SCHEMA_MEMORY_SKILL_CONTENT.trim());
      }
      if (hasComponent('opencode', profile, 'rules')) {
        console.log('\n=== OpenCode: ~/.config/opencode/AGENTS.md ===');
        console.log(
          mergeGlobalAgentsMd(null, SCHEMA_MEMORY_RULES_CONTENT).trim()
        );
      }
      continue;
    }

    if (target === 'agents') {
      console.log('\n=== Standard Agent Skill: ~/.agents/skills/schema-memory/SKILL.md ===');
      console.log(SCHEMA_MEMORY_SKILL_CONTENT.trim());
      continue;
    }

    const label =
      target === 'antigravity' ? 'Antigravity App/IDE' : 'Antigravity CLI';
    console.log(`\n=== ${label} ===`);

    if (profile === 'minimal') {
      console.log('~/.gemini/config/mcp_config.json');
      console.log(mergeAntigravityMcpConfig(null, cliDistPath).trim());
      if (target === 'antigravity-cli') {
        console.log(
          '\nNo plugin import is needed for the minimal profile; the CLI reads the global MCP config.'
        );
      }
      continue;
    }

    const pluginPath =
      target === 'antigravity'
        ? '~/.gemini/config/plugins/schema-memory/'
        : '~/.schema-memory/plugins/antigravity/schema-memory/';
    console.log(`Plugin bundle: ${pluginPath}`);
    console.log('plugin.json');
    console.log(JSON.stringify(buildAntigravityPluginManifest(), null, 2));
    console.log('mcp_config.json');
    console.log(mergeAntigravityMcpConfig(null, cliDistPath).trim());
    console.log('skills/schema-memory/SKILL.md');
    console.log(SCHEMA_MEMORY_SKILL_CONTENT.trim());
    if (profile === 'strict') {
      console.log('rules/AGENTS.md');
      console.log(SCHEMA_MEMORY_RULES_CONTENT.trim());
    }
    if (target === 'antigravity-cli') {
      console.log('\nImport command:');
      console.log(`agy plugin install "${pluginPath}"`);
    }
  }
}

