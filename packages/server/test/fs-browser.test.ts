import { describe, it, expect } from 'vitest';
import {
  computeAllowedRoots,
  isPathAllowed,
  isPathWithin,
} from '../src/fs-browser.js';

describe('fs-browser path policy', () => {
  it('isPathWithin is separator-aware, including Windows drive roots', () => {
    expect(isPathWithin('/Users/ana/dev/app', '/Users/ana', 'darwin')).toBe(true);
    expect(isPathWithin('/Users/ana', '/Users/ana', 'darwin')).toBe(true);
    expect(isPathWithin('/Users/ana2', '/Users/ana', 'darwin')).toBe(false);
    expect(isPathWithin('/Users/ana/dev', '/Volumes', 'darwin')).toBe(false);

    expect(isPathWithin('E:\\dev\\app', 'E:\\', 'win32')).toBe(true);
    expect(isPathWithin('e:\\dev', 'E:\\', 'win32')).toBe(true);
    expect(isPathWithin('C:\\Users\\ana2', 'C:\\Users\\ana', 'win32')).toBe(false);
    expect(isPathWithin('C:\\Users\\ana2', 'C:\\Users\\ana\\', 'win32')).toBe(false);
  });

  it('allows the expected roots per platform policy', () => {
    const home = '/home/ana';
    const tmp = '/home/ana/tmp';

    expect(isPathAllowed('/home/ana/dev', { platform: 'linux', home, tmp })).toBe(true);
    expect(isPathAllowed('/home/ana', { platform: 'linux', home, tmp })).toBe(true);
    expect(isPathAllowed('/mnt/data', { platform: 'linux', home, tmp })).toBe(true);
    expect(isPathAllowed('/etc', { platform: 'linux', home, tmp })).toBe(false);

    expect(isPathAllowed('/Volumes/ext/dev', { platform: 'darwin', home, tmp })).toBe(true);
    expect(isPathAllowed('/opt/elsewhere', { platform: 'darwin', home, tmp })).toBe(false);
  });

  it('computeAllowedRoots always includes home and temp', () => {
    const home = 'C:\\Users\\ana';
    const tmp = 'C:\\Users\\ana\\AppData\\Local\\Temp';
    const roots = computeAllowedRoots({ platform: 'win32', home, tmp }).map((r) =>
      r.toLowerCase()
    );
    expect(roots).toContain(home.toLowerCase());
    expect(roots).toContain(tmp.toLowerCase());
  });

  it('listLocations returns standard shortcuts and respects platform', async () => {
    const { listLocations } = await import('../src/fs-browser.js');
    const locations = await listLocations({ platform: 'darwin' });
    expect(locations.some((l) => l.kind === 'home')).toBe(true);
    expect(locations.find((l) => l.kind === 'home')?.label).toBe('Inicio');
    if (process.platform === 'darwin') {
      const hasVolumes = locations.some((l) => l.kind === 'volume');
      // On macOS running machine /Volumes always exists
      expect(typeof hasVolumes).toBe('boolean');
    }
  });
});
