'use client';

import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import BrandMark from './BrandMark';
import type { LogEntry } from '@/lib/streamReducer';

function isHttpUrl(url?: string): boolean {
  if (!url) return false;
  try {
    // base is only there to let a relative URL parse; we reject those below too.
    const parsed = new URL(url, 'http://reject-relative.invalid');
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// react-markdown doesn't restrict img/a schemes itself.
function SafeImage({ src, alt }: { src?: string | Blob; alt?: string }) {
  const [revealed, setRevealed] = useState(false);
  const safeSrc = typeof src === 'string' ? src : undefined;
  if (!isHttpUrl(safeSrc)) {
    return <span className="text-xs italic text-[oklch(0.55_0.012_262)]">[image blocked — unsafe URL]</span>;
  }
  if (!revealed) {
    return (
      <button
        onClick={() => setRevealed(true)}
        className="rounded border border-[oklch(0.29_0.013_262)] bg-[oklch(0.175_0.01_262)] px-2 py-1 text-xs text-[oklch(0.7_0.01_262)] hover:bg-[oklch(0.22_0.012_262)]"
      >
        Show image{alt ? `: ${alt}` : ''}
      </button>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={safeSrc} alt={alt ?? ''} className="max-w-full rounded" />;
}

function SafeLink({ href, children }: { href?: string; children?: ReactNode }) {
  if (!isHttpUrl(href)) return <span className="italic text-[oklch(0.55_0.012_262)]">{children}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="text-[oklch(0.74_0.13_250)] underline hover:text-[oklch(0.84_0.11_248)]">
      {children}
    </a>
  );
}

const TABLE_CLASS = [
  '!my-0 w-full min-w-[540px] border-collapse text-left text-sm',
  // header
  '[&_thead]:bg-[oklch(0.155_0.01_262)] [&_thead_tr]:border-b [&_thead_tr]:border-[var(--qa-border)]',
  '[&_th]:whitespace-nowrap [&_th]:px-4 [&_th]:py-2.5 [&_th]:align-bottom [&_th]:font-mono [&_th]:text-2xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-[0.06em] [&_th]:text-[var(--qa-text-mute)]',
  // body
  '[&_td]:px-4 [&_td]:py-2.5 [&_td]:align-top [&_td]:leading-[1.5] [&_td]:text-[var(--qa-text-dim)]',
  '[&_tbody_tr]:border-t [&_tbody_tr]:border-[var(--qa-border-hair)] [&_tbody_tr:hover]:bg-[oklch(0.19_0.011_262)]',
  // keep status + duration compact; let the rest wrap
  '[&_td:first-child]:whitespace-nowrap [&_td:first-child]:font-mono [&_td:first-child]:text-[var(--qa-text-2)]',
].join(' ');

function ScrollableTable({ children }: { children?: ReactNode }) {
  return (
    <div className="scroll-thin my-3 overflow-x-auto rounded-xl border border-[var(--qa-border)] bg-[var(--qa-panel)]">
      <table className={TABLE_CLASS}>{children}</table>
    </div>
  );
}

// react-markdown v10 no longer passes an `inline` flag — recover the raw text
// so we can tell a fenced block from inline code and drive the copy button.
function childrenToString(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(childrenToString).join('');
  if (typeof node === 'object' && 'props' in node) {
    return childrenToString((node as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function RetryIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3 12a9 9 0 1 1 3.02 6.75" />
      <path d="M3 16v-4h4" />
    </svg>
  );
}

function ChevronIcon({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`transition-transform duration-150 ${open ? 'rotate-90' : ''} ${className ?? ''}`}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

// A fenced code block styled like an editor pane: title bar with window dots,
// the language tag, and a copy button. Raw text only — never markdown-parsed.
function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(code).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-[var(--qa-border)] bg-[var(--qa-panel-code)]">
      <div className="flex items-center gap-2 border-b border-[var(--qa-border-hair)] bg-[oklch(0.155_0.01_262)] px-3 py-1.5">
        <span className="flex items-center gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'oklch(0.66 0.17 25)' }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'oklch(0.82 0.14 80)' }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'oklch(0.76 0.15 155)' }} />
        </span>
        <span className="ml-1 font-mono text-2xs uppercase tracking-[0.08em] text-[var(--qa-text-mute)]">{lang}</span>
        <button
          type="button"
          onClick={copy}
          aria-label="Copy code"
          className="ml-auto flex items-center gap-1 rounded-md border border-[var(--qa-border)] px-1.5 py-0.5 font-mono text-2xs text-[var(--qa-text-dim)] transition-colors hover:border-[var(--qa-accent)]/40 hover:text-[var(--qa-text-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-accent)]/60"
        >
          {copied ? <CheckIcon className="h-3 w-3 text-[var(--qa-green)]" /> : <CopyIcon className="h-3 w-3" />}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="scroll-thin !my-0 overflow-x-auto !bg-transparent px-3.5 py-3 font-mono text-xs leading-[1.7] text-[oklch(0.82_0.01_262)]">
        <code className="!bg-transparent !p-0 !text-inherit">{code}</code>
      </pre>
    </div>
  );
}

function MarkdownCode({ className, children }: { className?: string; children?: ReactNode }) {
  const text = childrenToString(children);
  const isBlock = /language-/.test(className ?? '') || text.includes('\n');

  if (!isBlock) {
    return (
      <code className="rounded-[5px] border border-[var(--qa-border)] bg-[var(--qa-panel-sunken)] px-1.5 py-0.5 font-mono text-[0.85em] text-[#FF9500] before:content-none after:content-none">
        {children}
      </code>
    );
  }

  const lang = (className ?? '').replace(/language-/, '').trim() || 'text';
  return <CodeBlock lang={lang} code={text.replace(/\n$/, '')} />;
}

// react-markdown wraps fenced blocks in <pre><code>. We render the whole block
// from the <code> override, so <pre> just passes its child through unstyled.
function MarkdownPre({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

const markdownComponents = {
  img: SafeImage,
  a: SafeLink,
  table: ScrollableTable,
  code: MarkdownCode,
  pre: MarkdownPre,
};

// Typography tuned to the QA palette for a clean, professional dev read:
// tight headings, accent links, accent list markers, quiet quotes/tables.
const PROSE_CLASS = [
  'prose prose-invert prose-sm max-w-none',
  // min-w-0 lets this (a flex child of the row below) shrink below its
  // content's min-content width — without it a wide child like a code block
  // or table forces the whole column wide and the chat pane grows a
  // horizontal scrollbar. break-words wraps long unbroken strings (URLs,
  // file paths, inline code) instead of letting them overflow.
  'min-w-0 break-words',
  'text-[oklch(0.9_0.006_262)]',
  'prose-p:my-2 prose-p:leading-[1.68]',
  'prose-headings:font-semibold prose-headings:tracking-[-0.01em] prose-headings:text-[var(--qa-text)] prose-headings:mt-4 prose-headings:mb-2',
  'prose-h1:text-[18px] prose-h2:text-[16px] prose-h3:text-[14px]',
  'prose-strong:text-[var(--qa-text)] prose-strong:font-semibold',
  'prose-a:text-[var(--qa-accent)] prose-a:font-medium prose-a:no-underline hover:prose-a:underline',
  'prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-li:marker:text-[var(--qa-accent)]/70',
  'prose-hr:border-[var(--qa-border)] prose-hr:my-4',
  'prose-blockquote:border-l-2 prose-blockquote:border-l-[var(--qa-accent)]/50 prose-blockquote:not-italic prose-blockquote:font-normal prose-blockquote:text-[var(--qa-text-dim)]',
].join(' ');

// Groups consecutive same-depth tool calls into one "Agent steps" card —
// depth boundaries stay separate blocks so subagent nesting is still legible.
type Block = { kind: 'steps'; depth: number; items: LogEntry[] } | { kind: 'entry'; entry: LogEntry };

function groupIntoBlocks(entries: LogEntry[]): Block[] {
  const blocks: Block[] = [];
  for (const entry of entries) {
    if (entry.kind === 'tool') {
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'steps' && last.depth === entry.depth) {
        last.items.push(entry);
        continue;
      }
      blocks.push({ kind: 'steps', depth: entry.depth, items: [entry] });
      continue;
    }
    blocks.push({ kind: 'entry', entry });
  }
  return blocks;
}

function toolName(text: string): string {
  return text.match(/^🔧 (\S+)/)?.[1] ?? text;
}

function toolDetail(text: string): string {
  return text.match(/^🔧 \S+ — (.*)$/)?.[1] ?? '';
}

// permission_denials carries no "reason" field (verified against real captured
// payloads, not guessed) — every denial in this app comes from the same
// structural cause (this project's own policy: state-mutating actions need a
// fresh explicit yes), so that's the one honest thing to say about "why".
// What varies per denial is which tool and which attempted action, read from
// tool_input's own fields rather than a raw JSON dump.
function describeDenial(denial: unknown): { tool: string; detail: string } {
  if (typeof denial !== 'object' || denial === null) return { tool: 'Unknown tool', detail: '' };
  const d = denial as { tool_name?: unknown; tool_input?: unknown };
  const tool = typeof d.tool_name === 'string' ? d.tool_name : 'Unknown tool';
  const input = typeof d.tool_input === 'object' && d.tool_input !== null ? (d.tool_input as Record<string, unknown>) : {};
  const detail =
    (typeof input.description === 'string' && input.description) ||
    (typeof input.command === 'string' && input.command) ||
    (typeof input.path === 'string' && input.path) ||
    '';
  return { tool, detail: detail.length > 140 ? `${detail.slice(0, 140)}…` : detail };
}

function StepRow({ entry, expanded, onToggle }: { entry: LogEntry; expanded: boolean; onToggle: () => void }) {
  const done = entry.toolResult !== undefined;
  const isError = Boolean(entry.toolResultIsError);
  const stateClass = isError
    ? 'border-[oklch(0.68_0.18_25)] text-[oklch(0.68_0.18_25)]'
    : done
      ? 'border-[oklch(0.76_0.15_155)] text-[oklch(0.76_0.15_155)]'
      : 'border-[oklch(0.74_0.13_250)] text-[oklch(0.74_0.13_250)] motion-safe:animate-pulse';
  const glyph = isError ? '✕' : done ? '✓' : '○';

  return (
    <div className="border-b border-[oklch(0.215_0.011_262)] last:border-b-0">
      <div className="flex items-center gap-2.5 px-3.5 py-2">
        <span
          role="img"
          aria-label={isError ? 'Step failed' : done ? 'Step succeeded' : 'Step running'}
          className={`flex h-[17px] w-[17px] flex-shrink-0 items-center justify-center rounded-full border text-2xs ${stateClass}`}
        >
          {glyph}
        </span>
        <span className="font-mono text-xs text-[oklch(0.86_0.008_262)]">{toolName(entry.text)}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-[oklch(0.62_0.012_262)]">{toolDetail(entry.text)}</span>
        {done && (
          <button
            type="button"
            onClick={onToggle}
            className="flex-shrink-0 rounded-md border border-[oklch(0.3_0.013_262)] px-2 py-0.5 font-mono text-2xs text-[oklch(0.7_0.01_262)] transition-colors hover:border-[oklch(0.42_0.09_252)] hover:text-[oklch(0.93_0.006_262)]"
          >
            {expanded ? 'hide' : 'output'}
          </button>
        )}
      </div>
      {/* Raw tool output — deliberately NEVER rendered through the markdown
          parser. This can be untrusted fetched-web content (docs-referencer),
          not just the model's own prose. */}
      {expanded && entry.toolResult && (
        <pre className="scroll-thin mx-3.5 mb-3 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[oklch(0.24_0.012_262)] bg-[oklch(0.125_0.009_262)] px-3 py-2.5 font-mono text-xs leading-relaxed text-[oklch(0.76_0.01_262)]">
          {entry.toolResult}
        </pre>
      )}
    </div>
  );
}

function StepsCard({ depth, items }: { depth: number; items: LogEntry[] }) {
  // Collapsed by default: a long run of tool calls (Bash/Read/Agent) would
  // otherwise flood the chat. The header stays a one-line summary — including a
  // failure count so errors are never silently hidden — and the rows (plus any
  // per-row output) are one click away.
  const [cardOpen, setCardOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const total = items.length;
  const doneCount = items.filter((i) => i.toolResult !== undefined).length;
  const errorCount = items.filter((i) => i.toolResultIsError).length;
  const running = doneCount < total;

  return (
    <div
      className="overflow-hidden rounded-xl border border-[oklch(0.26_0.013_262)] bg-[oklch(0.175_0.01_262)]"
      style={{ marginLeft: depth * 16 }}
    >
      <button
        type="button"
        onClick={() => setCardOpen((o) => !o)}
        aria-expanded={cardOpen}
        className={`flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[oklch(0.2_0.011_262)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-accent)]/50 ${
          cardOpen ? 'border-b border-[oklch(0.24_0.012_262)]' : ''
        }`}
      >
        <ChevronIcon open={cardOpen} className="h-3 w-3 flex-shrink-0 text-[oklch(0.55_0.012_262)]" />
        <span className="font-mono text-2xs uppercase tracking-[0.08em] text-[oklch(0.58_0.012_262)]">Agent steps</span>
        <span className="font-mono text-2xs tabular-nums text-[oklch(0.5_0.012_262)]">
          {running ? `${doneCount}/${total}` : `${total} step${total === 1 ? '' : 's'}`}
        </span>
        {running && <span className="h-1 w-1 flex-shrink-0 rounded-full bg-[oklch(0.74_0.13_250)] motion-safe:animate-pulse" />}
        {errorCount > 0 && (
          <span className="flex items-center gap-1 font-mono text-2xs tabular-nums text-[oklch(0.68_0.18_25)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[oklch(0.68_0.18_25)]" />
            {errorCount} failed
          </span>
        )}
        <span className="ml-auto font-mono text-2xs text-[oklch(0.45_0.012_262)]">{cardOpen ? 'hide' : 'show'}</span>
      </button>
      {cardOpen && (
        <div>
          {items.map((entry) => (
            <StepRow
              key={entry.id}
              entry={entry}
              expanded={expanded.has(entry.id)}
              onToggle={() =>
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(entry.id)) next.delete(entry.id);
                  else next.add(entry.id);
                  return next;
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

// An interactive approval prompt for a tool call the allow-list didn't cover.
// Buttons only render for a live turn (onDecision provided) that's still
// pending; a persisted/replayed prompt whose run already ended shows its
// outcome, or an "expired" note if it was never answered.
function PermissionPrompt({
  entry,
  onDecision,
}: {
  entry: LogEntry;
  onDecision?: (requestId: string, decision: 'allow' | 'deny') => void;
}) {
  const [submitting, setSubmitting] = useState<null | 'allow' | 'deny'>(null);
  const status = entry.permissionStatus ?? 'pending';
  const requestId = entry.permissionRequestId ?? '';
  const toolName = entry.permissionToolName ?? 'Tool';
  const command = typeof entry.permissionInput?.command === 'string' ? (entry.permissionInput.command as string) : undefined;
  const path = typeof entry.permissionInput?.path === 'string' ? (entry.permissionInput.path as string) : undefined;
  const detail = command ?? path;
  const decide = (d: 'allow' | 'deny') => {
    if (!onDecision || submitting) return;
    setSubmitting(d);
    onDecision(requestId, d);
  };

  if (status === 'allowed' || status === 'denied') {
    const allowed = status === 'allowed';
    return (
      <div
        className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs ${
          allowed
            ? 'border-[oklch(0.4_0.1_155)] bg-[oklch(0.2_0.04_155)] text-[oklch(0.82_0.13_155)]'
            : 'border-[oklch(0.4_0.1_25)] bg-[oklch(0.2_0.04_25)] text-[oklch(0.82_0.13_25)]'
        }`}
      >
        <span className="font-mono text-2xs uppercase tracking-[0.08em] opacity-80">{allowed ? 'Approved' : 'Denied'}</span>
        <span className="font-mono text-[oklch(0.86_0.008_262)]">{toolName}</span>
        {detail && <span className="min-w-0 flex-1 truncate font-mono text-[var(--qa-text-dim)]">{detail}</span>}
      </div>
    );
  }

  // status === 'pending'
  const interactive = Boolean(onDecision);
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--qa-border)] bg-[oklch(0.185_0.008_262)]">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <LockIcon className="h-3.5 w-3.5 flex-shrink-0 text-[var(--qa-text-dim)]" />
        <span className="font-mono text-2xs font-semibold uppercase tracking-[0.08em] text-[var(--qa-text-2)]">
          Permission needed
        </span>
        <span className="font-mono text-xs text-[var(--qa-text)]">{toolName}</span>
        {interactive ? (
          <span className="ml-auto h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--qa-text-dim)] motion-safe:animate-pulse" />
        ) : (
          <span className="ml-auto font-mono text-2xs text-[var(--qa-text-mute)]">expired</span>
        )}
      </div>

      {detail && (
        <pre className="scroll-thin mx-3.5 mb-2.5 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--qa-border-soft)] bg-[var(--qa-panel-sunken)] px-3 py-2 font-mono text-xs leading-relaxed text-[var(--qa-text-2)]">
          {detail}
        </pre>
      )}

      {interactive ? (
        <div className="flex items-center gap-2 border-t border-[var(--qa-border-hair)] px-3.5 py-2.5">
          <button
            type="button"
            onClick={() => decide('allow')}
            disabled={submitting !== null}
            className="rounded-lg bg-[oklch(0.6_0.15_155)] px-3.5 py-1.5 text-xs font-medium text-[oklch(0.15_0.02_155)] transition hover:bg-[oklch(0.66_0.16_155)] active:scale-[0.97] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.76_0.15_155)]/60"
          >
            {submitting === 'allow' ? 'Approving…' : 'Approve'}
          </button>
          <button
            type="button"
            onClick={() => decide('deny')}
            disabled={submitting !== null}
            className="rounded-lg border border-[oklch(0.45_0.12_25)] bg-[oklch(0.28_0.07_25)] px-3.5 py-1.5 text-xs font-medium text-[oklch(0.9_0.08_25)] transition hover:bg-[oklch(0.34_0.09_25)] active:scale-[0.97] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-red)]/60"
          >
            {submitting === 'deny' ? 'Denying…' : 'Deny'}
          </button>
          <span className="ml-auto font-mono text-2xs text-[var(--qa-text-mute)]">
            not covered by the allow-list
          </span>
        </div>
      ) : (
        <p className="border-t border-[var(--qa-border-hair)] px-3.5 py-2 text-2xs text-[var(--qa-text-mute)]">
          This prompt is no longer answerable — the run ended before it was approved.
        </p>
      )}
    </div>
  );
}

interface Props {
  entries: LogEntry[];
  streaming?: boolean;
  onRetry?: () => void;
  onPermissionDecision?: (requestId: string, decision: 'allow' | 'deny') => void;
}

export default function AssistantTurn({ entries, streaming, onRetry, onPermissionDecision }: Props) {
  const resultEntry = entries.find((e) => e.kind === 'result');
  const visible = entries.filter((e) => e.kind !== 'header' && e.kind !== 'result');
  const blocks = groupIntoBlocks(visible);
  const lastTextId = [...visible].reverse().find((e) => e.kind === 'text')?.id;

  // Coarse status for the screen-reader live region — announces phase changes
  // (working → responding → done/failed), NOT every streamed token, so it
  // stays legible to assistive tech during a multi-minute run instead of
  // reading the whole transcript aloud character by character. Empty once the
  // turn is idle so nothing is re-announced on a persisted render.
  // Only the live turn passes `streaming` (ChatView omits it on persisted
  // turns), so gating on `!== undefined` keeps a reloaded transcript from
  // re-announcing "Run complete." for every past turn on mount.
  const isLiveTurn = streaming !== undefined;
  const awaitingPermission = visible.some((e) => e.kind === 'permission' && (e.permissionStatus ?? 'pending') === 'pending');
  const runningStep = visible.some((e) => e.kind === 'tool' && e.toolResult === undefined);
  const liveStatus = !isLiveTurn
    ? ''
    : resultEntry
      ? resultEntry.meta?.isError
        ? 'Run failed.'
        : 'Run complete.'
      : awaitingPermission
        ? 'Waiting for your permission decision.'
        : runningStep
          ? 'Running a tool step…'
          : visible.some((e) => e.kind === 'text')
            ? 'Assistant is responding…'
            : 'Working…';

  return (
    <div className="flex gap-3" aria-busy={Boolean(streaming) && !resultEntry}>
      <BrandMark unique="turn" className="h-7 w-7 flex-shrink-0 rounded-lg" />

      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {liveStatus}
        </div>
        {blocks.map((block) => {
          if (block.kind === 'steps') {
            return (
              <div key={`steps-${block.items[0].id}`} className={isLiveTurn ? 'animate-qa-stream-in' : undefined}>
                <StepsCard depth={block.depth} items={block.items} />
              </div>
            );
          }

          const entry = block.entry;
          if (entry.kind === 'permission') {
            return (
              <div
                key={entry.id}
                className={isLiveTurn ? 'animate-qa-stream-in' : undefined}
                style={{ marginLeft: entry.depth * 16 }}
              >
                <PermissionPrompt entry={entry} onDecision={onPermissionDecision} />
              </div>
            );
          }
          if (entry.kind === 'status') {
            return (
              <p
                key={entry.id}
                className={`text-xs italic text-[oklch(0.58_0.012_262)]${isLiveTurn ? ' animate-qa-stream-in' : ''}`}
                style={{ marginLeft: entry.depth * 16 }}
              >
                {entry.text}
              </p>
            );
          }
          if (entry.kind === 'stderr') {
            return (
              <p
                key={entry.id}
                className={`font-mono text-xs text-[oklch(0.68_0.18_25)]${isLiveTurn ? ' animate-qa-stream-in' : ''}`}
                style={{ marginLeft: entry.depth * 16 }}
              >
                {entry.text}
              </p>
            );
          }
          if (entry.kind === 'error') {
            const isTransportError = Boolean(entry.meta?.transportError);
            return (
              <div
                key={entry.id}
                className={`flex flex-col items-start gap-2${isLiveTurn ? ' animate-qa-stream-in' : ''}`}
                style={{ marginLeft: entry.depth * 16 }}
              >
                <p className="text-sm font-medium text-[oklch(0.68_0.18_25)]">{entry.text}</p>
                {isTransportError && onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="flex items-center gap-1.5 rounded-lg border border-[oklch(0.4_0.1_25)] bg-[oklch(0.22_0.05_25)] px-3 py-1.5 text-xs font-medium text-[oklch(0.85_0.12_25)] transition hover:bg-[oklch(0.26_0.06_25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-red)]/60"
                  >
                    <RetryIcon className="h-3.5 w-3.5" />
                    Retry
                  </button>
                )}
              </div>
            );
          }
          // 'text'
          const isStreamingHere = Boolean(streaming) && entry.id === lastTextId && !entry.done;
          return (
            <div key={entry.id} className="flex items-end gap-0.5" style={{ marginLeft: entry.depth * 16 }}>
              {/* Inline, not a text-base class — prose-sm's own generated font-size
                  rule would win the cascade over a plain utility class here. */}
              {/* `qa-stream-live` (live turn only) fades each top-level block in as
                  it streams — the Claude-style reveal. Persisted turns omit it and
                  keep the single turn-level `qa-rise`, so the live→persisted swap
                  stays seamless. */}
              <div
                className={`${PROSE_CLASS}${isLiveTurn ? ' qa-stream-live' : ''}`}
                style={{ fontSize: '0.9375rem' }}
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {entry.text}
                </ReactMarkdown>
              </div>
              {isStreamingHere && (
                <span
                  aria-hidden
                  className="mb-0.5 inline-block h-[15px] w-[7px] flex-shrink-0 animate-caret bg-[oklch(0.74_0.13_250)]"
                />
              )}
            </div>
          );
        })}

        {streaming && !resultEntry && visible.length === 0 && (
          <div className="flex items-center gap-1 text-xs text-[oklch(0.55_0.012_262)]">
            <span>thinking</span>
            <span className="flex gap-0.5">
              <span className="animate-qa-think h-1 w-1 rounded-full bg-[oklch(0.55_0.012_262)] [animation-delay:-0.3s]" />
              <span className="animate-qa-think h-1 w-1 rounded-full bg-[oklch(0.55_0.012_262)] [animation-delay:-0.15s]" />
              <span className="animate-qa-think h-1 w-1 rounded-full bg-[oklch(0.55_0.012_262)]" />
            </span>
          </div>
        )}

        {resultEntry && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2.5 border-t border-[var(--qa-border-hair)] pt-2 font-mono text-2xs tabular-nums text-[var(--qa-text-mute)]">
            <span
              className={`flex items-center gap-1.5 ${
                resultEntry.meta?.isError ? 'text-[oklch(0.68_0.18_25)]' : 'text-[oklch(0.76_0.15_155)]'
              }`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: resultEntry.meta?.isError ? 'oklch(0.68 0.18 25)' : 'oklch(0.76 0.15 155)' }}
              />
              {resultEntry.meta?.isError ? 'failed' : 'done'}
            </span>
            {typeof resultEntry.meta?.durationMs === 'number' && (
              <span className="flex items-center gap-1.5">
                <span className="text-[oklch(0.4_0.012_262)]">·</span>
                {Math.round(resultEntry.meta.durationMs / 100) / 10}s
              </span>
            )}
            {typeof resultEntry.meta?.costUsd === 'number' && (
              <span className="flex items-center gap-1.5">
                <span className="text-[oklch(0.4_0.012_262)]">·</span>${resultEntry.meta.costUsd.toFixed(4)}
              </span>
            )}
          </div>
        )}

        {resultEntry?.meta?.permissionDenials && resultEntry.meta.permissionDenials.length > 0 && (
          <div className="rounded-lg border border-[var(--qa-border)] bg-[oklch(0.185_0.008_262)] p-2.5 text-xs text-[var(--qa-text-2)]">
            <div className="font-semibold">
              ⚠ {resultEntry.meta.permissionDenials.length} action{resultEntry.meta.permissionDenials.length === 1 ? '' : 's'} blocked
              pending your approval
            </div>
            <ul className="mt-1.5 flex flex-col gap-1">
              {resultEntry.meta.permissionDenials.map((denial, i) => {
                const { tool, detail } = describeDenial(denial);
                return (
                  <li key={i} className="flex gap-1.5">
                    <span className="font-mono font-medium text-[var(--qa-text)]">{tool}</span>
                    {detail && <span className="min-w-0 flex-1 truncate text-[var(--qa-text-dim)]">{detail}</span>}
                  </li>
                );
              })}
            </ul>
            <p className="mt-1.5 text-[var(--qa-text-dim)]">
              This project requires a fresh yes for actions like these. Re-run and approve when prompted.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
