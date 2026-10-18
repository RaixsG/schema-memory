import {
  planAddProject,
  applyAddProject,
  Dialect,
  ProjectConflictError,
  ConflictResolution,
  ScaffoldPlan,
} from '@schema-memory/core';
import { createInterface } from 'node:readline';

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${question} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}

async function askConflictResolution(
  conflict: { id: string; path: string }
): Promise<ConflictResolution | null> {
  console.log(
    `\n⚠️  A project with id "${conflict.id}" is already registered at:\n   ${conflict.path}`
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => {
    rl.question(
      '   [r]eplace that path, register as [n]ew (distinct id), or [c]ancel? (r/n/C) ',
      (value) => {
        rl.close();
        resolve(value.trim().toLowerCase());
      }
    );
  });
  if (answer === 'r') return 'replace';
  if (answer === 'n') return 'new';
  return null;
}

export async function addCommand(
  targetPath: string,
  options: {
    name?: string;
    dialect?: string;
    yes?: boolean;
    projectSkill?: boolean;
    replace?: boolean;
    new?: boolean;
  }
): Promise<void> {
  const plan: ScaffoldPlan = await planAddProject(targetPath);

  if (plan.mode === 'adopt' && plan.existing) {
    await adoptFlow(plan, options);
    return;
  }

  console.log(`\n📦 Planning schema-memory for: ${plan.path}`);
  console.log(`Detected stack: ${plan.stack.join(', ') || 'generic'}`);
  console.log(`Proposed project ID: ${options.name ? options.name.toLowerCase() : plan.defaultId}\n`);

  console.log('Actions to perform:');
  for (const a of plan.actions) {
    console.log(`  [${a.op.toUpperCase()}] ${a.file} - ${a.preview}`);
    if (a.diff) {
      console.log(`\nDiff:\n${a.diff}\n`);
    }
  }

  if (plan.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of plan.warnings) {
      console.log(`  ⚠️  ${w}`);
    }
  }

  if (!options.yes) {
    const ok = await confirm('\nProceed with applying changes to the project?');
    if (!ok) {
      console.log('Operation aborted.');
      return;
    }
  }

  const config = await applyAddProject(plan, {
    name: options.name,
    dialect: (options.dialect as Dialect) || 'postgres',
    installProjectSkill: options.projectSkill,
  });

  console.log(`\n✅ Project "${config.name}" (id: ${config.id}) successfully added!`);
  console.log(`Schema location: ${plan.path}/.schema-memory/schema.dbml`);
}

async function adoptFlow(
  plan: ScaffoldPlan,
  options: { yes?: boolean; replace?: boolean; new?: boolean }
): Promise<void> {
  const info = plan.existing!;
  console.log(`\n📦 Project already configured in: ${plan.path}`);
  console.log(
    `   ${info.name} (id: ${info.id}) · ${info.dialect} · ${info.tablesCount} tables · ${info.adrCount} ADRs`
  );

  if (plan.registry.registered && !plan.registry.conflict) {
    console.log('\n✅ Already registered on this machine. Nothing to do.');
    return;
  }

  console.log(
    '   Existing .schema-memory/ will NOT be overwritten; it will only be registered locally.'
  );

  let resolution: ConflictResolution | undefined;
  if (options.replace) resolution = 'replace';
  else if (options.new) resolution = 'new';

  if (plan.registry.conflict && !resolution) {
    if (!process.stdin.isTTY) {
      throw new ProjectConflictError(
        plan.registry.conflict.id,
        plan.registry.conflict.path
      );
    }
    const choice = await askConflictResolution(plan.registry.conflict);
    if (!choice) {
      console.log('Operation aborted.');
      return;
    }
    resolution = choice;
  } else if (!options.yes && !plan.registry.conflict && process.stdin.isTTY) {
    const ok = await confirm('\nRegister this project?');
    if (!ok) {
      console.log('Operation aborted.');
      return;
    }
  }

  const config = await applyAddProject(plan, { resolveConflict: resolution });
  console.log(`\n✅ Project "${config.name}" (id: ${config.id}) registered!`);
  if (plan.needsBootstrap) {
    console.log(
      '   Its schema is empty: ask your agent to run import_schema to bootstrap it.'
    );
  }
}
