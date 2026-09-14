import { NextRequest } from 'next/server';
import { resolvePermission } from '@/lib/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

// Same DNS-rebinding guard as /api/chat — a permission decision is a
// state-mutating action (it can let a tool run), so it must be local-only too.
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

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return new Response('Unsupported Media Type', { status: 415 });
  }

  let body: { requestId?: unknown; decision?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  if (typeof body.requestId !== 'string' || !body.requestId) {
    return new Response('Missing requestId', { status: 400 });
  }
  if (body.decision !== 'allow' && body.decision !== 'deny') {
    return new Response('decision must be "allow" or "deny"', { status: 400 });
  }

  const resolved = resolvePermission(body.requestId, body.decision);
  // Not found = already answered, stale, or the run ended. Not an error from
  // the client's perspective — just report it so the UI can settle the card.
  return Response.json({ resolved });
}
