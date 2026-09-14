'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RunStatusGlyph } from './RunStatusGlyph';
import BrandMark from './BrandMark';
import { useConfirmHold } from '@/lib/useConfirmHold';

export interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
  pinned: boolean;
  lastResult?: 'ok' | 'error';
}

const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 480;
const DEFAULT_SIDEBAR_WIDTH = 264; // matches the design mock
const SIDEBAR_WIDTH_STORAGE_KEY = 'qa-agent-sidebar-width';

function clampSidebarWidth(width: number) {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

interface Props {
  conversations: ConversationSummary[];
  activeId: string | null;
  liveConversationId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-.87 14a2 2 0 0 1-2 1.86H6.87a2 2 0 0 1-2-1.86L4 6h16Z" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

type SectionKey = 'Pinned' | 'Today' | 'Yesterday' | 'Previous 7 Days' | 'Older';

function bucketOf(updatedAt: number): Exclude<SectionKey, 'Pinned'> {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  const sevenDaysAgo = startOfToday - 7 * 86_400_000;

  if (updatedAt >= startOfToday) return 'Today';
  if (updatedAt >= startOfYesterday) return 'Yesterday';
  if (updatedAt >= sevenDaysAgo) return 'Previous 7 Days';
  return 'Older';
}

// Compact relative label for the row meta column (mock shows e.g. "2h").
function relTime(updatedAt: number): string {
  const diff = Date.now() - updatedAt;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

function groupConversations(conversations: ConversationSummary[]): [SectionKey, ConversationSummary[]][] {
  const pinned = conversations.filter((c) => c.pinned);
  const rest = conversations.filter((c) => !c.pinned);

  const buckets: Record<Exclude<SectionKey, 'Pinned'>, ConversationSummary[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 Days': [],
    Older: [],
  };
  for (const c of rest) buckets[bucketOf(c.updatedAt)].push(c);

  const groups: [SectionKey, ConversationSummary[]][] = [];
  if (pinned.length) groups.push(['Pinned', pinned]);
  (['Today', 'Yesterday', 'Previous 7 Days', 'Older'] as const).forEach((key) => {
    if (buckets[key].length) groups.push([key, buckets[key]]);
  });
  return groups;
}

function ConversationRow({
  conversation,
  isActive,
  isLive,
  onSelect,
  onDelete,
  onTogglePin,
}: {
  conversation: ConversationSummary;
  isActive: boolean;
  isLive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const deleteConfirm = useConfirmHold();

  function handleDeleteClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (deleteConfirm.trigger()) onDelete();
  }

  // The row's resting/hover background — reused as the gradient stop so the
  // hover action zone fades cleanly out of the same surface it sits on
  // instead of overlapping the title with a hard-edged overlay.
  const rowBg = isActive ? 'var(--qa-active)' : 'oklch(0.22 0.013 262)';

  return (
    <div
      className={`group relative rounded-[9px] transition-colors duration-150 ${
        isActive ? 'bg-[var(--qa-active)]' : 'hover:bg-[oklch(0.22_0.013_262)]'
      }`}
    >
      {/* Selected-item accent rail — the idiomatic "you are here" cue for a
          nav sidebar (Linear/VS Code/Slack), an inset element rather than a
          border so it never nudges the row's own layout. */}
      {isActive && (
        <span
          aria-hidden
          className="absolute left-0 top-1/2 h-[18px] w-[2.5px] -translate-y-1/2 rounded-r-full"
          style={{ background: 'var(--qa-accent)' }}
        />
      )}
      <button
        onClick={onSelect}
        title={conversation.title}
        className={`flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-accent)]/60 focus-visible:ring-inset ${
          isActive ? 'font-medium text-[oklch(0.96_0.006_262)]' : 'text-[oklch(0.78_0.008_262)]'
        }`}
      >
        {/* Fixed-width slot keeps the title's left edge steady whether the
            indicator is the 6px live dot or the 11px result glyph. */}
        <span className="flex w-3 flex-none items-center justify-center">
          {isLive ? (
            <span className="h-[6px] w-[6px] rounded-full animate-qa-pulse" style={{ background: 'var(--qa-accent)' }} />
          ) : (
            <RunStatusGlyph result={conversation.lastResult ?? 'pending'} size={11} />
          )}
        </span>
        <span className="flex-1 truncate">{conversation.title}</span>
        <span
          className="font-mono text-2xs tabular-nums transition-opacity duration-150 group-hover:opacity-0 group-focus-within:opacity-0"
          style={{ color: isLive ? 'var(--qa-accent)' : 'var(--qa-text-mute)' }}
        >
          {isLive ? 'live' : relTime(conversation.updatedAt)}
        </span>
      </button>
      {/* Hover action zone: fades in over a gradient of the row's own bg, so
          the title slides under it instead of colliding — no permanent
          right-gutter reserved on every resting row. */}
      <div
        className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-0.5 pl-7 pr-1.5 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
        style={{ background: `linear-gradient(to left, ${rowBg} 62%, transparent)` }}
      >
        {!deleteConfirm.confirming && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            aria-label={conversation.pinned ? 'Unpin conversation' : 'Pin conversation'}
            title={conversation.pinned ? 'Unpin' : 'Pin'}
            className={`rounded p-1 hover:bg-[var(--qa-hover)] hover:text-[var(--qa-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-accent)]/60 ${
              conversation.pinned ? 'text-[var(--qa-accent)]' : 'text-[var(--qa-text-mute)]'
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
              <path d="M8 1a1 1 0 0 1 1 1v3.382l2.447 4.894A1 1 0 0 1 10.553 12H9v2a1 1 0 1 1-2 0v-2H5.447a1 1 0 0 1-.894-1.724L7 5.382V2a1 1 0 0 1 1-1Z" />
            </svg>
          </button>
        )}
        <button
          onClick={handleDeleteClick}
          onBlur={deleteConfirm.cancel}
          aria-label={deleteConfirm.confirming ? 'Click again to permanently delete this conversation' : 'Delete conversation'}
          title={deleteConfirm.confirming ? 'Click again to confirm' : 'Delete'}
          className={
            deleteConfirm.confirming
              ? 'flex items-center gap-1 rounded px-1.5 py-1 font-mono text-2xs font-medium text-white bg-[var(--qa-red)] transition-colors hover:bg-[oklch(0.6_0.19_25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-red)]/70'
              : 'rounded p-1 text-[var(--qa-text-mute)] hover:bg-[var(--qa-hover)] hover:text-[var(--qa-red)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-accent)]/60'
          }
        >
          <TrashIcon className="h-3.5 w-3.5 flex-shrink-0" />
          {deleteConfirm.confirming && 'Confirm'}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  conversations,
  activeId,
  liveConversationId,
  onSelect,
  onDelete,
  onTogglePin,
}: {
  title: SectionKey;
  conversations: ConversationSummary[];
  activeId: string | null;
  liveConversationId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mt-4 first:mt-1">
      <button
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-1.5 rounded px-2 pb-1 pt-1 font-mono text-2xs uppercase tracking-[0.08em] text-[var(--qa-text-mute)] transition-colors hover:text-[oklch(0.78_0.012_262)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-accent)]/60"
      >
        <svg
          viewBox="0 0 16 16"
          className={`h-2.5 w-2.5 flex-none fill-current transition-transform duration-150 ${collapsed ? '-rotate-90' : ''}`}
        >
          <path d="M4 6l4 4 4-4H4z" />
        </svg>
        <span>{title}</span>
        <span className="ml-auto tabular-nums text-[var(--qa-text-mute)]/70">{conversations.length}</span>
      </button>
      {!collapsed && (
        <div className="mt-0.5 flex flex-col gap-px">
          {conversations.map((c) => (
            <ConversationRow
              key={c.id}
              conversation={c}
              isActive={c.id === activeId}
              isLive={c.id === liveConversationId}
              onSelect={() => onSelect(c.id)}
              onDelete={() => onDelete(c.id)}
              onTogglePin={() => onTogglePin(c.id, !c.pinned)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({
  conversations,
  activeId,
  liveConversationId,
  onSelect,
  onNewChat,
  onDelete,
  onTogglePin,
  mobileOpen,
  onCloseMobile,
}: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, query]);

  const groups = useMemo(() => groupConversations(filtered), [filtered]);

  // Real signal, not a placeholder: the last 10 conversations' own persisted
  // result (lib/conversationStore.ts's deriveLastResult), read straight off
  // the index this component already has in memory — no extra fetch.
  const recentPulse = useMemo(() => {
    const recent = conversations.slice(0, 10);
    const failed = recent.filter((c) => c.lastResult === 'error').length;
    return { checked: recent.length, failed, lastActivityAt: conversations[0]?.updatedAt ?? null };
  }, [conversations]);

  const [width, setWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const widthRef = useRef(width);
  widthRef.current = width;

  useEffect(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    if (Number.isFinite(stored) && stored > 0) setWidth(clampSidebarWidth(stored));
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    document.body.classList.add('cursor-col-resize', 'select-none');
    return () => document.body.classList.remove('cursor-col-resize', 'select-none');
  }, [isResizing]);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widthRef.current;
    setIsResizing(true);

    function onMouseMove(ev: MouseEvent) {
      setWidth(clampSidebarWidth(startWidth + (ev.clientX - startX)));
    }
    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      setIsResizing(false);
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(widthRef.current));
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  return (
    <>
      {mobileOpen && (
        <div
          onClick={onCloseMobile}
          aria-hidden
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        style={{ width }}
        className={`fixed inset-y-0 left-0 z-40 flex h-full flex-shrink-0 flex-col border-r border-[var(--qa-border)] bg-[var(--qa-sidebar)] transition-transform duration-200 ease-out lg:relative lg:z-0 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div
          onMouseDown={startResize}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          className={`absolute right-0 top-0 z-10 hidden h-full w-1 cursor-col-resize transition-colors hover:bg-[var(--qa-accent)]/50 lg:block ${
            isResizing ? 'bg-[var(--qa-accent)]/60' : ''
          }`}
        />

        {/* brand */}
        <div className="flex items-center gap-2.5 px-3.5 pb-3 pt-4">
          <BrandMark unique="sidebar" className="h-[30px] w-[30px] flex-none rounded-[9px]" />
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-[-0.01em] text-[var(--qa-text)]">Qualitech</div>
          </div>
          <button
            onClick={onCloseMobile}
            aria-label="Close sidebar"
            className="ml-auto flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[var(--qa-text-dim)] transition hover:bg-[var(--qa-hover)] hover:text-[oklch(0.92_0.008_262)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-accent)]/60 lg:hidden"
          >
            ✕
          </button>
        </div>

        {/* new chat */}
        <div className="px-3 pb-2.5">
          <button
            onClick={() => {
              onNewChat();
              onCloseMobile();
            }}
            className="flex w-full items-center gap-2 rounded-[9px] border border-[var(--qa-newchat-border)] bg-[var(--qa-newchat)] px-3 py-2.5 text-sm font-medium text-[oklch(0.94_0.02_255)] transition hover:bg-[var(--qa-newchat-hover)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-accent)]/60"
          >
            <span className="text-[15px] leading-none">+</span>New chat
          </button>
        </div>

        {/* search */}
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 rounded-lg border border-[oklch(0.25_0.012_262)] bg-[var(--qa-panel-sunken)] px-2.5 py-2 transition-colors focus-within:border-[var(--qa-accent)]/40">
            <SearchIcon className="h-3.5 w-3.5 flex-none text-[var(--qa-text-mute)]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="text"
              placeholder="Search runs, tickets, specs"
              aria-label="Search conversations"
              className="min-w-0 flex-1 border-0 bg-transparent text-xs text-[oklch(0.9_0.008_262)] outline-none placeholder:text-[var(--qa-text-mute)]"
            />
          </div>
        </div>

        {/* conversation list */}
        <nav className="scroll-thin flex-1 overflow-y-auto px-2 pb-3">
          {conversations.length === 0 && <p className="px-3 py-4 text-xs text-[var(--qa-text-mute)]">No conversations yet.</p>}
          {conversations.length > 0 && filtered.length === 0 && (
            <p className="px-3 py-4 text-xs text-[var(--qa-text-mute)]">No conversations match &ldquo;{query}&rdquo;.</p>
          )}

          {groups.map(([key, items]) => (
            <Section
              key={key}
              title={key}
              conversations={items}
              activeId={activeId}
              liveConversationId={liveConversationId}
              onSelect={(id) => {
                onSelect(id);
                onCloseMobile();
              }}
              onDelete={onDelete}
              onTogglePin={onTogglePin}
            />
          ))}
        </nav>

        {/* footer — session pulse, replacing a static "Local session" profile
            block that carried no information in a single-user local tool */}
        <div className="flex items-center gap-2.5 border-t border-[var(--qa-border-soft)] px-3.5 py-2.5">
          <span
            className="h-[7px] w-[7px] flex-none rounded-full"
            style={{ background: recentPulse.failed > 0 ? 'var(--qa-red)' : 'var(--qa-green)' }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-[var(--qa-text)]">
              {recentPulse.checked === 0
                ? 'No runs yet'
                : recentPulse.failed > 0
                  ? `${recentPulse.failed} failed of last ${recentPulse.checked}`
                  : `Last ${recentPulse.checked} runs clean`}
            </div>
            <div className="font-mono text-2xs text-[var(--qa-text-mute)]">
              {recentPulse.lastActivityAt ? `active ${relTime(recentPulse.lastActivityAt)} ago` : 'checkly-test'}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
