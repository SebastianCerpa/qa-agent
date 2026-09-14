// Shared "last result" indicator — same ✓ / ✕ / ○ grammar AssistantTurn.tsx's
// StepRow already uses for tool-call state, so pass/fail reads by shape, not
// only by the red/green color pairing colorblind users can't distinguish.
export type RunResult = 'ok' | 'error' | 'pending';

const GLYPH: Record<RunResult, string> = { ok: '✓', error: '✕', pending: '○' };

const COLOR: Record<RunResult, string> = {
  ok: 'var(--qa-green)',
  error: 'var(--qa-red)',
  pending: 'var(--qa-text-mute)',
};

export function runResultLabel(result: RunResult): string {
  return result === 'ok' ? 'passed' : result === 'error' ? 'failed' : 'pending';
}

export function RunStatusGlyph({ result, size = 13 }: { result: RunResult; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex flex-none items-center justify-center rounded-full border font-mono leading-none"
      style={{
        height: size,
        width: size,
        fontSize: Math.round(size * 0.6),
        color: COLOR[result],
        borderColor: COLOR[result],
      }}
    >
      {GLYPH[result]}
    </span>
  );
}
