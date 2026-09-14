import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { Attachment } from './types';

export type { Attachment } from './types';

const DATA_DIR = process.env.QA_AGENT_DATA_DIR ?? path.join(process.cwd(), '.data');
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

export const MAX_FILES_PER_UPLOAD = 30;
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
export const MAX_ATTACHMENTS_PER_MESSAGE = 30;

export async function ensureUploadsDir(): Promise<void> {
  await fsp.mkdir(UPLOADS_DIR, { recursive: true });
}

// Rejects '..'/'.' segments and leading slashes so a crafted filename (or a
// browser-supplied webkitRelativePath for folder uploads) can't escape the
// per-batch upload directory.
export function sanitizeRelativePath(name: string): string | null {
  const normalized = name.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return null;
  if (segments.some((s) => s === '..' || s === '.')) return null;
  return segments.join('/');
}

function isWithinUploadsDir(candidatePath: string): boolean {
  const resolved = path.resolve(candidatePath);
  const root = path.resolve(UPLOADS_DIR) + path.sep;
  return resolved.startsWith(root);
}

// The client only ever gets these {name, path, size} objects back from
// POST /api/upload — but re-validating here means a hand-edited request
// body can't smuggle an arbitrary filesystem path into the prompt sent to
// Claude by claiming it's an "attachment".
export function sanitizeAttachments(raw: unknown): Attachment[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new Error('attachments must be an array.');
  if (raw.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new Error(`Too many attachments (max ${MAX_ATTACHMENTS_PER_MESSAGE}).`);
  }

  return raw.map((item, i) => {
    if (
      typeof item !== 'object' ||
      item === null ||
      typeof (item as Record<string, unknown>).name !== 'string' ||
      typeof (item as Record<string, unknown>).path !== 'string' ||
      typeof (item as Record<string, unknown>).size !== 'number'
    ) {
      throw new Error(`Invalid attachment at index ${i}.`);
    }
    const { name, path: filePath, size } = item as Attachment;
    if (!isWithinUploadsDir(filePath) || !fs.existsSync(filePath)) {
      throw new Error(`Attachment not found: "${name}".`);
    }
    return { name, path: path.resolve(filePath), size };
  });
}

export function buildMessageWithAttachments(message: string, attachments: Attachment[]): string {
  if (attachments.length === 0) return message;
  const list = attachments.map((a) => `- ${a.path}`).join('\n');
  return `${message}\n\n[User attached ${attachments.length} file(s) — read them if relevant to the request]\n${list}`;
}
