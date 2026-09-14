'use client';

import { useEffect, useState } from 'react';

interface Props {
  title: string;
  isLive: boolean;
  startedAt: number | null;
  onOpenMenu: () => void;
  onOpenHelp: () => void;
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CommandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 4a2 2 0 1 0-2 2v12a2 2 0 1 0 2 2V4ZM15 4a2 2 0 1 1 2 2v12a2 2 0 1 1-2 2V4Z" />
      <path d="M7 9h10M7 15h10" />
    </svg>
  );
}

function RepoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

// Every command this tool can run operates against this one real repo (see
// this project's own CLAUDE.md) — surfaced persistently here instead of only
// in the composer's transient mutating-command banner, so "what am I about
// to touch" is never a question the user has to hold in their head.


function useElapsed(startedAt: number | null): string | null {
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  useEffect(() => {
    if (!startedAt) return;
    // Date.now() belongs here (a side effect), never in the render body —
    // the render below only ever reads the resulting state.
    const tick = () => setElapsedMs(Date.now() - startedAt);
    const id = window.setInterval(tick, 1000);
    tick();
    return () => window.clearInterval(id);
  }, [startedAt]);

  if (!startedAt || elapsedMs === null) return null;
  const seconds = Math.max(0, Math.round(elapsedMs / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export default function TopBar({ title, isLive, startedAt, onOpenMenu, onOpenHelp }: Props) {
  const elapsed = useElapsed(isLive ? startedAt : null);

  return (
    <header
      className="flex h-[50px] flex-none items-center gap-2.5 border-b border-[var(--qa-border-soft)] px-3 backdrop-blur-md sm:px-[18px]"
      style={{ background: 'oklch(0.155 0.01 262 / 0.7)' }}
    >
      <button
        onClick={onOpenMenu}
        aria-label="Open sidebar"
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--qa-text-dim)] transition hover:bg-[var(--qa-hover)] hover:text-[var(--qa-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-accent)]/60 lg:hidden"
      >
        <MenuIcon className="h-[18px] w-[18px]" />
      </button>

      {/* breadcrumb — run / <conversation title> */}
      <div className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-[var(--qa-text-dim)]">
        <span className="hidden sm:inline">run</span>
        <span className="hidden text-[oklch(0.4_0.012_262)] sm:inline">/</span>
        <span className="truncate text-[oklch(0.93_0.008_262)]">{title}</span>
      </div>

      {/* persistent target-repo context — was previously only implied by a
          transient banner that appeared after typing a mutating command */}
      <div
        className="hidden flex-shrink-0 items-center gap-1.5 rounded-full border border-[var(--qa-border)] px-2.5 py-1 font-mono text-2xs text-[var(--qa-text-mute)] md:flex"
        title="Commands run against this repo"
      >
       
        
      </div>

      {/* live/idle status pill */}
      <div
        className={`flex flex-shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-2xs uppercase tracking-[0.05em] transition-colors duration-200 ${
          isLive
            ? 'border-[oklch(0.4_0.09_250)] text-[oklch(0.84_0.1_250)]'
            : 'border-[var(--qa-border)] text-[var(--qa-text-mute)]'
        }`}
        style={isLive ? { background: 'oklch(0.25 0.045 254)' } : undefined}
      >
        <span
          className={`h-[5px] w-[5px] rounded-full ${isLive ? 'animate-qa-pulse' : ''}`}
          style={{ background: isLive ? 'oklch(0.72 0.16 250)' : 'oklch(0.5 0.012 262)' }}
        />
        {isLive ? 'Running' : 'Idle'}
        {elapsed && <span className="tabular-nums text-[oklch(0.7_0.09_250)]">· {elapsed}</span>}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={onOpenHelp}
          title="Commands (⌘K)"
          className="flex flex-shrink-0 items-center gap-2 rounded-lg border border-[var(--qa-border)] bg-[oklch(0.2_0.011_262)] px-2.5 py-1.5 text-xs text-[oklch(0.82_0.008_262)] transition hover:bg-[var(--qa-hover)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--qa-accent)]/60"
        >
          <CommandIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Commands</span>
          <span className="hidden font-mono text-2xs text-[var(--qa-text-mute)] md:inline">⌘K</span>
        </button>
      </div>
    </header>
  );
}
