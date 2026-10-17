import { resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { readIfExists, listProjects, readConfig } from '@schema-memory/core';
import { findCommandOnPath, fallbackShimExists } from '../platform.js';

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

  // 2. Global CLI command (npm/pnpm shims on PATH or fallback ~/.local/bin shims)
  const smOnPath = findCommandOnPath('sm') ?? findCommandOnPath('schema-memory');
  const fallbackShim = fallbackShimExists(resolve(home, '.local', 'bin'));
  const smBinExists = smOnPath !== null || fallbackShim !== null;
  results.push({
    name: 'Global CLI (sm)',
    ok: smBinExists,
    detail: smOnPath
      ? `Resolved on PATH: ${smOnPath}`
      : fallbackShim
        ? fallbackShim
        : 'Not linked — run "sm setup" or install globally with "npm i -g schema-memory"',
  });

  // 3. OpenCode MCP (~/.config/opencode/opencode.json) — native V2 shape, V1 fallback
  const openCodeJsonPath = resolve(home, '.config', 'opencode', 'opencode.json');
  const openCodeRaw = await readIfExists(openCodeJsonPath);
  let openCodeOk = false;
  let openCodeDetail = 'Not configured — run "sm setup"';
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
        const cmdPath = entry.command[1];
        if (cmdPath && existsSync(cmdPath)) {
          openCodeOk = true;
          openCodeDetail = `${openCodeJsonPath} -> ${cmdPath}`;
        } else {
          openCodeDetail = `Entry exists in ${openCodeJsonPath}, but target "${cmdPath}" does not exist`;
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
  let agyDetail = 'Not configured — run "sm setup"';
  if (agyMcpRaw) {
    try {
      const parsed = JSON.parse(agyMcpRaw);
      const entry = parsed?.mcpServers?.['schema-memory-mcp'];
      if (entry && Array.isArray(entry.args)) {
        const cmdPath = entry.args[0];
        if (cmdPath && existsSync(cmdPath)) {
          agyOk = true;
          agyDetail = `${agyMcpPath} -> ${cmdPath}`;
        } else {
          agyDetail = `Entry exists in ${agyMcpPath}, but target "${cmdPath}" does not exist`;
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
    results.push({
      name: 'Current Directory Project',
      ok: true,
      detail: `Initialized as "${localConfig.name}" (id: ${localConfig.id}, dialect: ${localConfig.dialect})`,
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
