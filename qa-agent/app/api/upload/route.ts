import { NextRequest } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { UPLOADS_DIR, MAX_FILES_PER_UPLOAD, MAX_FILE_SIZE, ensureUploadsDir, sanitizeRelativePath } from '@/lib/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

function isLocalRequest(request: NextRequest): boolean {
  const host = request.headers.get('host');
  if (!host) return false;
  try {
    return ALLOWED_HOSTNAMES.has(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!isLocalRequest(request)) return new Response('Forbidden', { status: 403 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response('Invalid form data', { status: 400 });
  }

  const files = formData.getAll('files').filter((f): f is File => f instanceof File);
  if (files.length === 0) return new Response('No files provided.', { status: 400 });
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return new Response(`Too many files (max ${MAX_FILES_PER_UPLOAD}).`, { status: 400 });
  }
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      return new Response(`"${file.name}" exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB limit.`, { status: 400 });
    }
  }

  await ensureUploadsDir();

  // One fresh directory per upload batch — keeps concurrent selections from
  // colliding and gives each batch a stable, checkable root for path
  // traversal validation below.
  const batchId = crypto.randomUUID();
  const batchDir = path.join(UPLOADS_DIR, batchId);
  await fs.mkdir(batchDir, { recursive: true });

  const results: { name: string; path: string; size: number }[] = [];

  for (const file of files) {
    const relPath = sanitizeRelativePath(file.name);
    if (!relPath) {
      return new Response(`Invalid file name: "${file.name}"`, { status: 400 });
    }
    const destPath = path.join(batchDir, relPath);
    if (!destPath.startsWith(batchDir + path.sep)) {
      return new Response(`Invalid file path: "${file.name}"`, { status: 400 });
    }
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, Buffer.from(await file.arrayBuffer()));
    results.push({ name: relPath, path: destPath, size: file.size });
  }

  return Response.json({ files: results });
}
