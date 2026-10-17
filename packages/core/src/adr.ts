import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  AdrMetadata,
  AdrDraft,
  AdrStatus,
  SchemaChange,
} from './model.js';
import { atomicWrite, readIfExists, ensureDir } from './fsx.js';
import { slugify } from './scaffold.js';

export interface ParsedAdr {
  metadata: AdrMetadata;
  content: string;
  context: string;
  decision: string;
  alternatives: Array<{ option: string; whyDiscarded: string }>;
  consequences: string;
  diffText: string;
}

export function getAdrDir(projectPath: string): string {
  return resolve(projectPath, '.schema-memory', 'adr');
}

export function parseFrontmatter(raw: string): {
  frontmatter: Record<string, any>;
  body: string;
} {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: raw };
  }

  const yamlBlock = match[1] || '';
  const body = match[2] || '';
  const frontmatter: Record<string, any> = {};

  for (const line of yamlBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();

    // Parse simple arrays [a, b]
    if (val.startsWith('[') && val.endsWith(']')) {
      const items = val
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
      frontmatter[key] = items;
    } else {
      // Remove surrounding quotes if any
      val = val.replace(/^['"]|['"]$/g, '');
      frontmatter[key] = val;
    }
  }

  return { frontmatter, body };
}

export function stringifyFrontmatter(
  metadata: AdrMetadata
): string {
  const lines: string[] = ['---'];
  lines.push(`id: "${metadata.id}"`);
  lines.push(`title: "${metadata.title.replace(/"/g, '\\"')}"`);
  lines.push(`status: ${metadata.status}`);
  lines.push(`date: ${metadata.date}`);
  lines.push(`affects: [${metadata.affects.map((a) => `"${a}"`).join(', ')}]`);
  if (metadata.supersedes && metadata.supersedes.length > 0) {
    lines.push(
      `supersedes: [${metadata.supersedes.map((s) => `"${s}"`).join(', ')}]`
    );
  }
  lines.push('---');
  return lines.join('\n');
}

export function extractSection(body: string, heading: string): string {
  const regex = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  const match = body.match(regex);
  return match ? match[1]!.trim() : '';
}

export function parseAlternativesFromText(
  text: string
): Array<{ option: string; whyDiscarded: string }> {
  const result: Array<{ option: string; whyDiscarded: string }> = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const match = line.match(/^[-*]\s*\*\*(.*?)\*\*:\s*(.*)$/);
    if (match) {
      result.push({
        option: match[1]!.trim(),
        whyDiscarded: match[2]!.trim(),
      });
    }
  }

  if (result.length === 0 && text.trim()) {
    result.push({
      option: 'General',
      whyDiscarded: text.trim(),
    });
  }

  return result;
}

export function parseAdrFile(content: string): ParsedAdr {
  const { frontmatter, body } = parseFrontmatter(content);
  const metadata = AdrMetadata.parse({
    id: String(frontmatter['id'] || '0000'),
    title: String(frontmatter['title'] || 'Untitled'),
    status: frontmatter['status'] || 'confirmado',
    date: String(frontmatter['date'] || new Date().toISOString().slice(0, 10)),
    affects: Array.isArray(frontmatter['affects'])
      ? frontmatter['affects']
      : [],
    supersedes: Array.isArray(frontmatter['supersedes'])
      ? frontmatter['supersedes']
      : undefined,
  });

  const context = extractSection(body, 'Contexto');
  const decision = extractSection(body, 'Decisión');
  const altText = extractSection(body, 'Alternativas descartadas');
  const consequences = extractSection(body, 'Consecuencias');
  const diffSection = extractSection(body, 'Diff DBML') || extractSection(body, 'Cambio de esquema');

  return {
    metadata,
    content,
    context,
    decision,
    alternatives: parseAlternativesFromText(altText),
    consequences,
    diffText: diffSection,
  };
}

export function renderAdrMarkdown(options: {
  metadata: AdrMetadata;
  draft: AdrDraft;
  diffSummary?: string;
  dbmlDiff?: string;
}): string {
  const header = stringifyFrontmatter(options.metadata);
  const alts = options.draft.alternatives
    .map((a) => `- **${a.option}**: ${a.whyDiscarded}`)
    .join('\n');

  const sections: string[] = [
    header,
    '',
    '## Contexto',
    options.draft.context.trim(),
    '',
    '## Decisión',
    options.draft.decision.trim(),
    '',
    '## Alternativas descartadas',
    alts,
    '',
    '## Consecuencias',
    options.draft.consequences.trim(),
  ];

  if (options.dbmlDiff) {
    sections.push(
      '',
      '## Diff DBML',
      '```diff',
      options.dbmlDiff.trim(),
      '```'
    );
  }

  return sections.join('\n') + '\n';
}

export async function countAdrsStatus(
  projectPath: string
): Promise<{ totalAdrs: number; unconfirmedAdrs: number }> {
  const dir = getAdrDir(projectPath);
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return { totalAdrs: 0, unconfirmedAdrs: 0 };
  }

  const mdFiles = files.filter((f) => f.endsWith('.md'));
  if (mdFiles.length === 0) {
    return { totalAdrs: 0, unconfirmedAdrs: 0 };
  }

  const contents = await Promise.all(
    mdFiles.map((file) => readIfExists(resolve(dir, file)))
  );

  let totalAdrs = 0;
  let unconfirmedAdrs = 0;

  for (const raw of contents) {
    if (!raw) continue;
    totalAdrs += 1;
    const { frontmatter } = parseFrontmatter(raw);
    const status = frontmatter['status'] || 'confirmado';
    if (status !== 'confirmado') {
      unconfirmedAdrs += 1;
    }
  }

  return { totalAdrs, unconfirmedAdrs };
}

export async function listAdrs(
  projectPath: string,
  filter?: {
    table?: string;
    column?: string;
    status?: AdrStatus;
  }
): Promise<ParsedAdr[]> {
  const dir = getAdrDir(projectPath);

  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  const mdFiles = files.filter((f) => f.endsWith('.md')).sort();
  if (mdFiles.length === 0) {
    return [];
  }

  const rawContents = await Promise.all(
    mdFiles.map((file) => readIfExists(resolve(dir, file)))
  );

  const adrs: ParsedAdr[] = [];
  const filterTable = filter?.table?.toLowerCase();
  const filterTarget =
    filterTable && filter?.column
      ? `${filterTable}.${filter.column.toLowerCase()}`
      : undefined;

  for (const raw of rawContents) {
    if (!raw) continue;
    try {
      const parsed = parseAdrFile(raw);

      if (filter?.status && parsed.metadata.status !== filter.status) {
        continue;
      }

      if (filterTable) {
        const hasTable = parsed.metadata.affects.some((a) => {
          const lower = a.toLowerCase();
          return lower === filterTable || lower.startsWith(`${filterTable}.`);
        });
        if (!hasTable) continue;
      }

      if (filterTarget) {
        const hasCol = parsed.metadata.affects.some(
          (a) => a.toLowerCase() === filterTarget
        );
        if (!hasCol) continue;
      }

      adrs.push(parsed);
    } catch {
      // ignore invalid files
    }
  }

  return adrs;
}

export async function readAdr(
  projectPath: string,
  id: string
): Promise<ParsedAdr | null> {
  const dir = getAdrDir(projectPath);
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return null;
  }

  const mdFiles = files.filter((f) => f.endsWith('.md')).sort();
  const directMatch = mdFiles.find(
    (f) => f.startsWith(`${id}-`) || f === `${id}.md`
  );

  if (directMatch) {
    const raw = await readIfExists(resolve(dir, directMatch));
    if (raw) {
      try {
        const parsed = parseAdrFile(raw);
        if (parsed.metadata.id === id) {
          return parsed;
        }
      } catch {
        // fallback below
      }
    }
  }

  const adrs = await listAdrs(projectPath);
  const found = adrs.find((a) => a.metadata.id === id);
  return found || null;
}

export async function nextAdrId(projectPath: string): Promise<string> {
  const dir = getAdrDir(projectPath);
  let files: string[] = [];
  try {
    files = await readdir(dir);
  } catch {
    return '0001';
  }

  let maxId = 0;
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const prefix = file.split('-')[0]?.replace(/\.md$/, '') || '';
    const num = parseInt(prefix, 10);
    if (!isNaN(num) && num > maxId) {
      maxId = num;
    }
  }

  return String(maxId + 1).padStart(4, '0');
}

export async function writeAdr(
  projectPath: string,
  metadata: AdrMetadata,
  markdown: string
): Promise<string> {
  const dir = getAdrDir(projectPath);
  await ensureDir(dir);
  const filename = `${metadata.id}-${slugify(metadata.title)}.md`;
  const filePath = resolve(dir, filename);
  await atomicWrite(filePath, markdown);
  return filePath;
}

export async function promoteAdr(
  projectPath: string,
  id: string,
  edits?: Partial<AdrDraft>
): Promise<ParsedAdr> {
  const existing = await readAdr(projectPath, id);
  if (!existing) {
    throw new Error(`ADR "${id}" not found.`);
  }

  const updatedMetadata: AdrMetadata = {
    ...existing.metadata,
    status: 'confirmado',
    date: new Date().toISOString().slice(0, 10),
  };

  const draft: AdrDraft = {
    title: edits?.title || existing.metadata.title,
    context: edits?.context || existing.context,
    decision: edits?.decision || existing.decision,
    alternatives: edits?.alternatives || existing.alternatives,
    consequences: edits?.consequences || existing.consequences,
  };

  const updatedMarkdown = renderAdrMarkdown({
    metadata: updatedMetadata,
    draft,
    dbmlDiff: existing.diffText,
  });

  await writeAdr(projectPath, updatedMetadata, updatedMarkdown);
  const reloaded = await readAdr(projectPath, id);
  if (!reloaded) throw new Error('Failed to reload promoted ADR.');
  return reloaded;
}
