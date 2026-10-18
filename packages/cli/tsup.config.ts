import { defineConfig } from 'tsup';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const currentDir = dirname(fileURLToPath(import.meta.url));

const pkg = JSON.parse(
  await readFile(resolve(currentDir, 'package.json'), 'utf-8')
) as { version: string };

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  clean: true,
  sourcemap: true,
  shims: true,
  define: {
    __CLI_VERSION__: JSON.stringify(pkg.version),
  },
  banner: {
    js: `#!/usr/bin/env node
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);`,
  },
  noExternal: [/(.*)/],
  async onSuccess() {
    const webDist = resolve(currentDir, '../../apps/web/dist');
    const targetWeb = resolve(currentDir, 'dist/web');
    if (existsSync(webDist)) {
      await mkdir(targetWeb, { recursive: true });
      await cp(webDist, targetWeb, { recursive: true });
      console.log('✅ Static web assets bundled into dist/web');
    }

    const rootReadme = resolve(currentDir, '../../README.md');
    const rootLicense = resolve(currentDir, '../../LICENSE');
    if (existsSync(rootReadme)) {
      await cp(rootReadme, resolve(currentDir, 'README.md'));
    }
    if (existsSync(rootLicense)) {
      await cp(rootLicense, resolve(currentDir, 'LICENSE'));
    }
  },
});
