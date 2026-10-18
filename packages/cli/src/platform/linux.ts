import { spawn } from 'node:child_process';
import { BasePosixPlatformAdapter } from './base-posix.js';

export class LinuxPlatformAdapter extends BasePosixPlatformAdapter {
  readonly name = 'linux' as const;

  async openBrowser(url: string): Promise<void> {
    try {
      const child = spawn('xdg-open', [url], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    } catch {
      // browser launch is best-effort
    }
  }

  getPathHint(binDir: string): string {
    return `add "export PATH=\\"${binDir}:$PATH\\"" to ~/.bashrc or ~/.profile`;
  }
}
