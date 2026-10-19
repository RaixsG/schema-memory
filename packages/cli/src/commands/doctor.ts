import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  readIfExists,
  listProjects,
  readConfig,
  normalizePathKey,
  getRegistryDir,
} from '@schema-memory/core';
import { getPlatform, type PlatformAdapter } from '../platform/index.js';
import { readSetupState } from '../setup-state.js';
import type { SetupTarget } from './setup-config.js';

export interface DoctorCheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export async function runDoctorChecks(options?: {
  homeDir?: string;
  cwd?: string;
  cliDistPath?: string;
  platform?: PlatformAdapter;
}): Promise<DoctorCheckResult[]> {
  const home = options?.homeDir || homedir();
  const cwd = options?.cwd || process.cwd();
  const currentFile = fileURLToPath(import.meta.url);
  const cliDistPath =
    options?.cliDistPath || resolve(dirname(currentFile), '..', 'dist', 'index.js');
  const platform = options?.platform || getPlatform();

  const results: DoctorCheckResult[] = [];

  // 1. CLI build artifact
  const distExists = existsSync(cliDistPath);
  results.push({
    name: 'CLI Build (dist/index.js)',
    ok: distExists,
    detail: distExists
      ? cliDistPath
      : `Missing "${cliDistPath}" — run "pnpm build"`,
  });

  // 2. Global CLI command (npm/pnpm/bun shims on PATH or fallback ~/.local/bin shims)
  const smOnPath = platform.findCommandOnPath('sm') ?? platform.findCommandOnPath('schema-memory');
  const localBinDir = resolve(home, '.local', 'bin');
  const cliHealth = await platform.checkCliHealth(localBinDir, smOnPath);

  results.push({
    name: 'Global CLI (sm)',
    ok: cliHealth.ok,
    detail: cliHealth.detail,
  });

  // 3. Setup completion status
  const setupState = await readSetupState(resolve(home, '.schema-memory'));
  if (setupState.interrupted) {
    results.push({
      name: 'Setup Status',
      ok: false,
      detail:
        'Previous setup was cancelled or interrupted. Run "sm setup" (or "npx schema-memory setup") to finish configuration.',
    });
  }

  const selectedTargets = setupState.targets;
  const legacyChecks = !selectedTargets || selectedTargets.length === 0;
  const setupProfile = setupState.profile || 'recommended';
  const includesTarget = (target: SetupTarget): boolean =>
    legacyChecks || (selectedTargets as SetupTarget[]).includes(target);

  // 4. OpenCode MCP (~/.config/opencode/opencode.json) — native V2 shape, V1 fallback
  const openCodeJsonPath = resolve(home, '.config', 'opencode', 'opencode.json');
  const openCodeRaw = await readIfExists(openCodeJsonPath);
  let openCodeOk = false;
  let openCodeDetail = 'Not configured — run "sm setup" (or "npx schema-memory setup" / "bunx schema-memory setup")';
  if (openCodeRaw) {
    try {
      const parsed = JSON.parse(openCodeRaw);
      const v2Entry = parsed?.mcp?.servers?.['schema-memory'];
      const v1Entry = parsed?.mcp?.['schema-memory'];
      const entry = v2Entry ?? v1Entry;
      const enabled = v2Entry
        ? v2Entry.disabled !== true
        : v1Entry
          ? v1Entry.enabled !== false
          : false;

      if (entry && !enabled) {
        openCodeDetail = `Entry exists in ${openCodeJsonPath} but is disabled`;
      } else if (entry && Array.isArray(entry.command)) {
        const bin = entry.command[0];
        if (bin === 'npx' || bin === 'bunx' || bin === 'pnpm') {
          openCodeOk = true;
          openCodeDetail = `${openCodeJsonPath} -> ${entry.command.join(' ')}`;
        } else {
          const cmdPath = entry.command[1];
          if (cmdPath && existsSync(cmdPath)) {
            openCodeOk = true;
            openCodeDetail = `${openCodeJsonPath} -> ${cmdPath}`;
          } else {
            openCodeDetail = `Entry exists in ${openCodeJsonPath}, but target "${cmdPath}" does not exist`;
          }
        }
      }
    } catch {
      openCodeDetail = `Invalid JSON in ${openCodeJsonPath}`;
    }
  }
  if (includesTarget('opencode')) {
    results.push({
      name: 'OpenCode MCP (opencode.json)',
      ok: openCodeOk,
      detail: openCodeDetail,
    });

    if (!legacyChecks && setupProfile !== 'minimal') {
      const skillPath = resolve(
        home,
        '.config',
        'opencode',
        'skills',
        'schema-memory',
        'SKILL.md'
      );
      results.push({
        name: 'OpenCode Skill',
        ok: existsSync(skillPath),
        detail: existsSync(skillPath) ? skillPath : 'Missing — run "sm setup"',
      });
    }

    if (!legacyChecks && setupProfile === 'strict') {
      const agentsPath = resolve(home, '.config', 'opencode', 'AGENTS.md');
      const raw = await readIfExists(agentsPath);
      const ok =
        !!raw &&
        raw.includes('<!-- schema-memory:start -->') &&
        raw.includes('<!-- schema-memory:end -->');
      results.push({
        name: 'OpenCode Rules (AGENTS.md)',
        ok,
        detail: ok ? agentsPath : 'Missing schema-memory block — run "sm setup"',
      });
    }
  }

  const antigravityNeedsGlobalMcp =
    legacyChecks ||
    ((includesTarget('antigravity') || includesTarget('antigravity-cli')) &&
      setupProfile === 'minimal');

  if (antigravityNeedsGlobalMcp) {
    const agyMcpPath = resolve(home, '.gemini', 'config', 'mcp_config.json');
    const agyMcpRaw = await readIfExists(agyMcpPath);
    let agyOk = false;
    let agyDetail = 'Not configured — run "sm setup" (or "npx schema-memory setup" / "bunx schema-memory setup")';
    if (agyMcpRaw) {
      try {
        const parsed = JSON.parse(agyMcpRaw);
        const entry = parsed?.mcpServers?.['schema-memory-mcp'];
        if (entry && Array.isArray(entry.args)) {
          const bin = entry.command;
          if (bin === 'npx' || bin === 'bunx' || bin === 'pnpm') {
            agyOk = true;
            agyDetail = `${agyMcpPath} -> ${bin} ${entry.args.join(' ')}`;
          } else {
            const cmdPath = entry.args[0];
            if (cmdPath && existsSync(cmdPath)) {
              agyOk = true;
              agyDetail = `${agyMcpPath} -> ${cmdPath}`;
            } else {
              agyDetail = `Entry exists in ${agyMcpPath}, but target "${cmdPath}" does not exist`;
            }
          }
        }
      } catch {
        agyDetail = `Invalid JSON in ${agyMcpPath}`;
      }
    }
    results.push({
      name: 'Antigravity Global MCP (mcp_config.json)',
      ok: agyOk,
      detail: agyDetail,
    });
  }

  if (
    !legacyChecks &&
    includesTarget('antigravity') &&
    setupProfile !== 'minimal'
  ) {
    const pluginDir = resolve(
      home,
      '.gemini',
      'config',
      'plugins',
      'schema-memory'
    );
    const manifestPath = resolve(pluginDir, 'plugin.json');
    const skillPath = resolve(pluginDir, 'skills', 'schema-memory', 'SKILL.md');
    const ok = existsSync(manifestPath) && existsSync(skillPath);
    results.push({
      name: 'Antigravity Plugin Bundle',
      ok,
      detail: ok
        ? pluginDir
        : `Missing plugin files in ${pluginDir} — run "sm setup"`,
    });
  }

  if (
    !legacyChecks &&
    includesTarget('antigravity-cli') &&
    setupProfile !== 'minimal'
  ) {
    const pluginDir = resolve(
      home,
      '.schema-memory',
      'plugins',
      'antigravity',
      'schema-memory'
    );
    const manifestPath = resolve(pluginDir, 'plugin.json');
    const skillPath = resolve(pluginDir, 'skills', 'schema-memory', 'SKILL.md');
    const bundleOk = existsSync(manifestPath) && existsSync(skillPath);
    results.push({
      name: 'Antigravity CLI Plugin Bundle',
      ok: bundleOk,
      detail: bundleOk
        ? pluginDir
        : `Missing plugin files in ${pluginDir} — run "sm setup"`,
    });

    const agy = platform.findCommandOnPath('agy');
    let imported = false;
    let detail = 'Antigravity CLI (agy) not found — install it or import the plugin manually';
    if (agy) {
      const res = spawnSync('agy', ['plugin', 'list', '--json'], {
        encoding: 'utf-8',
        timeout: 5000,
      });
      if (res.error || res.status !== 0) {
        detail = `Could not run "agy plugin list --json"${
          res.error ? `: ${res.error.message}` : ''
        }`;
      } else {
        try {
          const list = JSON.parse(String(res.stdout || ''));
          imported =
            Array.isArray(list) &&
            list.some((item: any) => item?.name === 'schema-memory');
          detail = imported
            ? 'schema-memory imported into Antigravity CLI'
            : `Not imported — run: agy plugin install "${pluginDir}"`;
        } catch {
          detail = 'Invalid JSON from "agy plugin list --json"';
        }
      }
    }
    results.push({
      name: 'Antigravity CLI Plugin',
      ok: imported,
      detail,
    });
  }

  if (includesTarget('agents')) {
    const stdSkillPath = resolve(
      home,
      '.agents',
      'skills',
      'schema-memory',
      'SKILL.md'
    );
    const stdSkillExists = existsSync(stdSkillPath);
    results.push({
      name: 'Universal Skill (~/.agents/skills)',
      ok: stdSkillExists,
      detail: stdSkillExists ? stdSkillPath : 'Missing — run "sm setup"',
    });
  }

  // 6. Current Directory / Registered Projects
  const localConfig = await readConfig(cwd);
  const projects = await listProjects();
  if (localConfig) {
    const cwdKey = normalizePathKey(cwd);
    const registered = projects.some((p) => normalizePathKey(p.path) === cwdKey);
    results.push({
      name: 'Current Directory Project',
      ok: registered,
      detail: registered
        ? `Initialized as "${localConfig.name}" (id: ${localConfig.id}, dialect: ${localConfig.dialect})`
        : `Detected "${localConfig.name}" (id: ${localConfig.id}) but not registered on this machine — run "sm add" to register it`,
    });
  } else {
    results.push({
      name: 'Registered Projects',
      ok: true,
      detail: `${projects.length} project(s) registered in ~/.schema-memory/projects.json (current dir is not a client project)`,
    });
  }

  return results;
}

export async function doctorCommand(): Promise<void> {
  const checks = await runDoctorChecks();
  console.log('\n🩺 schema-memory Doctor\n');

  let allOk = true;
  for (const check of checks) {
    const icon = check.ok ? '✅' : '❌';
    if (!check.ok) allOk = false;
    console.log(`  ${icon} ${check.name}`);
    console.log(`     ${check.detail}`);
  }

  if (allOk) {
    console.log(
      '\n🎉 Everything is healthy! Your agents (OpenCode & Antigravity) have direct access to schema-memory MCP tools.\n'
    );
  } else {
    console.log(
      '\n⚠️  Some checks failed. Run "sm setup" to fix global agent registration.\n'
    );
  }
}
