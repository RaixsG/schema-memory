import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { atomicWrite, ensureDir } from '@schema-memory/core';

export async function setupCommand(options: { print?: boolean }): Promise<void> {
  const currentFile = fileURLToPath(import.meta.url);
  const cliDistPath = resolve(dirname(currentFile), '..', 'dist', 'index.js');

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

  const mcpConfig = {
    mcpServers: {
      'schema-memory-mcp': {
        command: 'node',
        args: [cliDistPath, 'mcp'],
      },
    },
  };

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

  if (options.print) {
    console.log('--- plugin.json ---');
    console.log(JSON.stringify(pluginManifest, null, 2));
    console.log('\n--- mcp_config.json ---');
    console.log(JSON.stringify(mcpConfig, null, 2));
    console.log('\n--- skills/schema-memory/SKILL.md ---');
    console.log(skillContent);
    return;
  }

  const targetDir = resolve(homedir(), '.gemini', 'config', 'plugins', 'schema-memory');
  await ensureDir(targetDir);
  await ensureDir(resolve(targetDir, 'skills', 'schema-memory'));
  await ensureDir(resolve(targetDir, 'rules'));

  await atomicWrite(
    resolve(targetDir, 'plugin.json'),
    JSON.stringify(pluginManifest, null, 2) + '\n'
  );
  await atomicWrite(
    resolve(targetDir, 'mcp_config.json'),
    JSON.stringify(mcpConfig, null, 2) + '\n'
  );
  await atomicWrite(
    resolve(targetDir, 'skills', 'schema-memory', 'SKILL.md'),
    skillContent
  );
  await atomicWrite(
    resolve(targetDir, 'rules', 'AGENTS.md'),
    rulesContent
  );

  console.log(`\n✅ Plugin installed at: ${targetDir}`);
  console.log('Restart Antigravity to activate the plugin.\n');
}
