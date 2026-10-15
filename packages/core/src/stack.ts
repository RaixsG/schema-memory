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
  const stack: string[] = [];

  // Prisma
  if (
    (await exists(resolve(repoPath, 'prisma', 'schema.prisma'))) ||
    (await exists(resolve(repoPath, 'schema.prisma')))
  ) {
    stack.push('prisma');
  }

  // Knex
  if (
    (await exists(resolve(repoPath, 'knexfile.js'))) ||
    (await exists(resolve(repoPath, 'knexfile.ts'))) ||
    (await exists(resolve(repoPath, 'knexfile.cjs')))
  ) {
    stack.push('knex');
  }

  // Drizzle
  if (
    (await exists(resolve(repoPath, 'drizzle.config.ts'))) ||
    (await exists(resolve(repoPath, 'drizzle.config.js'))) ||
    (await exists(resolve(repoPath, 'drizzle.config.json')))
  ) {
    stack.push('drizzle');
  }

  // Django
  if (await exists(resolve(repoPath, 'manage.py'))) {
    stack.push('django');
  }

  // Laravel
  if (await exists(resolve(repoPath, 'artisan'))) {
    stack.push('laravel');
  }

  // Rails
  if (
    (await exists(resolve(repoPath, 'Gemfile'))) &&
    (await exists(resolve(repoPath, 'db', 'schema.rb')))
  ) {
    stack.push('rails');
  }

  // Alembic
  if (await exists(resolve(repoPath, 'alembic.ini'))) {
    stack.push('alembic');
  }

  // SQL migrations directory
  if (
    (await exists(resolve(repoPath, 'migrations'))) ||
    (await exists(resolve(repoPath, 'db', 'migrations'))) ||
    (await exists(resolve(repoPath, 'sql', 'migrations')))
  ) {
    stack.push('sql-migrations');
  }

  // package.json checks for TypeORM or Sequelize
  const pkgContent = await readIfExists(resolve(repoPath, 'package.json'));
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
