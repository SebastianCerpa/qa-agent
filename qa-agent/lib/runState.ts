import { initialStreamState, type StreamState } from './streamReducer';

// One in-flight tool-permission prompt awaiting the user's answer in the UI.
// `resolve` is the pending canUseTool promise's resolver (see lib/permissions.ts).
export interface PendingPermission {
  requestId: string;
  toolUseId: string;
  toolName: string;
  resolve: (decision: 'allow' | 'deny') => void;
}

export interface Generation {
  conversationId: string;
  // The agent now runs in-process via the SDK's query() (not a spawned child),
  // so a Stop is an AbortController.abort() rather than a signal to a pid.
  abort: AbortController | null;
  pendingPermissions: Map<string, PendingPermission>;
  buffer: unknown[];
  subscribers: Set<(payload: unknown) => void>;
  reducerState: StreamState;
  userMessage: string;
  startedAt: number;
  done: boolean;
}

// Route-module scope resets on every Next dev Fast Refresh, which would
// otherwise orphan a live `claude` child (still hitting the real checkly-test
// repo) while this registry silently forgets it exists. Pinning to globalThis
// survives HMR the same way Next.js's own docs recommend for singleton
// clients (e.g. Prisma) in dev mode — same pattern the old run-lock used.
declare global {
  // eslint-disable-next-line no-var
  var __qaAgentGeneration: Generation | null | undefined;
}

export function getCurrentGeneration(): Generation | null {
  return globalThis.__qaAgentGeneration ?? null;
}

// Only one generation globally, ever — deliberate v1 simplicity, avoids two
// subagents concurrently mutating the same real checkly-test repo. Returns
// null if one is already active; caller decides how to respond.
export function startGeneration(conversationId: string, userMessage: string): Generation | null {
  if (getCurrentGeneration()) return null;

  const generation: Generation = {
    conversationId,
    abort: null,
    pendingPermissions: new Map(),
    buffer: [],
    subscribers: new Set(),
    reducerState: initialStreamState(),
    userMessage,
    startedAt: Date.now(),
    done: false,
  };
  globalThis.__qaAgentGeneration = generation;
  return generation;
}

export function setAbortController(abort: AbortController): void {
  const gen = getCurrentGeneration();
  if (gen) gen.abort = abort;
}

// Persistence must be awaited by the caller BEFORE this runs — otherwise a
// rapid second message to the same conversation can start a read-modify-write
// on the same JSON file while the prior write is still in flight.
export function endGeneration(): void {
  globalThis.__qaAgentGeneration = null;
}

export function broadcast(payload: unknown): void {
  const gen = getCurrentGeneration();
  if (!gen) return;
  gen.buffer.push(payload);
  for (const subscriber of gen.subscribers) {
    try {
      subscriber(payload);
    } catch {
      // a dead/broken subscriber shouldn't take down the broadcast
    }
  }
}

export function subscribe(callback: (payload: unknown) => void): (() => void) | null {
  const gen = getCurrentGeneration();
  if (!gen) return null;
  gen.subscribers.add(callback);
  return () => gen.subscribers.delete(callback);
}

// Stop: abort the SDK query (which kills the underlying claude process and its
// tool subtree). Any tool call currently parked on a UI permission prompt is
// released as a denial so the run can wind down instead of hanging on a promise
// that will never be answered.
export function abortCurrentGeneration(): void {
  const gen = getCurrentGeneration();
  if (!gen) return;
  for (const pending of gen.pendingPermissions.values()) {
    try {
      pending.resolve('deny');
    } catch {
      // resolver already settled
    }
  }
  gen.pendingPermissions.clear();
  try {
    gen.abort?.abort();
  } catch {
    // already aborted
  }
}

const TERMINAL_PAYLOAD_TYPES = new Set(['process-close', 'process-error', 'error']);

// Shared by both POST /api/chat (fresh) and GET /api/chat/subscribe
// (reattach) — replays whatever's buffered so far, then live-streams new
// events, and closes itself once a terminal event is seen. Cancelling this
// stream (tab close, navigation, fetch abort) only removes this subscriber —
// it must NOT kill the underlying child; only stopCurrentRun() does that.
export function createSseStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const toChunk = (payload: unknown) => encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
  let unsubscribe: (() => void) | null = null;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const gen = getCurrentGeneration();
      if (!gen) {
        controller.enqueue(toChunk({ type: 'error', message: 'No active generation to subscribe to.' }));
        controller.close();
        return;
      }

      let closed = false;
      const safeEnqueue = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(toChunk(payload));
        } catch {
          closed = true;
        }
      };

      for (const payload of gen.buffer) safeEnqueue(payload);

      if (gen.done || closed) {
        if (!closed) controller.close();
        return;
      }

      unsubscribe = subscribe((payload) => {
        safeEnqueue(payload);
        const type = (payload as { type?: string })?.type;
        if (!closed && type && TERMINAL_PAYLOAD_TYPES.has(type)) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      });
    },
    cancel() {
      unsubscribe?.();
    },
  });
}
