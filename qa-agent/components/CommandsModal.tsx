'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export interface CommandInfo {
  id: string;
  description: string;
  argumentHint: string;
  argsRequired: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onUseCommand: (id: string) => void;
  commands: CommandInfo[] | null;
  error: string | null;
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

// Purely a display grouping for scannability — the backend command registry
// has no notion of category, so this list is maintained by hand alongside it.
const CATEGORY_BY_ID: Record<string, string> = {
  'run-tests': 'Run & fix',
  'fix-tests': 'Run & fix',
  'hunt-flaky': 'Run & fix',
  'pre-release-check': 'Run & fix',
  'test-ticket': 'Run & fix',
  automate: 'Write & refactor',
  refactor: 'Write & refactor',
  'review-pr': 'Review & audit',
  'audit-specs': 'Review & audit',
  'plan-test-cases': 'Plan & report',
  'from-ticket': 'Plan & report',
  'file-bug': 'Plan & report',
  'stakeholder-report': 'Plan & report',
  troubleshoot: 'Troubleshoot & docs',
  'docs-lookup': 'Troubleshoot & docs',
};
const CATEGORY_ORDER = ['Run & fix', 'Write & refactor', 'Review & audit', 'Plan & report', 'Troubleshoot & docs'];

function groupByCategory(commands: CommandInfo[]): [string, CommandInfo[]][] {
  const buckets = new Map<string, CommandInfo[]>();
  for (const cmd of commands) {
    const category = CATEGORY_BY_ID[cmd.id] ?? 'Other';
    if (!buckets.has(category)) buckets.set(category, []);
    buckets.get(category)!.push(cmd);
  }
  return [...CATEGORY_ORDER, 'Other']
    .filter((c) => buckets.has(c))
    .map((c) => [c, buckets.get(c)!]);
}

export default function CommandsModal({ open, onClose, onUseCommand, commands, error }: Props) {
  const [query, setQuery] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  const [activeIndex, setActiveIndex] = useState(0);
  const [prevQuery, setPrevQuery] = useState(query);
  const searchRef = useRef<HTMLInputElement>(null);

  // Reset the search on each open, and the highlighted option on every query
  // change — both adjusted during render (not an effect) per
  // https://react.dev/learn/you-might-not-need-an-effect#resetting-state-when-a-prop-changes.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setQuery('');
  }
  if (query !== prevQuery) {
    setPrevQuery(query);
    setActiveIndex(0);
  }

  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    if (!commands) return null;
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.id.toLowerCase().includes(q) || c.description.toLowerCase().includes(q));
  }, [commands, query]);

  const grouped = useMemo(() => (filtered ? groupByCategory(filtered) : []), [filtered]);
  const flatCommands = useMemo(() => grouped.flatMap(([, items]) => items), [grouped]);
  const activeCommand = flatCommands[Math.min(activeIndex, flatCommands.length - 1)];

  useEffect(() => {
    if (!activeCommand) return;
    document.getElementById(`cmd-option-${activeCommand.id}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeCommand]);

  if (!open) return null;

  function select(id: string) {
    onUseCommand(id);
    onClose();
  }

  return (
    <div
      onClick={onClose}
      className="animate-qa-fade-in fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Available commands"
        className="animate-qa-modal-in flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--qa-border)] bg-[oklch(0.155_0.01_262)] shadow-2xl backdrop-blur"
      >
        <div className="flex items-center gap-3 border-b border-[var(--qa-border-soft)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-[var(--qa-text)]">Available commands</h2>
            <p className="text-xs text-[var(--qa-text-mute)]">What Qualitech can do right now</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[var(--qa-text-mute)] transition hover:bg-[var(--qa-hover)] hover:text-[var(--qa-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-accent)]/60"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-[var(--qa-border-soft)] px-5 py-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--qa-text-mute)]" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (flatCommands.length === 0) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActiveIndex((i) => Math.min(flatCommands.length - 1, i + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActiveIndex((i) => Math.max(0, i - 1));
                } else if (e.key === 'Enter') {
                  select((activeCommand ?? flatCommands[0]).id);
                }
              }}
              type="text"
              placeholder="Search commands…"
              aria-label="Search commands"
              role="combobox"
              aria-expanded
              aria-controls="commands-listbox"
              aria-activedescendant={activeCommand ? `cmd-option-${activeCommand.id}` : undefined}
              className="w-full rounded-lg border border-[oklch(0.25_0.012_262)] bg-[var(--qa-panel-sunken)] py-2 pl-8 pr-2 text-sm text-[oklch(0.9_0.008_262)] placeholder:text-[var(--qa-text-mute)] focus:border-[var(--qa-accent)]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-accent)]/60"
            />
          </div>
        </div>

        <div id="commands-listbox" role="listbox" aria-label="Commands" className="scroll-thin flex-1 overflow-y-auto p-3">
          {error && <p className="px-2 py-4 text-sm text-[oklch(0.75_0.13_25)]">{error}</p>}
          {!error && !commands && <p className="px-2 py-4 text-sm text-[var(--qa-text-mute)]">Loading…</p>}
          {filtered && filtered.length === 0 && (
            <p className="px-2 py-4 text-sm text-[var(--qa-text-mute)]">No commands match &ldquo;{query}&rdquo;.</p>
          )}

          {grouped.map(([category, items]) => (
            <div key={category} className="mb-3">
              <p className="px-2 pb-1.5 font-mono text-xs uppercase tracking-[0.08em] text-[var(--qa-text-mute)]">{category}</p>
              {items.map((cmd) => {
                const isActive = cmd.id === activeCommand?.id;
                return (
                  <button
                    key={cmd.id}
                    id={`cmd-option-${cmd.id}`}
                    role="option"
                    aria-selected={isActive}
                    onClick={() => select(cmd.id)}
                    onMouseEnter={() => setActiveIndex(flatCommands.findIndex((c) => c.id === cmd.id))}
                    className={`mb-1.5 block w-full rounded-lg border px-3.5 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-accent)]/60 ${
                      isActive
                        ? 'border-[var(--qa-accent)]/50 bg-[var(--qa-hover)]'
                        : 'border-[var(--qa-border)] bg-[oklch(0.2_0.011_262)] hover:border-[var(--qa-accent)]/40 hover:bg-[var(--qa-hover)]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-[var(--qa-accent)]">/{cmd.id}</span>
                      {cmd.argsRequired && (
                        <span className="rounded-full border border-[var(--qa-border)] bg-[var(--qa-panel-sunken)] px-1.5 py-[3px] font-mono text-2xs uppercase tracking-wide text-[var(--qa-text-mute)]">
                          needs input
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--qa-text-dim)]">{cmd.description}</p>
                    {cmd.argumentHint && (
                      <p className="mt-1 truncate font-mono text-xs text-[var(--qa-text-mute)]">
                        /{cmd.id} {cmd.argumentHint}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="border-t border-[var(--qa-border-soft)] px-5 py-3 text-xs text-[var(--qa-text-mute)]">
          Click a command, or use <kbd className="rounded border border-[var(--qa-border)] bg-black/30 px-1 py-0.5">↑↓</kbd> and{' '}
          <kbd className="rounded border border-[var(--qa-border)] bg-black/30 px-1 py-0.5">Enter</kbd> to select.
        </div>
      </div>
    </div>
  );
}
