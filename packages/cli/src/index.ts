import process from 'node:process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Command } from 'commander';

declare const __CLI_VERSION__: string;

function getCliVersion(): string {
  // Prefer the version from the published package.json; standalone binaries
  // fall back to the constant injected at build time.
  try {
    const pkgUrl = new URL('../package.json', import.meta.url);
    const pkg = JSON.parse(readFileSync(pkgUrl, 'utf-8')) as { version?: string };
    if (pkg.version) return pkg.version;
  } catch {
    // ignore and use the build-time constant below
  }
  return typeof __CLI_VERSION__ === 'undefined' ? '0.0.0' : __CLI_VERSION__;
}

function hasGlobalSetup(home = homedir()): boolean {
  const candidates = [
    resolve(home, '.config', 'opencode', 'opencode.json'),
    resolve(home, '.gemini', 'config', 'mcp_config.json'),
    resolve(home, '.gemini', 'config', 'plugins', 'schema-memory', 'plugin.json'),
    resolve(home, '.agents', 'skills', 'schema-memory', 'SKILL.md'),
  ];
  for (const file of candidates) {
    try {
      if (existsSync(file) && readFileSync(file, 'utf-8').includes('schema-memory')) {
        return true;
      }
    } catch {
      // ignore unreadable config files
    }
  }
  return false;
}

import {
  readSetupState,
  writeSetupState,
  shouldOfferPrompt,
} from './setup-state.js';

let isSetupActive = false;
process.on('SIGINT', async () => {
  if (isSetupActive) {
    try {
      await writeSetupState({
        interrupted: true,
        lastOfferedAt: new Date().toISOString(),
      });
    } catch {}
    console.log(
      '\n\nSetup cancelado. Puedes volver a ejecutarlo en cualquier momento con "sm setup" (o "npx schema-memory setup").\n'
    );
    process.exit(130);
  }
  process.exit(0);
});

async function offerFirstRunSetup(): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;
  if (process.env.SCHEMA_MEMORY_SKIP_SETUP_PROMPT === '1') return;
  if (hasGlobalSetup()) return;

  const state = await readSetupState();
  if (!shouldOfferPrompt(state)) return;

  console.log(
    '\n👋 schema-memory is not configured globally yet (agent MCP, skills and rules).'
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolveAnswer) => {
    rl.question('   Run "sm setup" now? (Y/n) ', (value) => {
      rl.close();
      resolveAnswer(value);
    });
  });

  const normalized = answer.trim().toLowerCase();
  if (normalized === '' || normalized === 'y' || normalized === 'yes') {
    isSetupActive = true;
    try {
      const { setupCommand } = await import('./commands/setup.js');
      await setupCommand({});
    } finally {
      isSetupActive = false;
    }
  } else {
    await writeSetupState({
      lastOfferedAt: new Date().toISOString(),
      globalInstallDeclined: true,
    });
    console.log(
      '   Skipped. Run "sm setup" (or "npx schema-memory setup" / "bunx schema-memory setup") anytime to configure your agents.\n'
    );
  }
}

const program = new Command();

program
  .name('schema-memory')
  .alias('sm')
  .description('Live database schema memory & ADR workflow for AI pair programming')
  .version(getCliVersion());

async function offerRegisterCwdProject(): Promise<string | undefined> {
  const { detectProjectFromCwd } = await import('./detect.js');
  const detected = await detectProjectFromCwd();
  if (!detected) return undefined;
  if (detected.registered) return detected.registeredId;

  console.log(
    `\n📦 Detected schema-memory project "${detected.config.name}" in ${detected.path}, not registered on this machine yet.`
  );
  if (!process.stdin.isTTY || !process.stdout.isTTY) return undefined;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolveAnswer) => {
    rl.question('   Register it now? (Y/n) ', (value) => {
      rl.close();
      resolveAnswer(value);
    });
  });
  const normalized = answer.trim().toLowerCase();
  if (normalized !== '' && normalized !== 'y' && normalized !== 'yes') {
    return undefined;
  }

  const { planAddProject, applyAddProject, ProjectConflictError } = await import(
    '@schema-memory/core'
  );
  try {
    const plan = await planAddProject(detected.path);
    const config = await applyAddProject(plan, {});
    console.log(`   ✅ Registered "${config.name}" (id: ${config.id}).`);
    return config.id;
  } catch (err: any) {
    if (err instanceof ProjectConflictError) {
      console.log(
        `   ⚠️  Id "${err.id}" is already registered at ${err.existingPath}. Run "sm add --replace" or "sm add --new" to resolve.`
      );
      return undefined;
    }
    throw err;
  }
}

program
  .command('ui', { isDefault: true })
  .alias('start')
  .description('Start the local web UI and API server (default command)')
  .option('-p, --port <port>', 'Server port (default: 4317)')
  .option('--foreground', 'Run server in foreground without daemonizing')
  .option('--open', 'Open web browser automatically (default: true)')
  .option('--no-open', 'Do not open web browser automatically')
  .action(async (opts) => {
    try {
      await offerFirstRunSetup();
      const projectId = await offerRegisterCwdProject();
      const { uiCommand } = await import('./commands/ui.js');
      await uiCommand({ ...opts, projectId });
    } catch (err: any) {
      console.error('Error starting UI:', err.message);
      process.exit(1);
    }
  });

program
  .command('stop')
  .description('Stop the background schema-memory UI server')
  .action(async () => {
    try {
      const { stopDaemon } = await import('./daemon.js');
      const res = await stopDaemon();
      console.log(res.detail);
    } catch (err: any) {
      console.error('Error stopping UI:', err.message);
      process.exit(1);
    }
  });

program
  .command('restart')
  .description('Restart the background schema-memory UI server')
  .option('-p, --port <port>', 'Server port (default: 4317)')
  .option('--open', 'Open web browser automatically (default: true)')
  .option('--no-open', 'Do not open web browser automatically')
  .action(async (opts) => {
    try {
      const { restartDaemon } = await import('./daemon.js');
      const port = opts.port ? parseInt(opts.port, 10) : 4317;
      console.log('\n🔄 Restarting schema-memory UI daemon...');
      const state = await restartDaemon({ port, open: opts.open });
      console.log(`✅ schema-memory UI running at: ${state.url} (PID ${state.pid})\n`);
    } catch (err: any) {
      console.error('Error restarting UI:', err.message);
      process.exit(1);
    }
  });

program
  .command('add [path]')
  .alias('init')
  .description('Add and scaffold a project to schema-memory (defaults to current directory ".")')
  .option('-n, --name <name>', 'Custom project name')
  .option('-d, --dialect <dialect>', 'Database dialect (postgres, mysql, sqlite, etc.)')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--project-skill', 'Install custom project skill in .agents/')
  .option('--replace', 'If the project id is registered at another path, replace that path')
  .option('--new', 'If the project id is registered at another path, register this one with a new id')
  .action(async (targetPath = '.', opts) => {
    try {
      const { addCommand } = await import('./commands/add.js');
      await addCommand(targetPath, opts);
    } catch (err: any) {
      console.error('Error adding project:', err.message);
      process.exit(1);
    }
  });

program
  .command('remove [id]')
  .alias('rm')
  .description('Unregister a project from schema-memory (defaults to current directory)')
  .option('--delete-data', 'Also delete the .schema-memory data directory')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (id, opts) => {
    try {
      const { removeCommand } = await import('./commands/remove.js');
      await removeCommand(id, opts);
    } catch (err: any) {
      console.error('Error removing project:', err.message);
      process.exit(1);
    }
  });

program
  .command('status')
  .aliases(['ls', 'list'])
  .description('Show status of registered projects, pending changes and ADRs')
  .option('-p, --project <project>', 'Filter by project ID or path')
  .action(async (opts) => {
    try {
      const { statusCommand } = await import('./commands/status.js');
      await statusCommand(opts);
    } catch (err: any) {
      console.error('Error checking status:', err.message);
      process.exit(1);
    }
  });

program
  .command('mcp')
  .description('Start the MCP server over stdio for agent integration')
  .action(async () => {
    try {
      const { startStdioServer } = await import('@schema-memory/mcp');
      await startStdioServer();
    } catch (err: any) {
      console.error('Fatal MCP server error:', err.message);
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Configure only the agents you use: OpenCode, Antigravity, Antigravity CLI or standard skills')
  .option(
    '-t, --target <targets>',
    'Comma-separated targets: all | opencode | antigravity | antigravity-cli | agents'
  )
  .option(
    '-p, --profile <profile>',
    'Install profile: minimal | recommended | strict (default: recommended)'
  )
  .option('--print', 'Print the selected configuration without installing')
  .option('--yes', 'Skip confirmation prompts (useful for automation)')
  .option(
    '--refresh-projects',
    'Refresh the schema-memory AGENTS.md block in every registered project'
  )
  .option('--cli-only', 'Only link the global "sm" and "schema-memory" CLI commands in ~/.local/bin')
  .option('--install-global', 'Install "sm" globally via package manager (npm / bun / pnpm)')
  .option('--no-install-global', 'Skip installing "sm" globally via package manager')
  .action(async (opts) => {
    try {
      const { setupCommand } = await import('./commands/setup.js');
      await setupCommand(opts);
    } catch (err: any) {
      console.error('Error during setup:', err.message);
      process.exit(1);
    }
  });

program
  .command('doctor')
  .description('Verify global MCP registration, skills, CLI binary and project status')
  .action(async () => {
    try {
      const { doctorCommand } = await import('./commands/doctor.js');
      await doctorCommand();
    } catch (err: any) {
      console.error('Error running doctor:', err.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
