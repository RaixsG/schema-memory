import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import {
  readIfExists,
  listProjects,
  readConfig,
  normalizePathKey,
  getRegistryDir,
} from '@schema-memory/core';
import { findCommandOnPath, fallbackShimExists, isWindows } from '../platform.js';
import { readSetupState } from '../setup-state.js';
import { isCorruptedShimContent } from '../windows-shim.js';

export interface DoctorCheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export async function runDoctorChecks(options?: {
  homeDir?: string;
  cwd?: string;
  cliDistPath?: string;
}): Promise<DoctorCheckResult[]> {
  const home = options?.homeDir || homedir();
  const cwd = options?.cwd || process.cwd();
  const currentFile = fileURLToPath(import.meta.url);
  const cliDistPath =
    options?.cliDistPath || resolve(dirname(currentFile), '..', 'dist', 'index.js');

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
  const smOnPath = findCommandOnPath('sm') ?? findCommandOnPath('schema-memory');
  const fallbackShim = fallbackShimExists(resolve(home, '.local', 'bin'));
  const smBinExists = smOnPath !== null || fallbackShim !== null;

  const localBinDir = resolve(home, '.local', 'bin');
  const candidateFiles = [
    smOnPath,
    fallbackShim,
    resolve(localBinDir, 'sm.cmd'),
    resolve(localBinDir, 'sm.ps1'),
    resolve(localBinDir, 'sm'),
    resolve(localBinDir, 'schema-memory.cmd'),
    resolve(localBinDir, 'schema-memory.ps1'),
    resolve(localBinDir, 'schema-memory'),
  ].filter((p): p is string => Boolean(p && existsSync(p)));

  let corruptedShimPath: string | null = null;
  for (const file of candidateFiles) {
    try {
      const content = await readIfExists(file);
      if (content && isCorruptedShimContent(content)) {
        corruptedShimPath = file;
        break;
      }
    } catch {
      // ignore read error
    }
  }

  let smOk = smBinExists;
  let smDetail: string;
  if (corruptedShimPath) {
    smOk = false;
    smDetail = `Corrupted cross-drive shim detected at "${corruptedShimPath}". Run "sm setup --cli-only" (or "pnpm sm setup --cli-only") to repair.`;
  } else if (smOnPath) {
    smDetail = `Resolved on PATH: ${smOnPath}`;
  } else if (fallbackShim) {
    smDetail = isWindows
      ? `Found fallback shim at "${fallbackShim}", but directory is not on PATH. Fix: run "npm i -g schema-memory" or add "%USERPROFILE%\\.local\\bin" to PATH.`
      : `Found fallback shim at "${fallbackShim}", but directory is not on PATH. Fix: run "npm i -g schema-memory" or add "export PATH=\\"$HOME/.local/bin:$PATH\\"" to ~/.zshrc or ~/.bashrc.`;
  } else {
    smDetail = isWindows
      ? `Not on PATH. Fix: run "npm i -g schema-memory" or add "%USERPROFILE%\\.local\\bin" to PATH.`
      : `Not on PATH. Fix: run "npm i -g schema-memory" or add "export PATH=\\"$HOME/.local/bin:$PATH\\"" to ~/.zshrc or ~/.bashrc.`;
  }
  results.push({
    name: 'Global CLI (sm)',
    ok: smOk,
    detail: smDetail,
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
  results.push({
    name: 'OpenCode MCP (opencode.json)',
    ok: openCodeOk,
    detail: openCodeDetail,
  });

  // 4. Antigravity Direct Global MCP (~/.gemini/config/mcp_config.json)
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

  // 5. Standard Agent Skill (~/.agents/skills/schema-memory/SKILL.md)
  const stdSkillPath = resolve(home, '.agents', 'skills', 'schema-memory', 'SKILL.md');
  const stdSkillExists = existsSync(stdSkillPath);
  results.push({
    name: 'Universal Skill (~/.agents/skills)',
    ok: stdSkillExists,
    detail: stdSkillExists ? stdSkillPath : 'Missing — run "sm setup"',
  });

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
