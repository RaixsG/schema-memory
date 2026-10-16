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

export async function computeProjectFingerprint(projectPath: string): Promise<string> {
  const { stat, readdir } = await import('node:fs/promises');
  const { resolve } = await import('node:path');

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
      const s = await stat(adrDir);
      const files = await readdir(adrDir).catch(() => []);
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

