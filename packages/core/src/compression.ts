import { gzipSync, gunzipSync, constants } from 'node:zlib';

export interface GzipOptions {
  level?: number;
  thresholdBytes?: number;
}

export const DEFAULT_GZIP_THRESHOLD = 1024;

export function gzipBuffer(
  input: string | Buffer | Uint8Array,
  options: GzipOptions = {}
): Buffer {
  const buf =
    typeof input === 'string'
      ? Buffer.from(input, 'utf-8')
      : Buffer.from(input);
  const level = options.level ?? constants.Z_BEST_SPEED;
  return gzipSync(buf, { level });
}

export function gunzipBuffer(input: Buffer | Uint8Array): Buffer {
  return gunzipSync(input);
}

export function gunzipToString(input: Buffer | Uint8Array): string {
  return gunzipSync(input).toString('utf-8');
}

export function isGzipPayload(input: Buffer | Uint8Array): boolean {
  return input.length >= 2 && input[0] === 0x1f && input[1] === 0x8b;
}
