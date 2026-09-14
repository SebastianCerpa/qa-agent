import { NextRequest } from 'next/server';
import { getCurrentGeneration, createSseStream } from '@/lib/runState';
import { isValidConversationId } from '@/lib/conversationStore';

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

// Reattachment path: lets a client that reloaded, or switched away and back,
// resume watching a generation that's still running server-side — the child
// process's lifecycle is independent of any one request now (see runState.ts).
export async function GET(request: NextRequest) {
  if (!isLocalRequest(request)) return new Response('Forbidden', { status: 403 });

  const conversationId = request.nextUrl.searchParams.get('conversationId');
  if (!conversationId || !isValidConversationId(conversationId)) {
    return new Response('Invalid or missing conversationId', { status: 400 });
  }

  const gen = getCurrentGeneration();
  if (!gen || gen.conversationId !== conversationId) {
    return new Response('No active generation for this conversation', { status: 404 });
  }

  return new Response(createSseStream(), {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
