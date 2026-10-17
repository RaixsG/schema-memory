import {
  listProjects,
  resolveProject,
  readConfig,
  getPending,
  getPendingStatus,
  countAdrsStatus,
} from '@schema-memory/core';

export async function statusCommand(options: { project?: string }): Promise<void> {
  if (options.project) {
    const resolved = await resolveProject({ project: options.project });
    const [config, pending, adrCounts] = await Promise.all([
      readConfig(resolved.path),
      getPending(resolved.path),
      countAdrsStatus(resolved.path),
    ]);

    console.log(`\n📊 Status for project: ${resolved.name} (${resolved.id})`);
    console.log(`Path: ${resolved.path}`);
    console.log(`Dialect: ${config?.dialect || 'postgres'}`);
    console.log(`Stack: ${config?.stack.join(', ') || 'generic'}`);
    console.log(`Pending change: ${pending ? `YES (${pending.changes.length} change(s), stale=${pending.stale})` : 'None'}`);
    console.log(`Total ADRs: ${adrCounts.totalAdrs} (${adrCounts.unconfirmedAdrs} unconfirmed)`);
    return;
  }

  const projects = await listProjects();
  if (projects.length === 0) {
    console.log('\nNo projects registered. Run "schema-memory add <path>" to add one.\n');
    return;
  }

  console.log(`\n📋 Registered Projects (${projects.length}):\n`);
  const rows = await Promise.all(
    projects.map(async (p) => {
      const [pendingStatus, adrCounts] = await Promise.all([
        getPendingStatus(p.path),
        countAdrsStatus(p.path),
      ]);
      const pendingBadge = pendingStatus.hasPending
        ? pendingStatus.stale
          ? ' [PENDING: STALE]'
          : ' [PENDING]'
        : '';
      return { p, pendingBadge, totalAdrs: adrCounts.totalAdrs };
    })
  );

  for (const { p, pendingBadge, totalAdrs } of rows) {
    console.log(` • ${p.id.padEnd(20)} ${p.name.padEnd(25)} ${pendingBadge}`);
    console.log(`   Path: ${p.path} (ADRs: ${totalAdrs})`);
  }
  console.log();
}
