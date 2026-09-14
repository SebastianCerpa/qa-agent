// Bridges the SDK's canUseTool callback (server-side, in-process) to the chat
// UI: when the agent asks to run a tool that isn't pre-approved by the
// allow-list, we surface the request over the same SSE stream the rest of the
// run uses, then park until the user clicks Approve/Deny in the browser.
//
// canUseTool has "no park deadline" — it waits indefinitely — so the only ways
// a request resolves are: the user answers (resolvePermission), or the run is
// stopped (abortCurrentGeneration denies every pending request). That's
// deliberate: a half-answered permission prompt should block the agent, not
// silently time out into an allow or a deny.

import { getCurrentGeneration } from './runState';

export interface PermissionRequestInput {
  requestId: string;
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  // Bridge-rendered labels from the SDK, when present — preferred over
  // reconstructing a prompt from toolName+input.
  title?: string;
  displayName?: string;
  description?: string;
  signal: AbortSignal;
}

// Called from claudeRunner's canUseTool. Resolves to the user's decision.
export function requestPermission(req: PermissionRequestInput): Promise<'allow' | 'deny'> {
  const gen = getCurrentGeneration();
  // No live generation (shouldn't happen mid-run) — fail closed.
  if (!gen) return Promise.resolve('deny');

  return new Promise<'allow' | 'deny'>((resolve) => {
    let settled = false;
    const settle = (decision: 'allow' | 'deny') => {
      if (settled) return;
      settled = true;
      gen.pendingPermissions.delete(req.requestId);
      resolve(decision);
    };

    gen.pendingPermissions.set(req.requestId, {
      requestId: req.requestId,
      toolUseId: req.toolUseId,
      toolName: req.toolName,
      resolve: settle,
    });

    // If the run is aborted while this prompt is open, deny and stop waiting.
    if (req.signal.aborted) {
      settle('deny');
      return;
    }
    req.signal.addEventListener('abort', () => settle('deny'), { once: true });

    // Surface to the UI. broadcastAndReduce lives in claudeRunner; we import
    // lazily to avoid a circular module load at import time.
    void import('./claudeRunner').then(({ broadcastPermissionRequest }) => {
      broadcastPermissionRequest({
        requestId: req.requestId,
        toolUseId: req.toolUseId,
        toolName: req.toolName,
        input: req.input,
        title: req.title,
        displayName: req.displayName,
        description: req.description,
      });
    });
  });
}

// Called from the /api/permission/respond route when the user clicks a button.
// Returns whether a matching pending request was found (false = already
// resolved, stale, or unknown id).
export function resolvePermission(requestId: string, decision: 'allow' | 'deny'): boolean {
  const gen = getCurrentGeneration();
  const pending = gen?.pendingPermissions.get(requestId);
  if (!gen || !pending) return false;
  pending.resolve(decision);
  // broadcast the resolution so every connected client updates the card.
  void import('./claudeRunner').then(({ broadcastPermissionResolved }) => {
    broadcastPermissionResolved(requestId, decision);
  });
  return true;
}
