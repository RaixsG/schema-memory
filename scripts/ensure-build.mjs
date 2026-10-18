import { statSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const cliDist = resolve(rootDir, 'packages', 'cli', 'dist', 'index.js');

function getLatestMtime(dirPath) {
  if (!existsSync(dirPath)) return 0;
  let maxTime = 0;
  const entries = readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') {
        continue;
      }
      const subTime = getLatestMtime(fullPath);
      if (subTime > maxTime) maxTime = subTime;
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') || entry.name === 'package.json') {
        try {
          const stat = statSync(fullPath);
          if (stat.mtimeMs > maxTime) maxTime = stat.mtimeMs;
        } catch {
          // ignore transient stat errors
        }
      }
    }
  }

  return maxTime;
}

function checkBuildNeeded() {
  if (!existsSync(cliDist)) return true;

  let distMtime = 0;
  try {
    distMtime = statSync(cliDist).mtimeMs;
  } catch {
    return true;
  }

  const checkDirs = [
    resolve(rootDir, 'packages', 'cli', 'src'),
    resolve(rootDir, 'packages', 'core', 'src'),
    resolve(rootDir, 'packages', 'server', 'src'),
    resolve(rootDir, 'packages', 'mcp', 'src'),
  ];

  for (const dir of checkDirs) {
    const srcMtime = getLatestMtime(dir);
    if (srcMtime > distMtime) return true;
  }

  // Also check package.json files
  const pkgFiles = [
    resolve(rootDir, 'package.json'),
    resolve(rootDir, 'packages', 'cli', 'package.json'),
    resolve(rootDir, 'packages', 'core', 'package.json'),
  ];
  for (const pkg of pkgFiles) {
    try {
      if (existsSync(pkg) && statSync(pkg).mtimeMs > distMtime) return true;
    } catch {
      // ignore
    }
  }

  return false;
}

if (checkBuildNeeded()) {
  console.log('⚡ Detected source changes or missing build. Recompiling packages...');
  try {
    execSync('pnpm build', {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env,
    });
    console.log('✅ Build up-to-date.\n');
  } catch (err) {
    console.error('❌ Automatic build failed:', err.message);
    process.exit(1);
  }
}
