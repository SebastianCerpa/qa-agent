import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Turn, Conversation, ConversationIndexEntry } from './types';

export type { Turn, Conversation, ConversationIndexEntry } from './types';

const DATA_DIR = process.env.QA_AGENT_DATA_DIR ?? path.join(process.cwd(), '.data');
const CONVERSATIONS_DIR = path.join(DATA_DIR, 'conversations');
const INDEX_PATH = path.join(DATA_DIR, 'index.json');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidConversationId(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
}

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  // Cheap insurance against a mid-write kill, which this app does routinely
  // (SIGTERM-then-SIGKILL escalation, HMR resets) — write-then-rename instead
  // of a direct write, so a crash mid-save can never leave a half-written file.
  const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function conversationPath(id: string): string {
  return path.join(CONVERSATIONS_DIR, `${id}.json`);
}

export async function readIndex(): Promise<ConversationIndexEntry[]> {
  await ensureDirs();
  return (await readJsonSafe<ConversationIndexEntry[]>(INDEX_PATH)) ?? [];
}

async function writeIndex(entries: ConversationIndexEntry[]): Promise<void> {
  await atomicWriteJson(INDEX_PATH, entries);
}

export async function conversationExists(id: string): Promise<boolean> {
  if (!isValidConversationId(id)) return false;
  return (await readIndex()).some((e) => e.id === id);
}

export async function getConversation(id: string): Promise<Conversation | null> {
  if (!isValidConversationId(id)) return null;
  const conversation = await readJsonSafe<Conversation>(conversationPath(id));
  return conversation ? { ...conversation, pinned: conversation.pinned ?? false } : null;
}

export async function listConversations(): Promise<ConversationIndexEntry[]> {
  const index = await readIndex();
  return index.map((e) => ({ ...e, pinned: e.pinned ?? false })).sort((a, b) => b.updatedAt - a.updatedAt);
}

// Human-readable action labels for the slash commands the QA team ships
// (mirrors lib/commands.ts COMMAND_IDS — kept inline so the store stays free
// of that module's filesystem read). Turns a raw first message like
// "/run-tests swap vehicle" into a topic-precise title ("Run tests · swap
// vehicle") instead of surfacing the command slug verbatim in the sidebar.
const COMMAND_TITLES: Record<string, string> = {
  'run-tests': 'Run tests',
  'fix-tests': 'Fix tests',
  automate: 'Automate',
  refactor: 'Refactor',
  'hunt-flaky': 'Flaky hunt',
  'review-pr': 'Review PR',
  'docs-lookup': 'Docs',
  troubleshoot: 'Troubleshoot',
  'stakeholder-report': 'Stakeholder report',
  'audit-specs': 'Audit specs',
  'plan-test-cases': 'Test plan',
  'from-ticket': 'Ticket',
  'file-bug': 'File bug',
  'pre-release-check': 'Pre-release check',
};

const TITLE_MAX = 56;

// Leading politeness/filler stripped from free-form messages so the title
// leads with the subject, not the preamble. Bilingual (the team works in
// English and Spanish) and conservative on purpose — only clauses that are
// almost always preamble, and only when real content follows.
const FILLER_PREFIX =
  /^(?:please\s+|can you\s+|could you\s+|would you\s+|hey,?\s+|hi,?\s+|por favor,?\s+|puedes\s+|podr[ií]as\s+|necesito que\s+|quiero que\s+|me gustar[ií]a que\s+|ay[uú]dame a\s+)/i;

function capitalizeFirst(s: string): string {
  // Only an ASCII lowercase lead — leaves acronyms and refs like "ENG-3026"
  // or "API" untouched.
  return s.replace(/^[a-z]/, (m) => m.toUpperCase());
}

function cleanTopic(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, '')
    .trim();
}

// Cut at a word boundary near the limit rather than mid-word, dropping any
// trailing punctuation before the ellipsis.
function truncateAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const slice = s.slice(0, max);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > max * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[\s.,;:!?—–-]+$/, '')}…`;
}

function deriveTitle(firstMessage: string): string {
  const trimmed = cleanTopic(firstMessage);
  if (!trimmed) return 'New chat';

  // Leading slash command → "action · subject" so the row reads as a topic
  // instead of a command slug.
  const command = trimmed.match(/^\/([a-z0-9-]+)\b\s*([\s\S]*)$/i);
  if (command) {
    const id = command[1].toLowerCase();
    const label = COMMAND_TITLES[id] ?? capitalizeFirst(id.replace(/-/g, ' '));
    const arg = cleanTopic(command[2]);
    if (!arg) return label;
    // "/from-ticket ENG-3026" reads as a noun phrase ("Ticket ENG-3026"),
    // not an action on a subject — no separator for a ticket lookup.
    if (id === 'from-ticket') return truncateAtWord(`${label} ${arg}`, TITLE_MAX);
    return truncateAtWord(`${label} · ${capitalizeFirst(arg)}`, TITLE_MAX);
  }

  // Free-form message → drop a leading opener (Spanish ¿/¡, list bullets) and
  // any polite filler, then capitalize and truncate at a word.
  const opened = trimmed.replace(/^[¿¡\-*•>\s]+/, '');
  const stripped = cleanTopic(opened.replace(FILLER_PREFIX, '')) || opened || trimmed;
  return truncateAtWord(capitalizeFirst(stripped), TITLE_MAX);
}

// Mirrors AssistantTurn.tsx's own reading of the persisted `result` entry —
// the index needs the same verdict so the sidebar/status strip can show it
// without re-fetching every conversation's full turn history.
function deriveLastResult(turn: Turn): 'ok' | 'error' | undefined {
  if (turn.role !== 'assistant') return undefined;
  const result = turn.entries?.find((e) => e.kind === 'result');
  if (!result) return undefined;
  return result.meta?.isError ? 'error' : 'ok';
}

// Called sequentially within one request's flow (user turn appended, then
// later the assistant turn once generation finishes) — never concurrently
// across two different in-flight requests, since runState only ever allows
// one generation globally at a time. That's what keeps this safe without
// per-file locking: the single-generation lock already serializes writers.
export async function appendTurn(conversationId: string, turn: Turn): Promise<Conversation> {
  await ensureDirs();
  if (!isValidConversationId(conversationId)) {
    throw new Error(`Invalid conversation id: ${conversationId}`);
  }

  const existing = await getConversation(conversationId);
  const now = Date.now();

  const conversation: Conversation = existing ?? {
    id: conversationId,
    title: 'New chat',
    createdAt: now,
    updatedAt: now,
    pinned: false,
    turns: [],
  };

  conversation.turns.push(turn);
  conversation.updatedAt = now;
  if (conversation.turns.length === 1 && turn.role === 'user' && turn.text) {
    conversation.title = deriveTitle(turn.text);
  }

  await atomicWriteJson(conversationPath(conversationId), conversation);

  const index = await readIndex();
  const idx = index.findIndex((e) => e.id === conversationId);
  const entry: ConversationIndexEntry = {
    id: conversationId,
    title: conversation.title,
    updatedAt: now,
    pinned: conversation.pinned,
    lastResult: deriveLastResult(turn) ?? (idx === -1 ? undefined : index[idx].lastResult),
  };
  if (idx === -1) index.push(entry);
  else index[idx] = entry;
  await writeIndex(index);

  return conversation;
}

export async function setPinned(id: string, pinned: boolean): Promise<Conversation | null> {
  if (!isValidConversationId(id)) return null;

  const conversation = await getConversation(id);
  if (!conversation) return null;

  conversation.pinned = pinned;
  await atomicWriteJson(conversationPath(id), conversation);

  const index = await readIndex();
  const idx = index.findIndex((e) => e.id === id);
  if (idx !== -1) {
    index[idx] = { ...index[idx], pinned };
    await writeIndex(index);
  }

  return conversation;
}

export async function deleteConversation(id: string): Promise<boolean> {
  if (!isValidConversationId(id)) return false;
  try {
    await fs.unlink(conversationPath(id));
  } catch {
    // already gone — still remove from the index below
  }
  const index = await readIndex();
  const next = index.filter((e) => e.id !== id);
  const changed = next.length !== index.length;
  if (changed) await writeIndex(next);
  return changed;
}
