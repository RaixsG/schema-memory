import { resolve } from 'node:path';
import {
  getRegistryDir,
  readIfExists,
  atomicWrite,
  ensureDir,
} from '@schema-memory/core';

import type { SetupProfile, SetupTarget } from './commands/setup-config.js';

export interface SetupState {
  lastOfferedAt?: string;
  globalInstallDeclined?: boolean;
  completedAt?: string;
  interrupted?: boolean;
  lastInstalledMethod?: string;
  targets?: SetupTarget[];
  profile?: SetupProfile;
}

export function getSetupStatePath(registryDir = getRegistryDir()): string {
  return resolve(registryDir, 'setup.json');
}

export async function readSetupState(registryDir = getRegistryDir()): Promise<SetupState> {
  const file = getSetupStatePath(registryDir);
  const raw = await readIfExists(file);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function writeSetupState(
  patch: Partial<SetupState>,
  registryDir = getRegistryDir()
): Promise<SetupState> {
  const current = await readSetupState(registryDir);
  const next: SetupState = { ...current, ...patch };
  await ensureDir(registryDir);
  await atomicWrite(getSetupStatePath(registryDir), JSON.stringify(next, null, 2) + '\n');
  return next;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function shouldOfferPrompt(state: SetupState, now = Date.now()): boolean {
  if (state.completedAt && !state.interrupted) return false;
  if (!state.lastOfferedAt) return true;
  const lastTime = new Date(state.lastOfferedAt).getTime();
  if (isNaN(lastTime)) return true;
  return now - lastTime > ONE_DAY_MS;
}
