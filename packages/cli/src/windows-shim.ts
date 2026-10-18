import { dirname, win32 } from 'node:path';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';

export interface WindowsShimContents {
  cmd: string;
  ps1: string;
  sh: string;
  targetCmd: string;
  targetPs1: string;
  targetSh: string;
  isCrossDrive: boolean;
}

/**
 * Computes the exact script contents for Windows shims (.cmd, .ps1, and sh).
 * When `from` and `to` are on different drive letters (e.g. C: and E:),
 * absolute paths are used instead of `%~dp0` to avoid invalid concatenation like `%~dp0\E:\...`.
 */
export function generateWindowsShimContent(
  from: string,
  to: string
): WindowsShimContents {
  const targetDir = win32.dirname(to);

  const fromMatch = from.match(/^([a-zA-Z]:)/);
  const toMatch = to.match(/^([a-zA-Z]:)/);
  const fromDrive = fromMatch ? fromMatch[1].toLowerCase() : null;
  const toDrive = toMatch ? toMatch[1].toLowerCase() : null;

  const isCrossDrive =
    (fromDrive !== null && toDrive !== null && fromDrive !== toDrive) ||
    (fromDrive !== null && toDrive === null) ||
    (fromDrive === null && toDrive !== null);

  let targetCmd: string;
  let targetPs1: string;
  let targetSh: string;

  if (isCrossDrive) {
    targetCmd = from.replace(/\//g, '\\');
    targetPs1 = from.replace(/\\/g, '/');
    targetSh = from.replace(/\\/g, '/');
  } else {
    const rel = win32.relative(targetDir, from);
    targetCmd = `%~dp0\\${rel.replace(/\//g, '\\')}`;
    targetPs1 = `$basedir/${rel.replace(/\\/g, '/')}`;
    targetSh = `$basedir/${rel.replace(/\\/g, '/')}`;
  }

  // 1. Windows Command Prompt Batch Script (.cmd)
  const cmd = [
    '@ECHO off',
    'GOTO start',
    ':find_dp0',
    'SET dp0=%~dp0',
    'EXIT /b',
    ':start',
    'SETLOCAL',
    'CALL :find_dp0',
    `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "node" "${targetCmd}" %*`,
    '',
  ].join('\r\n');

  // 2. PowerShell Script (.ps1)
  const ps1 = [
    '#!/usr/bin/env pwsh',
    '$basedir=Split-Path $MyInvocation.MyCommand.Definition -Parent',
    '',
    '$exe=""',
    'if ($PSVersionTable.PSVersion -lt "6.0" -or $IsWindows) {',
    '  $exe=".exe"',
    '}',
    `$target="${targetPs1}"`,
    'if ($MyInvocation.ExpectingInput) {',
    '  $input | & "node$exe" "$target" $args',
    '} else {',
    '  & "node$exe" "$target" $args',
    '}',
    'exit $LASTEXITCODE',
    '',
  ].join('\n');

  // 3. Shell script for Git Bash / MSYS / Cygwin
  const sh = [
    '#!/bin/sh',
    `basedir=$(dirname "$(echo "$0" | sed -e 's,\\\\,/,g')")`,
    '',
    'case `uname` in',
    '    *CYGWIN*|*MINGW*|*MSYS*)',
    '        if command -v cygpath > /dev/null 2>&1; then',
    '            basedir=`cygpath -w "$basedir"`',
    '        fi',
    '    ;;',
    'esac',
    '',
    `exec node "${targetSh}" "$@"`,
    '',
  ].join('\n');

  return { cmd, ps1, sh, targetCmd, targetPs1, targetSh, isCrossDrive };
}

/**
 * Creates cross-platform executable shims (.cmd, .ps1, and sh) for Windows in `to`.
 */
export async function createWindowsShim(
  from: string,
  to: string
): Promise<void> {
  const targetDir = dirname(to);
  await mkdir(targetDir, { recursive: true });

  const { cmd, ps1, sh } = generateWindowsShimContent(from, to);

  await rm(to, { force: true });
  await rm(`${to}.cmd`, { force: true });
  await rm(`${to}.ps1`, { force: true });

  await Promise.all([
    writeFile(`${to}.cmd`, cmd, 'utf-8'),
    writeFile(`${to}.ps1`, ps1, 'utf-8'),
    writeFile(to, sh, 'utf-8'),
  ]);

  await Promise.all([
    chmod(`${to}.cmd`, 0o755).catch(() => {}),
    chmod(`${to}.ps1`, 0o755).catch(() => {}),
    chmod(to, 0o755).catch(() => {}),
  ]);
}

/**
 * Detects whether a shim file contains a broken cross-drive concatenation
 * (such as `%~dp0\E:\...`, `%dp0%\E:\...`, or `$basedir/E:/...`).
 */
export function isCorruptedShimContent(content: string): boolean {
  return (
    /%(?:~dp0|dp0%)[\\/]+[a-zA-Z]:/i.test(content) ||
    /\$basedir[\\/]+[a-zA-Z]:/i.test(content)
  );
}

