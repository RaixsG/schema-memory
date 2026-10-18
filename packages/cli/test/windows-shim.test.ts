import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateWindowsShimContent,
  createWindowsShim,
  isCorruptedShimContent,
} from '../src/windows-shim.js';
import { runDoctorChecks } from '../src/commands/doctor.js';

describe('Windows Cross-Drive Shim Generator', () => {
  it('generates absolute target paths when source and destination are on different Windows drives', () => {
    const from = 'E:\\dev\\projects\\systems-me\\schema-memory\\packages\\cli\\dist\\index.js';
    const to = 'C:\\Users\\jhard\\.local\\bin\\sm';

    const result = generateWindowsShimContent(from, to);

    expect(result.isCrossDrive).toBe(true);
    expect(result.targetCmd).toBe(from);
    expect(result.targetPs1).toBe('E:/dev/projects/systems-me/schema-memory/packages/cli/dist/index.js');
    expect(result.targetSh).toBe('E:/dev/projects/systems-me/schema-memory/packages/cli/dist/index.js');

    // CMD script must call the absolute path and NOT prepend %~dp0 or %dp0%
    expect(result.cmd).toContain(`"node" "${from}" %*`);
    expect(result.cmd).not.toContain('%~dp0\\E:');
    expect(result.cmd).not.toContain('%dp0%\\E:');

    // PowerShell script must reference the normalized absolute path
    expect(result.ps1).toContain(
      '$target="E:/dev/projects/systems-me/schema-memory/packages/cli/dist/index.js"'
    );
    expect(result.ps1).not.toContain('$basedir/E:');

    // Shell script must reference the normalized absolute path
    expect(result.sh).toContain(
      'exec node "E:/dev/projects/systems-me/schema-memory/packages/cli/dist/index.js" "$@"'
    );
    expect(result.sh).not.toContain('$basedir/E:');
  });

  it('generates relative target paths when source and destination are on the same drive', () => {
    const from = 'C:\\dev\\projects\\schema-memory\\packages\\cli\\dist\\index.js';
    const to = 'C:\\Users\\jhard\\.local\\bin\\sm';

    const result = generateWindowsShimContent(from, to);

    expect(result.isCrossDrive).toBe(false);
    expect(result.cmd).toContain('%~dp0\\');
    expect(result.ps1).toContain('$basedir/');
    expect(result.sh).toContain('$basedir/');
  });

  describe('isCorruptedShimContent', () => {
    it('detects corrupted cmd-shim output with drive letter appended to base directory', () => {
      const corruptedCmd1 =
        'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "node" "%dp0%\\E:\\dev\\projects\\packages\\cli\\dist\\index.js" %*';
      const corruptedCmd2 =
        'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "node" "%~dp0\\E:\\dev\\projects\\packages\\cli\\dist\\index.js" %*';
      const corruptedPs1 =
        '& "node$exe" "$basedir/E:/dev/projects/packages/cli/dist/index.js" $args';
      const corruptedSh =
        'exec node "$basedir/E:/dev/projects/packages/cli/dist/index.js" "$@"';

      expect(isCorruptedShimContent(corruptedCmd1)).toBe(true);
      expect(isCorruptedShimContent(corruptedCmd2)).toBe(true);
      expect(isCorruptedShimContent(corruptedPs1)).toBe(true);
      expect(isCorruptedShimContent(corruptedSh)).toBe(true);
    });

    it('returns false for clean cross-drive and relative shims', () => {
      const cleanCrossDrive =
        'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "node" "E:\\dev\\projects\\packages\\cli\\dist\\index.js" %*';
      const cleanRelative =
        'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "node" "%~dp0\\..\\..\\dist\\index.js" %*';

      expect(isCorruptedShimContent(cleanCrossDrive)).toBe(false);
      expect(isCorruptedShimContent(cleanRelative)).toBe(false);
    });
  });

  it('writes .cmd, .ps1, and extensionless sh shims to disk', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'sm-win-shim-test-'));
    try {
      const from = 'E:\\dev\\projects\\packages\\cli\\dist\\index.js';
      const to = join(tempDir, 'sm');

      await createWindowsShim(from, to);

      const cmd = await readFile(`${to}.cmd`, 'utf-8');
      const ps1 = await readFile(`${to}.ps1`, 'utf-8');
      const sh = await readFile(to, 'utf-8');

      expect(cmd).toContain('"node" "E:\\dev\\projects\\packages\\cli\\dist\\index.js" %*');
      expect(ps1).toContain('$target="E:/dev/projects/packages/cli/dist/index.js"');
      expect(sh).toContain('exec node "E:/dev/projects/packages/cli/dist/index.js" "$@"');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('doctor flags corrupted cross-drive shims in ~/.local/bin', async () => {
    const tempHome = await mkdtemp(join(tmpdir(), 'sm-doctor-shim-test-'));
    try {
      const localBin = join(tempHome, '.local', 'bin');
      const { mkdir } = await import('node:fs/promises');
      await mkdir(localBin, { recursive: true });

      // Write a corrupted shim in ~/.local/bin/sm.cmd
      const corruptedCmd =
        'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "node" "%dp0%\\E:\\dev\\projects\\dist\\index.js" %*';
      await writeFile(join(localBin, 'sm.cmd'), corruptedCmd, 'utf-8');

      const checks = await runDoctorChecks({
        homeDir: tempHome,
        cliDistPath: process.argv[1],
      });

      const cliCheck = checks.find((c) => c.name === 'Global CLI (sm)');
      expect(cliCheck).toBeDefined();
      expect(cliCheck?.ok).toBe(false);
      expect(cliCheck?.detail).toContain('Corrupted cross-drive shim detected');
      expect(cliCheck?.detail).toContain('sm setup --cli-only');
    } finally {
      await rm(tempHome, { recursive: true, force: true });
    }
  });
});
