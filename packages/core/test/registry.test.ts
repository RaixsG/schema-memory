import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { isPathInside, normalizePathKey } from '../src/index.js';

describe('Registry path resolution (cross-platform)', () => {
  it('detects nesting and parent traversal on the current platform', () => {
    const sep = process.platform === 'win32' ? '\\' : '/';
    const base = process.platform === 'win32' ? 'C:\\dev\\app' : '/dev/app';

    expect(isPathInside(base, base)).toBe(true);
    expect(isPathInside(base, `${base}${sep}src`)).toBe(true);
    expect(isPathInside(base, resolve(base, '..'))).toBe(false);
    expect(isPathInside(base, resolve(base, '..', 'other'))).toBe(false);
  });

  it.runIf(process.platform === 'win32')(
    'never matches paths on other Windows drives',
    () => {
      // Reproduced bug: `path.relative('E:\\dev\\app', 'C:\\Windows')` returns
      // an absolute path, which the old code treated as "inside cwd".
      expect(isPathInside('E:\\dev\\app', 'C:\\Windows')).toBe(false);
      expect(isPathInside('C:\\Windows', 'E:\\dev\\app')).toBe(false);
      expect(isPathInside('E:\\dev', 'E:\\dev\\app')).toBe(true);
      expect(isPathInside('C:\\Users\\ana', 'C:\\Users\\ana2')).toBe(false);
    }
  );

  it.runIf(process.platform === 'win32')('normalizes case on Windows', () => {
    expect(normalizePathKey('C:\\Dev\\App')).toBe(normalizePathKey('c:\\dev\\app'));
  });

  it.runIf(process.platform !== 'win32')('keeps case sensitivity on POSIX', () => {
    expect(normalizePathKey('/Dev/App')).toBe('/Dev/App');
    expect(isPathInside('/dev/app', '/dev/app/src')).toBe(true);
    expect(isPathInside('/dev/app', '/dev/app-other')).toBe(false);
  });
});
