import { createHash } from 'node:crypto';

export function normalizeDbml(src: string): string {
  return src
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}

export function hashDbml(src: string): string {
  const normalized = normalizeDbml(src);
  return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}
