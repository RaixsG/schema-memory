export type EphemeralRunner = 'npx' | 'bunx' | 'pnpm-dlx';

export interface LinkCliResult {
  binDir: string;
  linked: boolean;
  detail: string;
}

export interface CliHealthResult {
  ok: boolean;
  detail: string;
}

export interface PlatformAdapter {
  readonly name: 'windows' | 'darwin' | 'linux';
  readonly isWindows: boolean;

  /** Resolves the default user bin directory (~/.local/bin or %USERPROFILE%\.local\bin) */
  getBinDir(): string;

  /** Checks if a directory is present in the current PATH environment variable */
  isDirOnPath(dir: string): boolean;

  /** Finds an executable on PATH (using 'where' on Windows or 'which' on POSIX) */
  findCommandOnPath(name: string): string | null;

  /** Normalizes directory paths for safe comparison (case-insensitive on Windows) */
  normalizeDirForCompare(dir: string): string;

  /** Returns true if targetPath is dir itself or located inside dir */
  isWithinDir(targetPath: string, dir: string): boolean;

  /** Creates global CLI links/shims in binDir */
  linkCli(
    cliDistPath: string,
    binDir: string,
    options?: { force?: boolean }
  ): Promise<LinkCliResult>;

  /** Cleans up global CLI links/shims in binDir */
  cleanCli(binDir: string): Promise<void>;

  /** Checks health of CLI installation, returning diagnosis and actionable fix */
  checkCliHealth(binDir: string, onPath: string | null): Promise<CliHealthResult>;

  /** Safely terminates a daemon process (taskkill on Windows, SIGTERM on POSIX) */
  stopProcess(pid: number): Promise<boolean>;

  /** Opens a URL in the user's default browser */
  openBrowser(url: string): Promise<void>;

  /** Generates human-friendly guidance to add binDir to PATH */
  getPathHint(binDir: string): string;

  /** Identifies if CLI was run via npx / bunx / pnpm-dlx */
  detectEphemeralRunner(cliPath: string): EphemeralRunner | null;
}
