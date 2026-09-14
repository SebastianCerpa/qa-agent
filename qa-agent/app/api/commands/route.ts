import { NextRequest } from 'next/server';
import { loadCommands } from '@/lib/commands';

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

export async function GET(request: NextRequest) {
  if (!isLocalRequest(request)) return new Response('Forbidden', { status: 403 });
  return Response.json(loadCommands());
}
