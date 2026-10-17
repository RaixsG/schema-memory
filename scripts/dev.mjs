import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const isWindows = process.platform === 'win32';
const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

console.log('🚀 Starting schema-memory in development mode...\n');

// 1. Backend API server (127.0.0.1:4317)
const server = spawn('node', ['packages/server/dist/index.js'], {
  cwd: rootDir,
  stdio: 'inherit',
});

// 2. Frontend Vite dev server (localhost:5173)
const web = spawn('pnpm', ['--filter', '@schema-memory/web', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: isWindows,
});

function killProcess(child) {
  if (!child || child.killed) return;
  if (isWindows) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
    });
  } else {
    child.kill('SIGINT');
  }
}

function cleanup() {
  console.log('\nStopping servers...');
  killProcess(server);
  killProcess(web);
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
