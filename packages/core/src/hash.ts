import { createHash } from 'node:crypto';
import { stat, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export function normalizeDbml(src: string): string {
  return src
    .replace(/[ \t]+\r?\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .trim();
}

export function hashDbml(src: string): string {
  const normalized = normalizeDbml(src);
  return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

export async function computeProjectFingerprint(projectPath: string): Promise<string> {
  const schemaMemoryDir = resolve(projectPath, '.schema-memory');
  const schemaPath = resolve(schemaMemoryDir, 'schema.dbml');
  const changePath = resolve(schemaMemoryDir, 'pending', 'change.json');
  const draftPath = resolve(schemaMemoryDir, 'pending', 'adr-draft.json');
  const adrDir = resolve(schemaMemoryDir, 'adr');

  const getMeta = async (p: string) => {
    try {
      const s = await stat(p);
      return `${s.mtimeMs}:${s.size}`;
    } catch {
      return 'none';
    }
  };

  const getAdrMeta = async () => {
    try {
      const [s, files] = await Promise.all([
        stat(adrDir),
        readdir(adrDir).catch(() => [] as string[]),
      ]);
      return `${s.mtimeMs}:${files.length}`;
    } catch {
      return 'none';
    }
  };

  const [schemaMeta, changeMeta, draftMeta, adrMeta] = await Promise.all([
    getMeta(schemaPath),
    getMeta(changePath),
    getMeta(draftPath),
    getAdrMeta(),
  ]);

  const raw = `${schemaMeta}|${changeMeta}|${draftMeta}|${adrMeta}`;
  return createHash('sha1').update(raw).digest('hex');
}

