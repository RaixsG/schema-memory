import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

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
});

function cleanup() {
  console.log('\nStopping servers...');
  server.kill('SIGINT');
  web.kill('SIGINT');
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
