import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

export const QA_AGENT_ROOT =
  process.env.QA_AGENT_ROOT ?? path.resolve(process.cwd(), '..');

const COMMANDS_DIR = path.join(QA_AGENT_ROOT, '.claude', 'commands');

// The full roster of slash commands the QA team supports — this is what the
// in-app "Available commands" modal documents, so it must track every .md
// file under .claude/commands, not just a curated subset.
const COMMAND_IDS = [
  'run-tests',
  'fix-tests',
  'automate',
  'refactor',
  'hunt-flaky',
  'review-pr',
  'docs-lookup',
  'troubleshoot',
  'stakeholder-report',
  'audit-specs',
  'plan-test-cases',
  'from-ticket',
  'file-bug',
  'pre-release-check',
  'test-ticket',
] as const;

export type CommandId = (typeof COMMAND_IDS)[number];

// Whether a command needs non-empty args only exists in its prose ("ask the
// user if $ARGUMENTS is empty") — frontmatter has no field for it, so it can't
// be derived automatically. Headless mode has nobody to answer that question,
// so getting this wrong means the button silently "does nothing."
const ARGS_REQUIRED: Record<CommandId, boolean> = {
  'run-tests': false,
  'fix-tests': false,
  automate: true,
  refactor: true,
  'hunt-flaky': true,
  'review-pr': true,
  'docs-lookup': true,
  troubleshoot: true,
  'stakeholder-report': false,
  'audit-specs': false,
  'plan-test-cases': true,
  'from-ticket': true,
  'file-bug': true,
  'pre-release-check': false,
  // Needs a Linear ID/URL or a pasted ticket description; empty input makes the
  // command ask a question nobody can answer in headless mode.
  'test-ticket': true,
};

export interface CommandDefinition {
  id: CommandId;
  description: string;
  argumentHint: string;
  argsRequired: boolean;
}

let cache: CommandDefinition[] | null = null;

export function loadCommands(): CommandDefinition[] {
  if (cache) return cache;

  cache = COMMAND_IDS.map((id) => {
    const filePath = path.join(COMMANDS_DIR, `${id}.md`);
    if (!fs.existsSync(filePath)) {
      throw new Error(
        `QA Agent command registry: expected file not found at ${filePath}. ` +
          `QA_AGENT_ROOT resolved to ${QA_AGENT_ROOT} — set the QA_AGENT_ROOT env var ` +
          `if the app isn't running from inside "QA Agent/QA Agent".`
      );
    }

    const { data } = matter(fs.readFileSync(filePath, 'utf8'));
    if (!data.description) {
      throw new Error(`${filePath} is missing a "description" in its frontmatter.`);
    }

    return {
      id,
      description: String(data.description),
      argumentHint: data['argument-hint'] ? String(data['argument-hint']) : '',
      argsRequired: ARGS_REQUIRED[id],
    };
  });

  return cache;
}

export function isValidCommandId(id: string): id is CommandId {
  return (COMMAND_IDS as readonly string[]).includes(id);
}

export function getCommand(id: CommandId): CommandDefinition {
  const found = loadCommands().find((c) => c.id === id);
  if (!found) throw new Error(`Unknown command id: ${id}`);
  return found;
}
