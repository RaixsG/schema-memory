import process from 'node:process';
import { Command } from 'commander';
import { startStdioServer } from '@schema-memory/mcp';
import { uiCommand } from './commands/ui.js';
import { addCommand } from './commands/add.js';
import { removeCommand } from './commands/remove.js';
import { statusCommand } from './commands/status.js';
import { setupCommand } from './commands/setup.js';
import { doctorCommand } from './commands/doctor.js';

const program = new Command();

program
  .name('schema-memory')
  .alias('sm')
  .description('Live database schema memory & ADR workflow for AI pair programming')
  .version('0.1.0');

program
  .command('ui', { isDefault: true })
  .description('Start the local web UI and API server (default command)')
  .option('-p, --port <port>', 'Server port (default: 4317)')
  .option('--open', 'Open web browser automatically (default: true)')
  .option('--no-open', 'Do not open web browser automatically')
  .action(async (opts) => {
    try {
      await uiCommand(opts);
    } catch (err: any) {
      console.error('Error starting UI:', err.message);
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
  .action(async (targetPath = '.', opts) => {
    try {
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
      await startStdioServer();
    } catch (err: any) {
      console.error('Fatal MCP server error:', err.message);
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Configure global MCP, skills and rules for OpenCode, Antigravity & standard agents')
  .option('-t, --target <target>', 'Target environment: all | opencode | antigravity | agents (default: all)', 'all')
  .option('--print', 'Print configuration without installing')
  .option('--cli-only', 'Only link the global "sm" and "schema-memory" CLI commands in ~/.local/bin')
  .action(async (opts) => {
    try {
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
      await doctorCommand();
    } catch (err: any) {
      console.error('Error running doctor:', err.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
