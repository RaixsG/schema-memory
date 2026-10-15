import {
  listProjects,
  resolveProject,
  readConfig,
  getPending,
  listAdrs,
} from '@schema-memory/core';

export async function statusCommand(options: { project?: string }): Promise<void> {
  if (options.project) {
    const resolved = await resolveProject({ project: options.project });
    const config = await readConfig(resolved.path);
    const pending = await getPending(resolved.path);
    const adrs = await listAdrs(resolved.path);
    const unconfirmed = adrs.filter((a) => a.metadata.status !== 'confirmado');

    console.log(`\n📊 Status for project: ${resolved.name} (${resolved.id})`);
    console.log(`Path: ${resolved.path}`);
    console.log(`Dialect: ${config?.dialect || 'postgres'}`);
    console.log(`Stack: ${config?.stack.join(', ') || 'generic'}`);
    console.log(`Pending change: ${pending ? `YES (${pending.changes.length} change(s), stale=${pending.stale})` : 'None'}`);
    console.log(`Total ADRs: ${adrs.length} (${unconfirmed.length} unconfirmed)`);
    return;
  }

  const projects = await listProjects();
  if (projects.length === 0) {
    console.log('\nNo projects registered. Run "schema-memory add <path>" to add one.\n');
    return;
  }

  console.log(`\n📋 Registered Projects (${projects.length}):\n`);
  for (const p of projects) {
    const pending = await getPending(p.path);
    const adrs = await listAdrs(p.path);
    const pendingBadge = pending ? (pending.stale ? ' [PENDING: STALE]' : ' [PENDING]') : '';
    console.log(` • ${p.id.padEnd(20)} ${p.name.padEnd(25)} ${pendingBadge}`);
    console.log(`   Path: ${p.path} (ADRs: ${adrs.length})`);
  }
  console.log();
}
