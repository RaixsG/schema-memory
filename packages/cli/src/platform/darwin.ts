import { spawn } from 'node:child_process';
import { BasePosixPlatformAdapter } from './base-posix.js';

export class DarwinPlatformAdapter extends BasePosixPlatformAdapter {
  readonly name = 'darwin' as const;

  async openBrowser(url: string): Promise<void> {
    try {
      const child = spawn('open', [url], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
    } catch {
      // browser launch is best-effort
    }
  }

  getPathHint(binDir: string): string {
    return `add "export PATH=\\"${binDir}:$PATH\\"" to ~/.zshrc or ~/.bashrc`;
  }
}
