// Client-safe reducer for the SSE stream produced by claudeRunner.ts.
// Event shapes below were verified empirically (a live `claude -p ... --output-format
// stream-json --verbose --include-partial-messages` run), not guessed from docs alone.
//
// NOTE: this is NOT a pure reducer — it mutates `state.entries` (push) and the
// internal Maps in place, then returns a shallow-cloned wrapper with a fresh
// `entries` array. That's safe for the two current callers (the server keeps a
// single `gen.reducerState` it reassigns to itself; the client keeps a local
// accumulator it spreads into React state after each call). Do NOT feed the same
// state object into `useReducer` or a memoized selector expecting immutability —
// make it copy-on-write first if you ever need that.

export interface LogEntry {
  id: string;
  parentId: string | null;
  depth: number;
  kind: 'header' | 'text' | 'tool' | 'status' | 'stderr' | 'result' | 'error' | 'permission';
  text: string;
  toolUseId?: string;
  toolResult?: string;
  toolResultIsError?: boolean;
  done?: boolean;
  // Populated only on 'permission' entries — an interactive approval prompt for
  // a tool call the allow-list didn't cover. `permissionStatus` starts
  // 'pending' and moves to 'allowed'/'denied' once the user answers (or the run
  // is stopped, which denies it).
  permissionRequestId?: string;
  permissionStatus?: 'pending' | 'allowed' | 'denied';
  permissionToolName?: string;
  permissionInput?: Record<string, unknown>;
  permissionLabel?: string;
  meta?: {
    isError?: boolean;
    durationMs?: number;
    costUsd?: number;
    permissionDenials?: unknown[];
    // Set only on client-side failures (the /api/chat POST itself failing, or
    // throwing before any agent event arrived) — distinguishes "the request
    // never reached the agent, retry is safe" from an error the agent itself
    // reported mid-run, which AssistantTurn renders without a Retry button.
    transportError?: boolean;
  };
}

export interface StreamState {
  entries: LogEntry[];
  running: boolean;
  finished: boolean;
  lastActivityAt: number;
  // internal bookkeeping, not rendered directly
  liveTextIndex: Map<string, number>; // "parent::messageId::blockIndex" -> index into entries
  toolEntryIndex: Map<string, number>; // tool_use id -> index into entries
  toolUseParent: Map<string, string | null>; // tool_use id -> its own parent_tool_use_id
  lastMessageIdByParent: Map<string, string>; // parent_tool_use_id ("root" for null) -> current message id
  // "parentKey::messageId" -> streamed text entry indices, in content-block
  // order. Lets the aggregated `assistant` event reconcile each text block
  // against the one the partial stream already created, without relying on a
  // block index the two event shapes disagree on (see applyClaudeEvent).
  streamedTextByMessage: Map<string, number[]>;
  reconciledTextByMessage: Map<string, number>; // same key -> how many the assistant event has claimed
}

export function initialStreamState(): StreamState {
  return {
    entries: [],
    running: false,
    finished: false,
    lastActivityAt: Date.now(),
    liveTextIndex: new Map(),
    toolEntryIndex: new Map(),
    toolUseParent: new Map(),
    lastMessageIdByParent: new Map(),
    streamedTextByMessage: new Map(),
    reconciledTextByMessage: new Map(),
  };
}

function depthOf(parentId: string | null, toolUseParent: Map<string, string | null>): number {
  let depth = 0;
  let cur = parentId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    depth++;
    seen.add(cur);
    cur = toolUseParent.get(cur) ?? null;
  }
  return depth;
}

function truncate(value: string, max = 400): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

let uid = 0;
function nextId(): string {
  uid += 1;
  return `entry-${uid}`;
}

export function applyPayload(state: StreamState, payload: any): StreamState {
  const entries = state.entries;
  const push = (entry: Omit<LogEntry, 'id'>) => {
    entries.push({ id: nextId(), ...entry });
  };

  switch (payload.type) {
    case 'started': {
      // No header line here — the chat UI already renders the user's own
      // message as its own bubble, so echoing the prompt again is redundant.
      return { ...state, running: true, finished: false, lastActivityAt: Date.now() };
    }

    case 'heartbeat': {
      return { ...state, lastActivityAt: payload.at ?? Date.now() };
    }

    case 'stderr': {
      push({ parentId: null, depth: 0, kind: 'stderr', text: payload.line });
      return { ...state, entries: [...entries], lastActivityAt: Date.now() };
    }

    case 'raw-line-parse-error': {
      push({ parentId: null, depth: 0, kind: 'error', text: `Could not parse a line from claude: ${truncate(payload.line)}` });
      return { ...state, entries: [...entries], lastActivityAt: Date.now() };
    }

    case 'process-error': {
      push({ parentId: null, depth: 0, kind: 'error', text: `Process error: ${payload.message}` });
      return { ...state, entries: [...entries], running: false, finished: true, lastActivityAt: Date.now() };
    }

    case 'error': {
      push({
        parentId: null,
        depth: 0,
        kind: 'error',
        text: payload.message,
        meta: payload.transportError ? { transportError: true } : undefined,
      });
      return { ...state, entries: [...entries], running: false, finished: true, lastActivityAt: Date.now() };
    }

    case 'process-close': {
      const alreadyHasResult = entries.some((e) => e.kind === 'result');
      if (!alreadyHasResult) {
        // The SIGTERM signal is synthesized in claudeRunner.ts only when the
        // SDK query throws with its AbortController already aborted — i.e. the
        // Stop button's DELETE call ran abortCurrentGeneration(). So it
        // reliably means the user asked for this, not a crash. Say so plainly.
        const userStopped = payload.signal === 'SIGTERM' || payload.signal === 'SIGKILL';
        push({
          parentId: null,
          depth: 0,
          kind: 'status',
          text: userStopped
            ? 'Stopped by user.'
            : `Process exited (code ${payload.code ?? 'null'}, signal ${payload.signal ?? 'none'}) without a final result.`,
        });
      }
      return { ...state, entries: [...entries], running: false, finished: true, lastActivityAt: Date.now() };
    }

    case 'permission_request': {
      // A tool call the allow-list didn't cover, awaiting the user's answer.
      // Prefer the bridge-rendered label; else fall back to the tool name +
      // a compact input summary (e.g. the Bash command).
      const label =
        payload.title ||
        payload.description ||
        `${payload.displayName || payload.toolName}${summarizeToolInput(payload.input)}`;
      push({
        parentId: null,
        depth: 0,
        kind: 'permission',
        text: label,
        permissionRequestId: payload.requestId,
        permissionStatus: 'pending',
        permissionToolName: payload.toolName,
        permissionInput: payload.input,
        permissionLabel: label,
      });
      return { ...state, entries: [...entries], lastActivityAt: Date.now() };
    }

    case 'permission_resolved': {
      const idx = entries.findIndex(
        (e) => e.kind === 'permission' && e.permissionRequestId === payload.requestId
      );
      if (idx !== -1) {
        entries[idx] = {
          ...entries[idx],
          permissionStatus: payload.decision === 'allow' ? 'allowed' : 'denied',
        };
      }
      return { ...state, entries: [...entries], lastActivityAt: Date.now() };
    }

    case 'event':
      return applyClaudeEvent(state, payload.event);

    default:
      return state;
  }
}

function applyClaudeEvent(state: StreamState, event: any): StreamState {
  const entries = state.entries;
  const push = (entry: Omit<LogEntry, 'id'>) => {
    entries.push({ id: nextId(), ...entry });
    return entries.length - 1;
  };
  const touched = () => ({ ...state, entries: [...entries], lastActivityAt: Date.now() });

  switch (event.type) {
    case 'system': {
      if (event.subtype === 'init') {
        push({
          parentId: null,
          depth: 0,
          kind: 'header',
          text: `Session ${String(event.session_id).slice(0, 8)} — model ${event.model}, ${event.agents?.length ?? 0} agents, ${event.slash_commands?.length ?? 0} commands loaded`,
        });
        return touched();
      }
      if (event.subtype === 'post_turn_summary') {
        push({ parentId: null, depth: 0, kind: 'status', text: event.status_detail ?? 'Turn complete' });
        return touched();
      }
      if (event.subtype === 'api_retry') {
        push({
          parentId: null,
          depth: 0,
          kind: 'status',
          text: `Retrying (attempt ${event.attempt}/${event.max_retries}) after ${event.error}…`,
        });
        return touched();
      }
      return state; // 'status'/other subtypes: too noisy for v1, skip quietly
    }

    case 'stream_event': {
      const parentId: string | null = event.parent_tool_use_id ?? null;
      const inner = event.event;
      const parentKey = parentId ?? 'root';

      if (inner.type === 'message_start') {
        state.lastMessageIdByParent.set(parentKey, inner.message.id);
        return state; // no visible entry yet — wait for content blocks
      }

      if (inner.type === 'content_block_start' && inner.content_block?.type === 'text') {
        const messageId = state.lastMessageIdByParent.get(parentKey) ?? 'unknown';
        const key = `${parentKey}::${messageId}::${inner.index}`;
        const idx = push({ parentId, depth: depthOf(parentId, state.toolUseParent), kind: 'text', text: '', done: false });
        state.liveTextIndex.set(key, idx);
        const mkey = `${parentKey}::${messageId}`;
        const streamed = state.streamedTextByMessage.get(mkey) ?? [];
        streamed.push(idx);
        state.streamedTextByMessage.set(mkey, streamed);
        return touched();
      }

      if (inner.type === 'content_block_delta' && inner.delta?.type === 'text_delta') {
        const messageId = state.lastMessageIdByParent.get(parentKey) ?? 'unknown';
        const key = `${parentKey}::${messageId}::${inner.index}`;
        const idx = state.liveTextIndex.get(key);
        if (idx !== undefined && entries[idx]) {
          entries[idx] = { ...entries[idx], text: entries[idx].text + inner.delta.text };
          return touched();
        }
        return state;
      }

      if (inner.type === 'content_block_stop') {
        const messageId = state.lastMessageIdByParent.get(parentKey) ?? 'unknown';
        const key = `${parentKey}::${messageId}::${inner.index}`;
        const idx = state.liveTextIndex.get(key);
        if (idx !== undefined && entries[idx]) {
          entries[idx] = { ...entries[idx], done: true };
          return touched();
        }
        return state;
      }

      return state; // message_delta / message_stop: no direct UI content in v1
    }

    case 'assistant': {
      const parentId: string | null = event.parent_tool_use_id ?? null;
      const parentKey = parentId ?? 'root';
      const messageId = event.message?.id;
      const blocks = event.message?.content ?? [];

      blocks.forEach((block: any) => {
        if (block.type === 'text') {
          // Reconcile against the text blocks the partial stream already
          // created for THIS message, in order. We can't key by array index:
          // the partial stream reports each block at its true content index (a
          // leading `thinking` block pushes text to index 1+), but the
          // aggregated `assistant` event delivers blocks one per event, so
          // their array index is always 0. Those disagree whenever any
          // non-text block precedes the text — which duplicated the text
          // entry. Matching in stream order is immune to that.
          const mkey = `${parentKey}::${messageId}`;
          const streamed = state.streamedTextByMessage.get(mkey);
          const consumed = state.reconciledTextByMessage.get(mkey) ?? 0;
          if (streamed && consumed < streamed.length) {
            const idx = streamed[consumed];
            // Authoritative full text replaces whatever the deltas assembled —
            // guards against any drift in the incremental accumulation.
            if (entries[idx]) entries[idx] = { ...entries[idx], text: block.text, done: true };
            state.reconciledTextByMessage.set(mkey, consumed + 1);
          } else {
            // No streamed counterpart (partial messages disabled, or a source
            // that doesn't stream text) — this event is the only carrier.
            push({ parentId, depth: depthOf(parentId, state.toolUseParent), kind: 'text', text: block.text, done: true });
          }
        } else if (block.type === 'tool_use') {
          state.toolUseParent.set(block.id, parentId);
          const idx = push({
            parentId,
            depth: depthOf(parentId, state.toolUseParent),
            kind: 'tool',
            text: `🔧 ${block.name}${summarizeToolInput(block.input)}`,
            toolUseId: block.id,
          });
          state.toolEntryIndex.set(block.id, idx);
        }
      });

      return touched();
    }

    case 'user': {
      const blocks = event.message?.content ?? [];
      blocks.forEach((block: any) => {
        if (block.type === 'tool_result') {
          const idx = state.toolEntryIndex.get(block.tool_use_id);
          if (idx !== undefined && entries[idx]) {
            const text = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
            entries[idx] = {
              ...entries[idx],
              toolResult: truncate(text),
              toolResultIsError: Boolean(block.is_error),
            };
          }
        }
      });
      return touched();
    }

    case 'result': {
      push({
        parentId: null,
        depth: 0,
        kind: 'result',
        text: event.result ?? (event.is_error ? 'Failed — see errors above.' : 'Done.'),
        meta: {
          isError: Boolean(event.is_error),
          durationMs: event.duration_ms,
          costUsd: event.total_cost_usd,
          permissionDenials: event.permission_denials ?? [],
        },
      });
      return { ...touched(), running: false, finished: true };
    }

    default:
      return state; // rate_limit_event and anything else we don't render in v1
  }
}

function summarizeToolInput(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const str = JSON.stringify(input);
  return str.length > 2 ? ` — ${truncate(str, 120)}` : '';
}
