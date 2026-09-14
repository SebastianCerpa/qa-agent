import { NextRequest } from 'next/server';
import { getConversation, deleteConversation, setPinned, isValidConversationId } from '@/lib/conversationStore';
import { getCurrentGeneration } from '@/lib/runState';

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isLocalRequest(request)) return new Response('Forbidden', { status: 403 });

  const { id } = await params;
  if (!isValidConversationId(id)) return new Response('Invalid conversation id', { status: 400 });

  const conversation = await getConversation(id);
  if (!conversation) return new Response('Not found', { status: 404 });

  const gen = getCurrentGeneration();
  return Response.json({ ...conversation, isGenerating: gen?.conversationId === id && !gen.done });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isLocalRequest(request)) return new Response('Forbidden', { status: 403 });

  const { id } = await params;
  if (!isValidConversationId(id)) return new Response('Invalid conversation id', { status: 400 });

  const gen = getCurrentGeneration();
  if (gen && gen.conversationId === id && !gen.done) {
    return new Response('Cannot delete a conversation that is currently generating.', { status: 409 });
  }

  const deleted = await deleteConversation(id);
  return Response.json({ deleted });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isLocalRequest(request)) return new Response('Forbidden', { status: 403 });

  const { id } = await params;
  if (!isValidConversationId(id)) return new Response('Invalid conversation id', { status: 400 });

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return new Response('Unsupported Media Type', { status: 415 });
  }

  let body: { pinned?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  if (typeof body.pinned !== 'boolean') {
    return new Response('Expected { "pinned": boolean }', { status: 400 });
  }

  const conversation = await setPinned(id, body.pinned);
  if (!conversation) return new Response('Not found', { status: 404 });

  return Response.json(conversation);
}
