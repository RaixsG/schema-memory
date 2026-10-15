import { planAddProject, applyAddProject, Dialect } from '@schema-memory/core';
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

export async function addCommand(
  targetPath: string,
  options: {
    name?: string;
    dialect?: string;
    yes?: boolean;
    projectSkill?: boolean;
  }
): Promise<void> {
  const plan = await planAddProject(targetPath);

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
