#!/usr/bin/env node

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

function execGit(cmd) {
  try {
    return execSync(cmd, { cwd: rootDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : err.message;
    throw new Error(`Git command failed: ${cmd}\n${stderr}`);
  }
}

function runInherited(cmd) {
  execSync(cmd, { cwd: rootDir, stdio: 'inherit' });
}

function parseSemver(str) {
  const match = str.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
  };
}

function calculateNextVersion(currentVersionStr, target) {
  const current = parseSemver(currentVersionStr);
  if (!current) {
    throw new Error(`Invalid current version in root package.json: "${currentVersionStr}"`);
  }

  const normalized = (target || '').toLowerCase().trim();
  if (normalized === 'patch') {
    return `${current.major}.${current.minor}.${current.patch + 1}`;
  }
  if (normalized === 'minor') {
    return `${current.major}.${current.minor + 1}.0`;
  }
  if (normalized === 'major') {
    return `${current.major + 1}.0.0`;
  }

  const explicit = parseSemver(target);
  if (explicit) {
    return target.replace(/^v/, '');
  }

  throw new Error(`Invalid target or bump type: "${target}". Expected "patch", "minor", "major", or semver (e.g. 0.1.3).`);
}

function discoverPackageJsonFiles() {
  const files = [resolve(rootDir, 'package.json')];

  const searchDirs = ['packages', 'apps'];
  for (const dirName of searchDirs) {
    const fullDir = resolve(rootDir, dirName);
    if (!existsSync(fullDir)) continue;

    const entries = readdirSync(fullDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgPath = resolve(fullDir, entry.name, 'package.json');
      if (existsSync(pkgPath)) {
        files.push(pkgPath);
      }
    }
  }

  return files;
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const showHelp = rawArgs.includes('--help') || rawArgs.includes('-h');
  const dryRun = rawArgs.includes('--dry-run');
  const noPush = rawArgs.includes('--no-push');
  const yes = rawArgs.includes('-y') || rawArgs.includes('--yes');
  const allowBranch = rawArgs.includes('--allow-branch');

  if (showHelp) {
    console.log(`
Usage: node scripts/release.mjs [target] [options]
       pnpm release [target] [options]

Target:
  patch                  Bump patch version (e.g. 0.1.2 -> 0.1.3) [default]
  minor                  Bump minor version (e.g. 0.1.2 -> 0.2.0)
  major                  Bump major version (e.g. 0.1.2 -> 1.0.0)
  <version>              Explicit semver (e.g. 0.1.3 or v0.1.3)

Options:
  --dry-run              Simulate version bump and git operations without modifying files
  --no-push              Commit and create tag locally, but skip pushing to remote
  -y, --yes              Skip interactive confirmation prompts
  --allow-branch         Allow release execution on branches other than main
  -h, --help             Show this help message
`);
    process.exit(0);
  }

  const positionalArgs = rawArgs.filter(
    (arg) => !arg.startsWith('--') && !arg.startsWith('-')
  );

  console.log('🔍 Checking git repository status...');

  // 1. Verify inside git repo
  try {
    execGit('git rev-parse --is-inside-work-tree');
  } catch {
    console.error('❌ Not inside a git repository.');
    process.exit(1);
  }

  // 2. Check current branch
  const currentBranch = execGit('git branch --show-current');
  if (currentBranch !== 'main' && !allowBranch) {
    console.error(
      `❌ Current branch is "${currentBranch}". Releases must be performed on "main".\n` +
      `   Switch to main or pass --allow-branch to bypass this check.`
    );
    process.exit(1);
  }

  // 3. Check clean working directory
  const statusOutput = execGit('git status --porcelain');
  if (statusOutput.length > 0) {
    if (dryRun) {
      console.warn('⚠️  Working directory is dirty (proceeding because --dry-run is active).');
    } else {
      console.error('❌ Working directory is dirty. Please commit or stash changes before releasing:');
      console.error(statusOutput);
      process.exit(1);
    }
  }

  // 4. Read root package.json
  const rootPkgPath = resolve(rootDir, 'package.json');
  const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
  const currentVersion = rootPkg.version;

  // 5. Determine target version
  let targetArg = positionalArgs[0];

  if (!targetArg) {
    if (yes || !process.stdin.isTTY) {
      targetArg = 'patch';
    } else {
      const rl = createInterface({ input, output });
      try {
        console.log(`\nCurrent version: \x1b[36mv${currentVersion}\x1b[0m`);
        console.log(`  1) patch -> v${calculateNextVersion(currentVersion, 'patch')}`);
        console.log(`  2) minor -> v${calculateNextVersion(currentVersion, 'minor')}`);
        console.log(`  3) major -> v${calculateNextVersion(currentVersion, 'major')}`);
        console.log(`  4) custom version`);
        const answer = await rl.question('\nSelect bump type [1]: ');
        const trimmed = answer.trim();

        if (trimmed === '1' || trimmed === '') {
          targetArg = 'patch';
        } else if (trimmed === '2') {
          targetArg = 'minor';
        } else if (trimmed === '3') {
          targetArg = 'major';
        } else if (trimmed === '4') {
          const custom = await rl.question('Enter custom version: ');
          targetArg = custom.trim();
        } else {
          targetArg = trimmed;
        }
      } finally {
        rl.close();
      }
    }
  }

  const nextVersion = calculateNextVersion(currentVersion, targetArg);
  const nextTag = `v${nextVersion}`;

  console.log(`\n📦 Target release: \x1b[32m${nextTag}\x1b[0m (current: \x1b[33mv${currentVersion}\x1b[0m)`);

  // 6. Check tag does not already exist
  const existingLocalTag = execGit(`git tag -l "${nextTag}"`);
  if (existingLocalTag) {
    console.error(`❌ Local tag "${nextTag}" already exists.`);
    process.exit(1);
  }

  if (!dryRun) {
    try {
      const remoteTags = execGit(`git ls-remote --tags origin "refs/tags/${nextTag}"`);
      if (remoteTags.includes(nextTag)) {
        console.error(`❌ Remote tag "${nextTag}" already exists on origin.`);
        process.exit(1);
      }
    } catch {
      // Remote might be offline or no credentials in sandbox; proceed with local tag check
    }
  }

  // 7. Find all package.json files
  const packageFiles = discoverPackageJsonFiles();
  console.log(`\n📝 Discovered ${packageFiles.length} packages:`);
  for (const file of packageFiles) {
    const rel = relative(rootDir, file);
    console.log(`   - ${rel}`);
  }

  // 8. Confirm action
  if (!yes && !dryRun && process.stdin.isTTY) {
    const rl = createInterface({ input, output });
    try {
      const pushNote = noPush ? 'will NOT push' : `will push commit and tag to origin/${currentBranch}`;
      const answer = await rl.question(`\nBump all packages to ${nextTag}, commit, tag, and ${pushNote}? (y/N) `);
      if (answer.trim().toLowerCase() !== 'y' && answer.trim().toLowerCase() !== 'yes') {
        console.log('Aborted.');
        process.exit(0);
      }
    } finally {
      rl.close();
    }
  }

  // 9. Update package.json files
  console.log('\n⚙️  Updating package versions...');
  for (const file of packageFiles) {
    const rel = relative(rootDir, file);
    const content = JSON.parse(readFileSync(file, 'utf8'));
    const oldVersion = content.version;
    content.version = nextVersion;

    if (dryRun) {
      console.log(`   [dry-run] ${rel}: v${oldVersion} -> v${nextVersion}`);
    } else {
      writeFileSync(file, JSON.stringify(content, null, 2) + '\n', 'utf8');
      console.log(`   ✔ ${rel}: v${oldVersion} -> v${nextVersion}`);
    }
  }

  // 10. Git commit & tag
  const relPaths = packageFiles.map((f) => relative(rootDir, f));
  const commitMsg = `chore(release): ${nextTag}`;

  if (dryRun) {
    console.log('\n dry-run actions:');
    console.log(`   git add ${relPaths.join(' ')}`);
    console.log(`   git commit -m "${commitMsg}"`);
    console.log(`   git tag -a "${nextTag}" -m "${commitMsg}"`);
    if (!noPush) {
      console.log(`   git push origin ${currentBranch}`);
      console.log(`   git push origin "${nextTag}"`);
    }
    console.log('\n✨ Dry run finished successfully. No changes applied.');
    return;
  }

  console.log('\n💾 Creating release commit and tag...');
  const addCmd = `git add ${relPaths.map((p) => `"${p}"`).join(' ')}`;
  execGit(addCmd);
  execGit(`git commit -m "${commitMsg}"`);
  execGit(`git tag -a "${nextTag}" -m "${commitMsg}"`);
  console.log(`   ✔ Commit created: "${commitMsg}"`);
  console.log(`   ✔ Tag created: ${nextTag}`);

  // 11. Git push
  if (noPush) {
    console.log('\n⏩ Skipping push (--no-push passed).');
    console.log(`   To push manually, run:\n     git push origin ${currentBranch}\n     git push origin ${nextTag}`);
  } else {
    console.log(`\n🚀 Pushing to origin/${currentBranch}...`);
    runInherited(`git push origin ${currentBranch}`);
    runInherited(`git push origin "${nextTag}"`);
    console.log(`   ✔ Successfully pushed branch and ${nextTag} tag to origin.`);
  }

  console.log(`\n🎉 Release ${nextTag} completed successfully!`);
}

main().catch((err) => {
  console.error('\n❌ Release failed:', err.message);
  process.exit(1);
});
