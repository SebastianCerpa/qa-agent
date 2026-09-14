import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { sanitizeMessage, startTurn, stopCurrentRun } from '@/lib/claudeRunner';
import { getCurrentGeneration, createSseStream } from '@/lib/runState';
import { appendTurn, conversationExists, isValidConversationId } from '@/lib/conversationStore';
import { sanitizeAttachments, buildMessageWithAttachments } from '@/lib/uploads';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

// Guards against DNS rebinding: a page can get a browser to open a real socket
// to 127.0.0.1 while Origin/Host still reflect an attacker's domain. Loopback
// binding alone (see package.json's -H 127.0.0.1) does not defend against this.
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

  let body: { conversationId?: string; message?: string; attachments?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response('Invalid JSON body', { status: 400 });
  }

  let attachments;
  try {
    attachments = sanitizeAttachments(body.attachments);
  } catch (err) {
    return new Response((err as Error).message, { status: 400 });
  }

  let message: string;
  try {
    // A message can be attachments-only from the UI (empty text box) — fall
    // back to a stand-in so sanitizeMessage's emptiness check doesn't reject
    // a legitimate "just look at this file" request.
    const raw = (body.message ?? '').trim() || (attachments.length > 0 ? 'Please review the attached file(s).' : '');
    message = sanitizeMessage(raw);
  } catch (err) {
    return new Response((err as Error).message, { status: 400 });
  }

  let conversationId: string;
  let isNewConversation: boolean;

  if (body.conversationId) {
    if (!isValidConversationId(body.conversationId) || !(await conversationExists(body.conversationId))) {
      return new Response('Unknown conversationId', { status: 404 });
    }
    conversationId = body.conversationId;
    isNewConversation = false;
  } else {
    conversationId = crypto.randomUUID();
    isNewConversation = true;
  }

  if (getCurrentGeneration()) {
    return new Response('A conversation is already generating. Wait for it to finish, or stop it first.', {
      status: 409,
    });
  }

  // Saved before generation starts so the user's message survives even if the
  // process crashes immediately after. The chat bubble shows the user's own
  // text verbatim; the attachment file paths are appended separately below,
  // only for the copy of the message Claude actually receives.
  await appendTurn(conversationId, {
    id: crypto.randomUUID(),
    role: 'user',
    text: message,
    attachments: attachments.length > 0 ? attachments : undefined,
    createdAt: Date.now(),
  });

  const messageForClaude = buildMessageWithAttachments(message, attachments);
  const started = startTurn(conversationId, messageForClaude, isNewConversation);
  if (!started) {
    return new Response('Failed to start — another conversation is already generating.', { status: 409 });
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

export async function GET(request: NextRequest) {
  if (!isLocalRequest(request)) return new Response('Forbidden', { status: 403 });
  const gen = getCurrentGeneration();
  return Response.json({
    active: Boolean(gen && !gen.done),
    conversationId: gen?.conversationId ?? null,
  });
}

export async function DELETE(request: NextRequest) {
  if (!isLocalRequest(request)) return new Response('Forbidden', { status: 403 });
  stopCurrentRun();
  return Response.json({ stopped: true });
}
