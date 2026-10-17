import { resolve } from 'node:path';
import { stat } from 'node:fs/promises';
import { readIfExists } from './fsx.js';

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function detectStack(repoPath: string): Promise<string[]> {
  const [
    hasPrismaDir,
    hasPrismaRoot,
    hasKnexJs,
    hasKnexTs,
    hasKnexCjs,
    hasDrizzleTs,
    hasDrizzleJs,
    hasDrizzleJson,
    hasDjango,
    hasLaravel,
    hasGemfile,
    hasRailsSchema,
    hasAlembic,
    hasMigrationsRoot,
    hasDbMigrations,
    hasSqlMigrations,
    pkgContent,
  ] = await Promise.all([
    exists(resolve(repoPath, 'prisma', 'schema.prisma')),
    exists(resolve(repoPath, 'schema.prisma')),
    exists(resolve(repoPath, 'knexfile.js')),
    exists(resolve(repoPath, 'knexfile.ts')),
    exists(resolve(repoPath, 'knexfile.cjs')),
    exists(resolve(repoPath, 'drizzle.config.ts')),
    exists(resolve(repoPath, 'drizzle.config.js')),
    exists(resolve(repoPath, 'drizzle.config.json')),
    exists(resolve(repoPath, 'manage.py')),
    exists(resolve(repoPath, 'artisan')),
    exists(resolve(repoPath, 'Gemfile')),
    exists(resolve(repoPath, 'db', 'schema.rb')),
    exists(resolve(repoPath, 'alembic.ini')),
    exists(resolve(repoPath, 'migrations')),
    exists(resolve(repoPath, 'db', 'migrations')),
    exists(resolve(repoPath, 'sql', 'migrations')),
    readIfExists(resolve(repoPath, 'package.json')),
  ]);

  const stack: string[] = [];

  if (hasPrismaDir || hasPrismaRoot) stack.push('prisma');
  if (hasKnexJs || hasKnexTs || hasKnexCjs) stack.push('knex');
  if (hasDrizzleTs || hasDrizzleJs || hasDrizzleJson) stack.push('drizzle');
  if (hasDjango) stack.push('django');
  if (hasLaravel) stack.push('laravel');
  if (hasGemfile && hasRailsSchema) stack.push('rails');
  if (hasAlembic) stack.push('alembic');
  if (hasMigrationsRoot || hasDbMigrations || hasSqlMigrations) {
    stack.push('sql-migrations');
  }

  if (pkgContent) {
    try {
      const pkg = JSON.parse(pkgContent);
      const allDeps = {
        ...pkg.dependencies,
        ...pkg.devDependencies,
      };
      if (allDeps['typeorm']) stack.push('typeorm');
      if (allDeps['sequelize']) stack.push('sequelize');
    } catch {
      // ignore parse errors
    }
  }

  return Array.from(new Set(stack));
}
