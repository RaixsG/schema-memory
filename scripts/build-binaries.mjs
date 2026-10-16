import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const cliDist = resolve(rootDir, 'packages/cli/dist/index.js');
const pkg = JSON.parse(readFileSync(resolve(rootDir, 'packages/cli/package.json'), 'utf8'));
const version = pkg.version;
const distBin = resolve(rootDir, 'dist-bin');

if (!existsSync(cliDist)) {
  console.error('❌ packages/cli/dist/index.js not found. Run "pnpm bundle:cli" first.');
  process.exit(1);
}

if (existsSync(distBin)) {
  rmSync(distBin, { recursive: true, force: true });
}
mkdirSync(distBin, { recursive: true });

const targets = [
  { target: 'bun-darwin-arm64', os: 'darwin', arch: 'arm64' },
  { target: 'bun-darwin-x64', os: 'darwin', arch: 'x64' },
  { target: 'bun-linux-x64', os: 'linux', arch: 'x64' },
];

console.log(`📦 Building standalone binaries for schema-memory v${version}...`);

for (const t of targets) {
  const binaryName = `sm-${t.os}-${t.arch}`;
  const binaryPath = resolve(distBin, binaryName);
  const archiveName = `schema-memory-v${version}-${t.os}-${t.arch}.tar.gz`;
  const archivePath = resolve(distBin, archiveName);

  console.log(`🔨 Compiling ${t.target} -> ${binaryName}...`);
  execSync(`bun build ${cliDist} --compile --target=${t.target} --outfile=${binaryPath}`, {
    stdio: 'inherit',
    cwd: rootDir,
  });

  console.log(`📦 Archiving ${archiveName}...`);
  // Tar the binary renamed as 'sm' inside the tarball for easy extraction
  execSync(`tar -czf ${archivePath} -C ${distBin} --transform "s/${binaryName}/sm/" ${binaryName} 2>/dev/null || tar -czf ${archivePath} -C ${distBin} ${binaryName}`, {
    stdio: 'inherit',
    cwd: rootDir,
  });
}

console.log(`\n✅ Standalone binaries generated in ${distBin}:`);
execSync(`ls -lh ${distBin}`, { stdio: 'inherit' });
