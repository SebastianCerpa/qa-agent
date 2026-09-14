import fs from 'node:fs';
import path from 'node:path';
import { query, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { QA_AGENT_ROOT } from './commands';
import { applyPayload } from './streamReducer';
import { appendTurn, type Turn } from './conversationStore';
import { requestPermission } from './permissions';
import {
  startGeneration,
  setAbortController,
  endGeneration,
  broadcast,
  abortCurrentGeneration,
  getCurrentGeneration,
} from './runState';

const MAX_MESSAGE_LENGTH = 16000;

// Force subagents to run in the FOREGROUND. The SDK/CLI can run a subagent as a
// background async task — the orchestrator can request it (Task tool
// `background: true`), or a slow task is auto-backgrounded once it outlives
// CLAUDE_CODE_AUTO_BACKGROUND_TIMEOUT_MS. But a backgrounded subagent's
// tool-permission requests can no longer be answered through canUseTool: the
// permission control stream is torn down, so every gated Bash call inside the
// subagent failed with "Tool permission stream closed before response received"
// while its approval was still parked in the Qualitech UI (foreground main-loop
// tools were unaffected — which is why /run-tests worked but /from-ticket's
// linear-liaison subagent never could). Reproduced and fixed 2026-09-07; see the
// qa-agent-webapp-runner memory. Foreground execution also matches this runner's
// single-generation, sequential design, so nothing is lost by disabling it.
process.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS = '1';

// The 14-mode routing discipline lives in .claude/routing.md as the single
// source of truth. It is NOT an agent file (that would only register a
// dead-end subagent the orchestrator can't route through), so we read it here
// and append it to the main loop's system prompt — the append affects only the
// orchestrator, not the subagents, which keep their own .claude/agents/*.md
// prompts. Read once at module load; a missing file degrades gracefully to no
// routing guidance (same behavior as before this was wired).
const ROUTING_PROMPT = (() => {
  try {
    return fs.readFileSync(path.join(QA_AGENT_ROOT, '.claude', 'routing.md'), 'utf8');
  } catch {
    return '';
  }
})();

// Unlike the old command+args model, a chat message has no shell-command
// template it gets string-interpolated into — the model reads the whole
// message as a natural-language instruction and decides its own tool calls,
// gated by settings.local.json's allow-list. A punctuation blocklist here
// would just reject legitimate chat messages, so the only remaining hygiene
// is length and emptiness.
export function sanitizeMessage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('Message cannot be empty.');
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Message too long (max ${MAX_MESSAGE_LENGTH} characters).`);
  }
  return trimmed;
}

// Stop now aborts the in-process SDK query (which tears down the underlying
// claude process and its tool subtree) and releases any UI permission prompt
// that's still parked. See abortCurrentGeneration.
export function stopCurrentRun(): void {
  abortCurrentGeneration();
}

function broadcastAndReduce(payload: unknown): void {
  const gen = getCurrentGeneration();
  if (gen) gen.reducerState = applyPayload(gen.reducerState, payload);
  broadcast(payload);
}

// Surfaced by lib/permissions.ts (imported lazily there to avoid a cycle).
export function broadcastPermissionRequest(payload: {
  requestId: string;
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  title?: string;
  displayName?: string;
  description?: string;
}): void {
  broadcastAndReduce({ type: 'permission_request', ...payload });
}

export function broadcastPermissionResolved(requestId: string, decision: 'allow' | 'deny'): void {
  broadcastAndReduce({ type: 'permission_resolved', requestId, decision });
}

async function finishGeneration(finalPayload: unknown): Promise<void> {
  const gen = getCurrentGeneration();
  if (!gen || gen.done) return;
  gen.done = true;

  // Through the reducer too, not just broadcast — otherwise the persisted
  // turn's entries would be missing whatever this final error/close/result
  // event renders (e.g. the terminal status block).
  broadcastAndReduce(finalPayload);

  const assistantTurn: Turn = {
    id: crypto.randomUUID(),
    role: 'assistant',
    entries: gen.reducerState.entries,
    createdAt: Date.now(),
  };

  try {
    // Awaited BEFORE endGeneration() clears the slot — otherwise a rapid
    // second message to the same conversation could start writing the same
    // JSON file while this write is still in flight.
    await appendTurn(gen.conversationId, assistantTurn);
  } finally {
    endGeneration();
  }
}

// Starts a new generation for `conversationId`. `isNewConversation` picks
// --session-id (first message ever) vs --resume (continuing). The cwd is fixed
// to QA_AGENT_ROOT, same as before — both session modes were verified to need
// the identical cwd used originally.
// Returns false if a generation is already active (caller should reject the
// request — only one generation globally, ever, by design).
export function startTurn(conversationId: string, message: string, isNewConversation: boolean): boolean {
  const generation = startGeneration(conversationId, message);
  if (!generation) return false;

  const abort = new AbortController();
  setAbortController(abort);
  broadcastAndReduce({ type: 'started', conversationId });

  // canUseTool (interactive permission prompts) requires STREAMING input: the
  // CLI's stdin must stay open for the whole turn so the SDK can write the
  // permission decision back over its control channel. A plain string `prompt`
  // makes the SDK send one message and immediately close stdin, so the first
  // tool that isn't allow-listed died with "AbortError: Stream closed" — it hit
  // every non-allow-listed Bash call (/from-ticket's Linear curl among them).
  // Passing the prompt as an async generator that stays open until the turn's
  // terminal `result` event (or an abort) keeps the channel bidirectional;
  // endInput() then closes it so the query can wind down to process-close.
  let endInput: () => void = () => {};
  const inputClosed = new Promise<void>((resolve) => {
    endInput = resolve;
    if (abort.signal.aborted) resolve();
    else abort.signal.addEventListener('abort', () => resolve(), { once: true });
  });
  async function* promptStream(): AsyncGenerator<SDKUserMessage> {
    yield { type: 'user', message: { role: 'user', content: message }, parent_tool_use_id: null };
    await inputClosed;
  }

  const heartbeat = setInterval(() => broadcastAndReduce({ type: 'heartbeat', at: Date.now() }), 10_000);

  let settled = false;
  const settle = (payload: unknown) => {
    if (settled) return;
    settled = true;
    clearInterval(heartbeat);
    endInput();
    void finishGeneration(payload);
  };

  // Replicates the exact prior CLI invocation, plus canUseTool:
  //   --session-id (new) / --resume (continue), --include-partial-messages,
  //   --forward-subagent-text. permissionMode 'default' means safe tools run
  //   silently while dangerous ones fall through to canUseTool → the UI prompt.
  //   settingSources omitted-equivalent (all) so .claude/settings.local.json's
  //   allow-list is still honored.
  const run = query({
    prompt: promptStream(),
    options: {
      cwd: QA_AGENT_ROOT,
      // Main-loop model: Sonnet. Orchestration/routing/synthesis doesn't need
      // Opus; each subagent pins its own model via .claude/agents/*.md
      // frontmatter (Opus only for playwright-triage's root-cause work).
      model: 'sonnet',
      // Append the 14-mode routing guide to Claude Code's default preset so the
      // orchestrator actually follows the routing discipline. Only applied when
      // routing.md was found; otherwise fall back to the bare preset.
      systemPrompt: ROUTING_PROMPT
        ? { type: 'preset', preset: 'claude_code', append: ROUTING_PROMPT }
        : { type: 'preset', preset: 'claude_code' },
      abortController: abort,
      includePartialMessages: true,
      permissionMode: 'default',
      settingSources: ['user', 'project', 'local'],
      resume: isNewConversation ? undefined : conversationId,
      extraArgs: isNewConversation
        ? { 'session-id': conversationId, 'forward-subagent-text': null }
        : { 'forward-subagent-text': null },
      stderr: (data: string) => {
        const line = data.replace(/\n+$/, '');
        if (line.trim()) broadcastAndReduce({ type: 'stderr', line });
      },
      canUseTool: async (toolName, input, opts) => {
        const decision = await requestPermission({
          requestId: opts.requestId,
          toolUseId: opts.toolUseID,
          toolName,
          input,
          title: opts.title,
          displayName: opts.displayName,
          description: opts.description,
          signal: opts.signal,
        });
        return decision === 'allow'
          ? { behavior: 'allow', updatedInput: input }
          : { behavior: 'deny', message: 'Denied by you in the Qualitech UI.' };
      },
    },
  });

  (async () => {
    try {
      for await (const event of run) {
        broadcastAndReduce({ type: 'event', event });
        // The turn's terminal `result` has arrived — close the input stream so
        // the streaming-mode query winds down instead of waiting for more user
        // input (which would hold the run open indefinitely).
        if ((event as { type?: string })?.type === 'result') endInput();
      }
      // Natural end: the `result` event (already reduced above) carries the
      // terminal status; emit a close so any run without one still settles.
      settle({ type: 'process-close', code: 0, signal: null });
    } catch (err) {
      if (abort.signal.aborted) {
        // Stop button — reuse the SIGTERM path so the reducer renders
        // "Stopped by user." rather than a raw error.
        settle({ type: 'process-close', code: null, signal: 'SIGTERM' });
      } else {
        settle({ type: 'process-error', message: (err as Error).message });
      }
    }
  })();

  return true;
}
