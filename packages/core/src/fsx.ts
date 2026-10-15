import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function atomicWrite(filePath: string, data: string): Promise<void> {
  await ensureDir(dirname(filePath));
  const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  // Normalize line endings to LF
  const normalized = data.replace(/\r\n/g, '\n');
  await writeFile(tempPath, normalized, 'utf-8');
  await rename(tempPath, filePath);
}

export async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function removeIfExists(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch (error: any) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
}
