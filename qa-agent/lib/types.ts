import type { LogEntry } from './streamReducer';

export interface Attachment {
  name: string;
  path: string;
  size: number;
}

export interface Turn {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  entries?: LogEntry[];
  attachments?: Attachment[];
  createdAt: number;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  turns: Turn[];
}

export interface ConversationIndexEntry {
  id: string;
  title: string;
  updatedAt: number;
  pinned: boolean;
  // Derived from the most recent assistant turn's `result` entry — 'ok'/'error'
  // once one exists, undefined before the first assistant turn ever completes.
  lastResult?: 'ok' | 'error';
}
