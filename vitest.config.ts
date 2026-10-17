import { defineConfig } from 'vitest/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@schema-memory/core': resolve(__dirname, 'packages/core/src/index.ts'),
      '@schema-memory/mcp': resolve(__dirname, 'packages/mcp/src/index.ts'),
      '@schema-memory/server': resolve(__dirname, 'packages/server/src/index.ts'),
    },
  },
  test: {
    projects: [
      'packages/*',
      'apps/*',
    ],
  },
});
