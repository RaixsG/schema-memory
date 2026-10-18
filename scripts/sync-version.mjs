#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const rawVersion = process.argv[2];
if (!rawVersion) {
  console.error('Usage: node scripts/sync-version.mjs <version>');
  process.exit(1);
}

const version = rawVersion.replace(/^v/, '').trim();
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid semver version: "${rawVersion}"`);
  process.exit(1);
}

const pkgPaths = [
  'package.json',
  'packages/cli/package.json',
  'packages/core/package.json',
  'packages/server/package.json',
  'packages/mcp/package.json',
  'apps/web/package.json',
];

console.log(`🔄 Syncing monorepo version to v${version}...`);
for (const rel of pkgPaths) {
  const full = resolve(rootDir, rel);
  if (!existsSync(full)) continue;
  const json = JSON.parse(readFileSync(full, 'utf8'));
  const oldVersion = json.version;
  json.version = version;
  writeFileSync(full, JSON.stringify(json, null, 2) + '\n', 'utf8');
  console.log(`   ✔ ${rel}: v${oldVersion} -> v${version}`);
}

const lockfile = resolve(rootDir, 'pnpm-lock.yaml');
if (existsSync(lockfile)) {
  console.log('📦 Refreshing pnpm-lock.yaml...');
  try {
    execSync('pnpm install --lockfile-only', { cwd: rootDir, stdio: 'inherit' });
  } catch (err) {
    console.warn('⚠️  Could not run pnpm install --lockfile-only automatically:', err.message);
  }
}

console.log('✅ Monorepo version sync complete.');
