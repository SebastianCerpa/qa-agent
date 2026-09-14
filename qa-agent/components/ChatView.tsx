'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Turn, Attachment } from '@/lib/types';
import { applyPayload, initialStreamState, type StreamState } from '@/lib/streamReducer';
import Sidebar, { type ConversationSummary } from './Sidebar';
import AssistantTurn from './AssistantTurn';
import BrandMark from './BrandMark';
import CommandsModal, { type CommandInfo } from './CommandsModal';
import TopBar from './TopBar';
import { useConfirmHold } from '@/lib/useConfirmHold';

// Tool names that write files — used to gate the mutating-command notice and
// the confirm-before-Stop step. Kept in sync with which command .md files
// route to a subagent that actually holds Edit/Write in its tool list.
const MUTATING_COMMAND_IDS = new Set(['automate', 'refactor', 'fix-tests', 'from-ticket', 'troubleshoot']);
const FILE_MUTATING_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit']);

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

const USER_BUBBLE_CLASS =
  'max-w-[76%] whitespace-pre-wrap break-words rounded-[13px_13px_3px_13px] border border-[var(--qa-user-border)] bg-[var(--qa-user-bubble)] px-[15px] py-[11px] text-base leading-[1.55] text-[oklch(0.94_0.02_255)]';

// A leading `/command token` gets the accent-mono treatment so the user's
// message reads like a typed command, matching the developer aesthetic.
function UserMessage({ text }: { text: string }) {
  const match = text.match(/^(\/[a-z0-9-]+)(\s[\s\S]*)?$/i);
  return (
    <div className={USER_BUBBLE_CLASS}>
      {match ? (
        <>
          <span className="font-mono font-medium text-[oklch(0.86_0.11_250)]">{match[1]}</span>
          {match[2]}
        </>
      ) : (
        text
      )}
    </div>
  );
}


interface PendingAttachment {
  localId: string;
  name: string;
  size: number;
  path?: string;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PaperclipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function AttachmentChip({ attachment, onRemove }: { attachment: PendingAttachment; onRemove?: () => void }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--qa-border)] bg-[oklch(0.2_0.011_262)] px-2.5 py-1.5 text-xs text-[oklch(0.82_0.008_262)]">
      <span className="max-w-[180px] truncate" title={attachment.name}>
        {attachment.name}
      </span>
      {attachment.status === 'uploading' && <span className="text-[var(--qa-text-mute)]">uploading…</span>}
      {attachment.status === 'error' && (
        <span className="text-[var(--qa-red)]" title={attachment.error}>
          failed
        </span>
      )}
      {attachment.status === 'done' && <span className="font-mono text-2xs text-[var(--qa-text-mute)]">{formatBytes(attachment.size)}</span>}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${attachment.name}`}
          className="text-[var(--qa-text-mute)] hover:text-[var(--qa-text)]"
        >
          ×
        </button>
      )}
    </div>
  );
}

export default function ChatView() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  // Id of the assistant turn the user just watched stream in. It's already
  // fully on screen when the live→persisted swap happens, so we skip the
  // entrance animation for exactly that one turn — replaying `qa-rise` on it is
  // what read as the finished message "blinking / reshuffling" a beat later.
  const [settledTurnId, setSettledTurnId] = useState<string | null>(null);
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<StreamState | null>(null);
  const [liveConversationId, setLiveConversationId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loadingThread, setLoadingThread] = useState(false);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[] | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [generationStartedAt, setGenerationStartedAt] = useState<number | null>(null);
  const [commandList, setCommandList] = useState<CommandInfo[] | null>(null);
  const [commandListError, setCommandListError] = useState<string | null>(null);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const stopConfirm = useConfirmHold();

  const bottomRef = useRef<HTMLDivElement>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  activeConversationIdRef.current = activeConversationId;

  useEffect(() => {
    // webkitdirectory has no React DOM prop — set it imperatively so the
    // browser treats this input as a folder picker instead of a file one.
    folderInputRef.current?.setAttribute('webkitdirectory', 'true');
  }, []);

  useEffect(() => {
    if (!attachMenuOpen) return;
    // onMouseLeave alone misses clicks that jump straight to another
    // element without crossing the menu's boundary (e.g. a fast click, or
    // any non-mouse activation) — a document-level listener closes it either way.
    const onPointerDown = (e: MouseEvent) => {
      if (!attachMenuRef.current?.contains(e.target as Node)) setAttachMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [attachMenuOpen]);

  // Auto-grow the composer as the message spans multiple lines, capped to
  // the same 160px (max-h-40) ceiling the textarea already had.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setHelpOpen(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const generatingHere = liveConversationId !== null && liveConversationId === activeConversationId;
  const showingLiveHere =
    liveState !== null && (liveConversationId === activeConversationId || (!activeConversationId && Boolean(liveConversationId)));

  const activeTitle = useMemo(() => {
    if (!activeConversationId) return 'New chat';
    return conversations.find((c) => c.id === activeConversationId)?.title ?? 'New chat';
  }, [conversations, activeConversationId]);

  // The "what's failing right now" answer, persistent above the fold instead
  // of requiring a chat query — real data from each conversation's own
  // persisted result (lib/conversationStore.ts's deriveLastResult), not a
  // simulated dashboard.
  const recentRuns = useMemo(() => conversations.slice(0, 8), [conversations]);
  const recentFailedCount = useMemo(() => recentRuns.filter((c) => c.lastResult === 'error').length, [recentRuns]);

  // 3 choices, not 5 — and the first one leads with the one thing already
  // sitting in memory (recentFailedCount) instead of a generic static prompt.
  const emptyStateSuggestions = useMemo(() => {
    const first =
      recentFailedCount > 0
        ? `${recentFailedCount} recent run${recentFailedCount === 1 ? '' : 's'} failed — triage now?`
        : "What's failing right now?";
    return [first, 'Audit Forest specs for fragile patterns', "Generate this week's stakeholder report"];
  }, [recentFailedCount]);

  const mutatingCommandMatch = input.match(/^\/([a-z0-9-]+)\b/i);
  const isMutatingCommand = Boolean(mutatingCommandMatch && MUTATING_COMMAND_IDS.has(mutatingCommandMatch[1].toLowerCase()));

  // Only while the token itself is still being typed (no space yet) — once a
  // space appears the user has moved on to the argument, so the list closes.
  const commandSuggestions = useMemo(() => {
    if (!commandList) return [];
    const partial = input.match(/^\/([a-z0-9-]*)$/i);
    if (!partial) return [];
    const q = partial[1].toLowerCase();
    return commandList.filter((c) => c.id.toLowerCase().startsWith(q)).slice(0, 6);
  }, [input, commandList]);

  function acceptSuggestion(cmd: CommandInfo) {
    setInput(`/${cmd.id} `);
    textareaRef.current?.focus();
  }

  const refreshConversations = useCallback(async () => {
    const res = await fetch('/api/conversations');
    if (res.ok) setConversations(await res.json());
  }, []);

  const refreshGlobalRunState = useCallback(async () => {
    const res = await fetch('/api/chat');
    if (res.ok) {
      const data = await res.json();
      setLiveConversationId(data.active ? data.conversationId : null);
    }
  }, []);

  useEffect(() => {
    refreshConversations();
    refreshGlobalRunState();
  }, [refreshConversations, refreshGlobalRunState]);

  useEffect(() => {
    fetch('/api/commands')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load commands.');
        return res.json();
      })
      .then(setCommandList)
      .catch((err) => setCommandListError((err as Error).message));
  }, []);

  // A new generation cycle (or the end of one) invalidates any pending
  // "click again to confirm" state from a previous run's Stop button.
  useEffect(() => {
    stopConfirm.cancel();
  }, [liveConversationId, stopConfirm.cancel]);

  useEffect(() => {
    setAutocompleteIndex(0);
  }, [input]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [turns, liveState?.entries.length]);

  const consumeSseResponse = useCallback(
    async (response: Response, conversationIdHint: string | null) => {
      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let localState = initialStreamState();
      let resolvedConversationId = conversationIdHint;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let sepIndex: number;
        while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
          const rawEvent = buffer.slice(0, sepIndex);
          buffer = buffer.slice(sepIndex + 2);
          const line = rawEvent.split('\n').find((l) => l.startsWith('data: '));
          if (!line) continue;

          let payload: any;
          try {
            payload = JSON.parse(line.slice('data: '.length));
          } catch {
            continue;
          }

          if (payload.type === 'started' && payload.conversationId) {
            resolvedConversationId = payload.conversationId;
            setActiveConversationId(payload.conversationId);
            setLiveConversationId(payload.conversationId);
          }

          localState = applyPayload(localState, payload);
          setLiveState({ ...localState });
        }
      }

      // The server persisted the authoritative turn — refetch it, then swap the
      // live turn out for the persisted one in ONE render. The previous order
      // (setTurns, then `await refreshConversations()`, then clear liveState)
      // left an `await` between adding the persisted turn and removing the live
      // one, so for that whole network beat the finished message rendered twice
      // — persisted (replaying its `qa-rise` entrance) and still-live — which
      // read as "the message appears out of order, then reshuffles a second
      // later." Fetching first and clearing without an await in between makes
      // it a single atomic frame.
      let persistedTurns: Turn[] | null = null;
      if (resolvedConversationId) {
        try {
          const res = await fetch(`/api/conversations/${resolvedConversationId}`);
          if (res.ok) persistedTurns = (await res.json()).turns ?? [];
        } catch {
          // Keep the live entries on screen rather than dropping the answer on a
          // transient refetch failure.
        }
      }

      // Everything from here runs with no `await` between the updates, so React
      // batches them into a single commit — live and persisted never coexist.
      // (On a refetch failure `persistedTurns` is null; the turn is still safe
      // server-side and reappears on the next load, so we just clear as before.)
      if (persistedTurns) {
        const last = persistedTurns[persistedTurns.length - 1];
        setSettledTurnId(last?.role === 'assistant' ? last.id : null);
        setTurns(persistedTurns);
      }
      setLiveConversationId(null);
      setLiveState(null);
      setPendingUserText(null);
      setPendingAttachments(null);
      setGenerationStartedAt(null);

      // Sidebar / recent-runs refresh is non-critical to the swap — fire it
      // un-awaited so it can never wedge itself between the state updates above.
      if (resolvedConversationId) refreshConversations();
    },
    [refreshConversations]
  );

  async function loadConversation(id: string, opts?: { silent?: boolean }) {
    if (!opts?.silent) setLoadingThread(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (activeConversationIdRef.current !== id && !opts?.silent) {
        // switching selection — fine, handled by caller setting state
      }
      setTurns(data.turns ?? []);
      if (data.isGenerating) {
        attachToGeneration(id);
      }
    } finally {
      if (!opts?.silent) setLoadingThread(false);
    }
  }

  async function attachToGeneration(id: string) {
    setLiveConversationId(id);
    setLiveState(initialStreamState());
    setGenerationStartedAt(Date.now());
    try {
      const res = await fetch(`/api/chat/subscribe?conversationId=${encodeURIComponent(id)}`);
      if (res.ok) await consumeSseResponse(res, id);
    } catch {
      // generation may have finished between the check and the subscribe call
      setLiveConversationId(null);
      setLiveState(null);
      setGenerationStartedAt(null);
    }
  }

  const selectConversation = useCallback(
    async (id: string) => {
      setActiveConversationId(id);
      setPendingUserText(null);
      setLiveState(null);
      // Fresh view — let every turn play its entrance; don't carry over the
      // "already settled" suppression from the previous conversation.
      setSettledTurnId(null);
      await loadConversation(id);
    },
    []
  );

  const newChat = useCallback(() => {
    setActiveConversationId(null);
    setTurns([]);
    setPendingUserText(null);
    setLiveState(null);
    setSettledTurnId(null);
  }, []);

  const deleteConversation = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      if (res.ok && id === activeConversationIdRef.current) newChat();
      await refreshConversations();
    },
    [newChat, refreshConversations]
  );

  const togglePin = useCallback(
    async (id: string, pinned: boolean) => {
      // Optimistic update — pinning should feel instant, not wait on a round-trip.
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned } : c)));
      const res = await fetch(`/api/conversations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned }),
      });
      if (!res.ok) await refreshConversations(); // revert to server truth on failure
    },
    [refreshConversations]
  );

  const uploadFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    const localEntries: PendingAttachment[] = files.map((f) => ({
      localId: crypto.randomUUID(),
      name: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
      size: f.size,
      status: 'uploading',
    }));
    setAttachments((prev) => [...prev, ...localEntries]);

    const formData = new FormData();
    files.forEach((f) => {
      const relPath = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      formData.append('files', f, relPath);
    });

    const markFailed = (error: string) => {
      setAttachments((prev) =>
        prev.map((a) => (localEntries.some((le) => le.localId === a.localId) ? { ...a, status: 'error', error } : a))
      );
    };

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) {
        markFailed(await res.text().catch(() => 'Upload failed.'));
        return;
      }
      const data: { files: Attachment[] } = await res.json();
      setAttachments((prev) => {
        const next = [...prev];
        localEntries.forEach((le, i) => {
          const idx = next.findIndex((a) => a.localId === le.localId);
          const uploaded = data.files[i];
          if (idx === -1) return;
          next[idx] = uploaded
            ? { ...next[idx], status: 'done', path: uploaded.path }
            : { ...next[idx], status: 'error', error: 'Upload failed.' };
        });
        return next;
      });
    } catch (err) {
      markFailed((err as Error).message);
    }
  }, []);

  const removeAttachment = useCallback((localId: string) => {
    setAttachments((prev) => prev.filter((a) => a.localId !== localId));
  }, []);

  // Shared by both the first send and a Retry — the two only differ in where
  // the message/attachments come from and whether the composer gets cleared.
  const submitMessage = useCallback(
    async (message: string, attachmentPayload: Attachment[]) => {
      setLiveState(initialStreamState());
      setGenerationStartedAt(Date.now());

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: activeConversationId ?? undefined, message, attachments: attachmentPayload }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => 'Request failed.');
          setLiveState((s) => applyPayload(s ?? initialStreamState(), { type: 'error', message: text, transportError: true }));
          setLiveConversationId(null);
          setGenerationStartedAt(null);
          return;
        }

        // Deliberately never aborted client-side, including by stop() below —
        // letting this run to its natural end (the server closes the stream
        // once the killed process actually exits) means Stop reconciles
        // through this exact same, already-correct path instead of a second,
        // parallel one that has to re-derive the same server truth.
        await consumeSseResponse(res, activeConversationId);
      } catch (err) {
        setLiveState((s) => applyPayload(s ?? initialStreamState(), { type: 'error', message: (err as Error).message, transportError: true }));
        setLiveConversationId(null);
        setGenerationStartedAt(null);
      }
    },
    [activeConversationId, consumeSseResponse]
  );

  const send = useCallback(async () => {
    const message = input.trim();
    const readyAttachments = attachments.filter((a): a is PendingAttachment & { path: string } => a.status === 'done' && Boolean(a.path));
    const isUploading = attachments.some((a) => a.status === 'uploading');
    if ((!message && readyAttachments.length === 0) || liveConversationId || isUploading) return;

    const attachmentPayload: Attachment[] = readyAttachments.map((a) => ({ name: a.name, path: a.path, size: a.size }));

    setInput('');
    setAttachments([]);
    setPendingUserText(message);
    setPendingAttachments(attachmentPayload.length > 0 ? attachmentPayload : null);

    await submitMessage(message, attachmentPayload);
  }, [input, attachments, liveConversationId, submitMessage]);

  // The failed request never reached the agent, so re-firing it with the same
  // message/attachments is always safe — no risk of a duplicate action.
  const retry = useCallback(() => {
    if (liveConversationId) return;
    const message = pendingUserText ?? '';
    const attachmentPayload = pendingAttachments ?? [];
    if (!message && attachmentPayload.length === 0) return;
    submitMessage(message, attachmentPayload);
  }, [liveConversationId, pendingUserText, pendingAttachments, submitMessage]);

  const hasMutatedFiles = useMemo(() => {
    if (!liveState) return false;
    return liveState.entries.some(
      (e) => e.kind === 'tool' && FILE_MUTATING_TOOLS.has(e.text.match(/^🔧 (\S+)/)?.[1] ?? '')
    );
  }, [liveState]);

  const respondToPermission = useCallback(async (requestId: string, decision: 'allow' | 'deny') => {
    try {
      await fetch('/api/permission/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, decision }),
      });
      // The authoritative UI update is the permission_resolved event that comes
      // back over the SSE stream — no optimistic mutation needed here.
    } catch {
      // POST failed: the card stays pending so the user can click again.
    }
  }, []);

  const stop = useCallback(() => {
    if (hasMutatedFiles && !stopConfirm.trigger()) return;
    stopConfirm.cancel();
    // Only kills the server-side process — never the client's own read of the
    // stream (see submitMessage). The "Stop" button keeps showing until the
    // process actually exits and the stream closes on its own, which is
    // honest: the run isn't over yet, it's winding down.
    fetch('/api/chat', { method: 'DELETE' }).catch(() => {});
  }, [hasMutatedFiles, stopConfirm]);

  return (
    <div className="flex h-screen">
      <Sidebar
        conversations={conversations}
        activeId={activeConversationId}
        liveConversationId={liveConversationId}
        onSelect={selectConversation}
        onNewChat={newChat}
        onDelete={deleteConversation}
        onTogglePin={togglePin}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      <CommandsModal
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        onUseCommand={(id) => setInput(`/${id} `)}
        commands={commandList}
        error={commandListError}
      />

      <div className="flex min-w-0 flex-1 flex-col" style={{ background: 'var(--qa-main-bg)' }}>
        <TopBar
          title={activeTitle}
          isLive={showingLiveHere}
          startedAt={generationStartedAt}
          onOpenMenu={() => setMobileSidebarOpen(true)}
          onOpenHelp={() => setHelpOpen(true)}
        />

        <div className="scroll-thin flex-1 overflow-y-auto px-4 py-7 sm:px-7">
          <div className="mx-auto flex max-w-[820px] flex-col gap-[22px]">
            {loadingThread && (
              <div className="mt-4 flex flex-col gap-4">
                <div className="ml-auto h-9 w-2/5 rounded-[13px] bg-white/5 motion-safe:animate-pulse" />
                <div className="h-28 w-3/4 rounded-xl bg-white/5 motion-safe:animate-pulse" />
              </div>
            )}

            {turns.length === 0 && !pendingUserText && !pendingAttachments && !loadingThread && (
              <div className="animate-qa-rise mt-16 flex flex-col items-center gap-5 text-center sm:mt-20">
                <BrandMark
                  unique="welcome"
                  className="h-12 w-12 rounded-[14px] shadow-[0_0_30px_-5px_rgba(56,132,255,0.4)]"
                />
                <div className="flex flex-col gap-2">
                  <h1 className="text-3xl font-bold tracking-tight text-[var(--qa-text)]">Qualitech</h1>
                  <p className="max-w-md text-sm leading-relaxed text-[var(--qa-text-dim)]">
                    Run the suite, triage failures, and write new checks against the repository.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  {emptyStateSuggestions.map((s, i) => (
                    <button
                      key={s}
                      onClick={() => setInput(s)}
                      style={{ animationDelay: `${80 + i * 40}ms` }}
                      className="animate-qa-rise rounded-full border border-[var(--qa-border)] bg-[oklch(0.2_0.011_262)] px-3 py-1.5 text-xs text-[oklch(0.82_0.008_262)] transition hover:border-[var(--qa-accent)]/40 hover:bg-[var(--qa-hover)] hover:text-[var(--qa-text)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-accent)]/60"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((turn) => (
              <div
                key={turn.id}
                className={
                  turn.role === 'user'
                    ? 'flex flex-col items-end gap-1.5'
                    : // The just-streamed turn is already on screen — swapping it
                      // from live to persisted shouldn't replay the entrance.
                      turn.id === settledTurnId
                      ? ''
                      : 'animate-qa-rise'
                }
              >
                {turn.role === 'user' ? (
                  <>
                    {turn.attachments && turn.attachments.length > 0 && (
                      <div className="flex max-w-[80%] flex-wrap justify-end gap-1.5">
                        {turn.attachments.map((a) => (
                          <AttachmentChip key={a.path} attachment={{ localId: a.path, name: a.name, size: a.size, status: 'done' }} />
                        ))}
                      </div>
                    )}
                    {turn.text && <UserMessage text={turn.text} />}
                  </>
                ) : (
                  <AssistantTurn entries={turn.entries ?? []} />
                )}
              </div>
            ))}

            {(pendingUserText || pendingAttachments) && (
              <div className="flex flex-col items-end gap-1.5">
                {pendingAttachments && pendingAttachments.length > 0 && (
                  <div className="flex max-w-[80%] flex-wrap justify-end gap-1.5">
                    {pendingAttachments.map((a) => (
                      <AttachmentChip key={a.path} attachment={{ localId: a.path, name: a.name, size: a.size, status: 'done' }} />
                    ))}
                  </div>
                )}
                {pendingUserText && <UserMessage text={pendingUserText} />}
              </div>
            )}

            {liveState && showingLiveHere && (
              <AssistantTurn
                entries={liveState.entries}
                streaming={!liveState.finished}
                onRetry={retry}
                onPermissionDecision={respondToPermission}
              />
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        <div
          className="flex-none px-4 pb-[18px] pt-3 sm:px-7"
          style={{ background: 'linear-gradient(180deg, transparent, oklch(0.115 0.008 262) 42%)' }}
        >
          <div className="mx-auto max-w-[820px]">
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attachments.map((a) => (
                  <AttachmentChip key={a.localId} attachment={a} onRemove={() => removeAttachment(a.localId)} />
                ))}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                uploadFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                uploadFiles(e.target.files);
                e.target.value = '';
              }}
            />

            {isMutatingCommand && (
              <div className="mb-2 flex items-center gap-2 rounded-lg border border-[oklch(0.4_0.1_80)] bg-[oklch(0.2_0.045_80)] px-3 py-2 text-xs text-[oklch(0.85_0.12_80)]">
                <WarningIcon className="h-3.5 w-3.5 flex-shrink-0" />
                This command can write files in the target repo — review the diff before you commit.
              </div>
            )}

            <div className="relative">
              {commandSuggestions.length > 0 && (
                <div
                  role="listbox"
                  aria-label="Command suggestions"
                  className="scroll-thin absolute bottom-full left-0 right-0 z-10 mb-2 max-h-56 overflow-y-auto rounded-xl border border-[var(--qa-border)] bg-[oklch(0.2_0.011_262)] shadow-lg"
                >
                  {commandSuggestions.map((cmd, i) => (
                    <button
                      key={cmd.id}
                      type="button"
                      role="option"
                      aria-selected={i === autocompleteIndex}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        acceptSuggestion(cmd);
                      }}
                      onMouseEnter={() => setAutocompleteIndex(i)}
                      className={`flex w-full items-center gap-2 px-3.5 py-2 text-left transition-colors first:rounded-t-xl last:rounded-b-xl ${
                        i === autocompleteIndex ? 'bg-[var(--qa-hover)]' : ''
                      }`}
                    >
                      <span className="font-mono text-sm font-medium text-[var(--qa-accent)]">/{cmd.id}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-[var(--qa-text-dim)]">{cmd.description}</span>
                    </button>
                  ))}
                </div>
              )}

            <div className="flex items-end gap-2.5 rounded-[14px] border border-[oklch(0.3_0.014_262)] bg-[var(--qa-panel)] p-2.5 shadow-[0_12px_34px_-18px_#000] transition focus-within:border-[var(--qa-accent)]/50">
              <div className="relative" ref={attachMenuRef}>
                <button
                  type="button"
                  onClick={() => setAttachMenuOpen((o) => !o)}
                  title="Attach files"
                  aria-label="Attach files"
                  className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-[var(--qa-text-dim)] transition hover:bg-[oklch(0.24_0.013_262)] hover:text-[oklch(0.9_0.008_262)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-accent)]/60"
                >
                  <PaperclipIcon />
                </button>
                {attachMenuOpen && (
                  <div className="absolute bottom-full left-0 mb-2 w-36 overflow-hidden rounded-xl border border-[var(--qa-border)] bg-[oklch(0.2_0.011_262)] shadow-lg">
                    <button
                      type="button"
                      onClick={() => {
                        setAttachMenuOpen(false);
                        fileInputRef.current?.click();
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-[oklch(0.86_0.008_262)] hover:bg-[var(--qa-hover)]"
                    >
                      Files
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachMenuOpen(false);
                        folderInputRef.current?.click();
                      }}
                      className="block w-full px-3 py-2 text-left text-sm text-[oklch(0.86_0.008_262)] hover:bg-[var(--qa-hover)]"
                    >
                      Folder
                    </button>
                  </div>
                )}
              </div>

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (commandSuggestions.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setAutocompleteIndex((i) => Math.min(commandSuggestions.length - 1, i + 1));
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setAutocompleteIndex((i) => Math.max(0, i - 1));
                      return;
                    }
                    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                      e.preventDefault();
                      acceptSuggestion(commandSuggestions[Math.min(autocompleteIndex, commandSuggestions.length - 1)]);
                      return;
                    }
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                placeholder="Ask, or type / for a command…"
                aria-label="Message"
                className="max-h-40 min-h-[30px] flex-1 resize-none self-center bg-transparent py-1.5 text-sm leading-[1.5] text-[oklch(0.94_0.006_262)] placeholder:text-[var(--qa-text-mute)] focus:outline-none"
              />
              {generatingHere ? (
                <button
                  onClick={stop}
                  aria-label={stopConfirm.confirming ? 'Click again to stop — this run has already written files' : 'Stop'}
                  className="flex-shrink-0 rounded-[9px] px-4 py-2 text-sm font-medium text-[oklch(0.9_0.06_25)] transition active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-red)]/60"
                  style={
                    stopConfirm.confirming
                      ? { background: 'oklch(0.5 0.19 25)', border: '1px solid oklch(0.6 0.19 25)' }
                      : { background: 'oklch(0.32 0.09 25)', border: '1px solid oklch(0.45 0.12 25)' }
                  }
                >
                  {stopConfirm.confirming ? 'Confirm stop?' : 'Stop'}
                </button>
              ) : (
                <button
                  onClick={send}
                  disabled={
                    (!input.trim() && !attachments.some((a) => a.status === 'done')) ||
                    Boolean(liveConversationId) ||
                    attachments.some((a) => a.status === 'uploading')
                  }
                  className="flex-shrink-0 rounded-[9px] bg-[var(--qa-btn)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--qa-btn-hover)] active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-[oklch(0.28_0.02_262)] disabled:text-[var(--qa-text-mute)] disabled:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-accent)]/60"
                >
                  Send
                </button>
              )}
            </div>
            </div>

            <div className="mt-2.5 flex items-center gap-3.5 px-1 font-mono text-2xs text-[var(--qa-text-mute)]">
              {['run-tests', 'from-ticket', 'automate', 'stakeholder-report'].map((cmd) => (
                <button
                  key={cmd}
                  onClick={() => setInput(`/${cmd} `)}
                  className="hidden transition-colors hover:text-[var(--qa-accent)] sm:inline"
                >
                  /{cmd}
                </button>
              ))}
              {liveConversationId && liveConversationId !== activeConversationId ? (
                <span className="ml-auto text-[var(--qa-amber)]">Another conversation is generating…</span>
              ) : (
                <span className="ml-auto">⏎ send · ⇧⏎ newline</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
