import { execSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  rmSync,
  existsSync,
  copyFileSync,
  statSync,
  readdirSync,
} from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const cliDist = resolve(rootDir, 'packages/cli/dist/index.js');
const pkg = JSON.parse(readFileSync(resolve(rootDir, 'packages/cli/package.json'), 'utf8'));
const version = pkg.version;
const distBin = resolve(rootDir, 'dist-bin');

if (!existsSync(cliDist)) {
  console.error('❌ packages/cli/dist/index.js not found. Run "pnpm build" first.');
  process.exit(1);
}

if (existsSync(distBin)) {
  rmSync(distBin, { recursive: true, force: true });
}
mkdirSync(distBin, { recursive: true });

const targets = [
  { target: 'bun-darwin-arm64', os: 'darwin', arch: 'arm64', ext: '' },
  { target: 'bun-darwin-x64', os: 'darwin', arch: 'x64', ext: '' },
  { target: 'bun-linux-x64', os: 'linux', arch: 'x64', ext: '' },
  { target: 'bun-windows-x64', os: 'windows', arch: 'x64', ext: '.exe' },
];

console.log(`📦 Building standalone binaries for schema-memory v${version}...`);

for (const t of targets) {
  const binaryName = `sm-${t.os}-${t.arch}${t.ext}`;
  const binaryPath = resolve(distBin, binaryName);
  const archiveName = `schema-memory-v${version}-${t.os}-${t.arch}.tar.gz`;
  const archivePath = resolve(distBin, archiveName);
  const stagingDir = resolve(distBin, `.staging-${t.os}-${t.arch}`);

  console.log(`🔨 Compiling ${t.target} -> ${binaryName}...`);
  execSync(
    `bun build "${cliDist}" --compile --target=${t.target} --outfile="${binaryPath}"`,
    { stdio: 'inherit', cwd: rootDir }
  );

  // Stage the binary renamed as `sm` / `sm.exe` and archive it without
  // GNU-specific tar flags so the script also works on Windows (bsdtar).
  mkdirSync(stagingDir, { recursive: true });
  const stagedName = `sm${t.ext}`;
  copyFileSync(binaryPath, resolve(stagingDir, stagedName));
  console.log(`📦 Archiving ${archiveName}...`);
  execSync(`tar -czf "${archivePath}" -C "${stagingDir}" ${stagedName}`, {
    stdio: 'inherit',
    cwd: rootDir,
  });
  rmSync(stagingDir, { recursive: true, force: true });
}

console.log(`\n✅ Standalone binaries generated in ${distBin}:`);
for (const file of readdirSync(distBin).sort()) {
  const sizeMb = (statSync(resolve(distBin, file)).size / (1024 * 1024)).toFixed(2);
  console.log(`   ${file} (${sizeMb} MB)`);
}
