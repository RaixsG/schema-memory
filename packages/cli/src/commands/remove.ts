import { removeProject, resolveProject } from '@schema-memory/core';
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

export async function removeCommand(
  id: string | undefined,
  options: { deleteData?: boolean; yes?: boolean }
): Promise<void> {
  let targetId = id;
  if (!targetId) {
    const resolved = await resolveProject({ cwd: process.cwd() });
    targetId = resolved.id;
  }

  if (!options.yes) {
    const ok = await confirm(
      `Remove schema-memory configuration for project "${targetId}"?${options.deleteData ? ' (WILL DELETE .schema-memory DATA)' : ''}`
    );
    if (!ok) {
      console.log('Operation aborted.');
      return;
    }
  }

  const result = await removeProject(targetId, { deleteData: options.deleteData });
  console.log(`\n✅ Project "${targetId}" unregistered.`);
  if (result.dataDeleted) {
    console.log(`🗑️  Data directory deleted.`);
  }
}
