# QA Agent — Ridepanda QA automation team

This project is the home of a QA automation "team": a router agent plus specialized subagents and slash commands that operate on Ridepanda's Checkly monitoring-as-code repo. This project holds no test code itself — it's the team, not the tests.

## Target repo (single source of truth)

```
TARGET_REPO = /Users/sebastiancerpa/Desktop/checkly-test
```

If this path ever changes, update it **here only**. Every agent and command references it as `$TARGET_REPO` (a real shell env var, declared in `.claude/settings.json`).

**Working directory convention — applies to every agent/command in this project:**
- Every `npm`/`npx`/`git`/`gh` Bash invocation must be prefixed `cd "$TARGET_REPO" && ...`. Never assume a cwd carried over from a previous command.
- Every `Read`/`Edit`/`Write`/`Glob`/`Grep` call must use a fully-qualified path under `$TARGET_REPO` (e.g. `$TARGET_REPO/src/__checks__/Forest/x.spec.ts`), never a bare relative path like `src/__checks__/...`. These tools have no shell cwd to inherit — a bare relative path silently resolves inside *this* project instead of `checkly-test`.

**Git & specs — new spec files are usually _untracked_; do not trust `git diff` on them:**
A brand-new spec that was never committed shows as `??` in `git status`. Git's tracked-file commands silently misbehave on untracked files — this has already burned real triage steps (a fix was applied, yet `git diff` showed nothing, reading as "no change made"). Rules that make those steps efficient:
- **`git diff` / `git diff --stat` / `git diff main...HEAD` show _nothing_ for an untracked file.** It is not evidence the edit failed. To render or stat a new spec as a diff, run `git add -N <file>` first (intent-to-add: registers the path only, does **not** stage content, so the "changes stay unstaged" rule still holds), then `git diff` / `--stat` work. For one file, `git diff --no-index /dev/null <file>` also works with no index change.
- **`git checkout -- <file>` _errors_ on an untracked file** (no committed baseline to restore) and will NOT revert it. To discard a bad edit on a brand-new spec, `rm <file>`; use `git checkout -- <file>` only on tracked files.
- **To scope to "specs changed on this branch", `git diff --name-only main...HEAD` _omits_ untracked new specs.** Union it with them: `git diff --name-only main...HEAD -- '**/*.spec.ts'; git ls-files --others --exclude-standard -- '**/*.spec.ts'`.
- **To confirm an edit landed, use `git status --short <file>` + reading the file back**, never `git diff`. Legend: `??` = untracked, ` M`/`M ` = tracked-modified, `A ` = staged-new.

## Who's on the team

See [`.claude/skills/qa-team-guide/SKILL.md`](.claude/skills/qa-team-guide/SKILL.md) for the full roster and trigger phrases.

**Routing lives in [`.claude/routing.md`](.claude/routing.md)** — the 15-mode discipline the orchestrator (the main loop) follows. It is deliberately **not** a `.claude/agents/*.md` file: an agent file would only register a subagent the orchestrator can't route *through* (subagents can't invoke commands or other subagents). Instead `qa-agent/lib/claudeRunner.ts` reads `routing.md` and appends it to the main loop's system prompt (`systemPrompt.append`), so the routing governs the orchestrator without bloating every subagent call. Edit routing behavior there, in one place.

## Checkly MCP integration

The Checkly MCP server is wired in via [`.mcp.json`](.mcp.json) at this project's root — a remote HTTP server (`https://api.checklyhq.com/mcp`) loaded by the web-app runner because `query()` uses `settingSources: ['user','project','local']` (and `strictMcpConfig` is off, so project `.mcp.json` is honored). It authenticates by **API key over headers, not OAuth** — deliberately, because the headless runner can't complete Checkly's interactive OAuth flow.

One **environment variable must be set in your own shell profile** (the shell that launches `npm run dev`), never stored in any file here:

```
export CHECKLY_API_KEY=cu_...      # a Checkly user API key (or sv_... service key)
```

`.mcp.json` references it as `${CHECKLY_API_KEY}` — the secret never touches disk. The account ID (`X-Checkly-Account`) is a plain identifier, not a credential, so it's baked into `.mcp.json` directly (currently `c1bfd24a-…`); update it there if the account ever changes. Until `CHECKLY_API_KEY` is set the `checkly` server just fails to connect (its tools go unavailable); the agents fall back to the `npx checkly` CLI, so nothing hard-breaks. Only the read-only tools (`whoami`, `list-check-stats`, `list-check-results`, `list-account-environment-variables`) are pre-approved in `settings.local.json`; any state-mutating Checkly MCP tool falls through to a fresh permission prompt every time (see Hard rules).

## Linear integration

`linear-liaison` talks to Linear's GraphQL API directly with `curl` + a `LINEAR_API_KEY` — **not** via an MCP connector, and that is deliberate (not just historical): Linear's hosted MCP authenticates over interactive OAuth, which this headless runner (the Next.js app driving the SDK) can't complete, so an API key in the shell env is the robust path for a non-interactive local tool. It needs a `LINEAR_API_KEY` **environment variable set in your own shell profile** (e.g. `export LINEAR_API_KEY=...` in `~/.zshrc`), never stored in any file in this project. `.gitignore` already excludes `.claude/settings.local.json` and `.env*` as a second layer of protection, but the shell-profile route means the key never touches disk here at all.

`linear-liaison` only fetches and drafts — it never creates or modifies a Linear issue without your fresh explicit yes in the conversation, every time.

## Pending — not yet designed

Staging/environment data prep (creating test orders, users, records before a check runs) is a known gap. It's partly manual (Forest Admin UI) and partly an existing internal seed script/API — needs those specifics before a command can be designed around it.

## Hard rules (apply in every mode, no exceptions)

- **24h check frequency is company policy** — `frequency: Frequency.EVERY_24H` / `1440`. Never suggest changing it.
- **Never commit, push, open a PR, post a PR comment/review, or send any report/message** on the user's behalf unless they explicitly ask after reviewing the output.
- **Never weaken or delete an assertion** to make a test pass — if that's the only fix, it's a real regression to flag, not silence.
- **Never hardcode secrets** — use `process.env.EMAIL`, `process.env.PASSWORD`, `process.env.ApiKey`.
- **Any state-mutating MCP tool call** (e.g. creating/editing an account environment variable, anything beyond read-only `whoami`/`list-*`) requires a fresh explicit yes from the user every time — a prior approval does not carry forward.
- **`constants.ts` must not import construct files** — this causes a runtime crash inside the Checkly runner.
- **Google Auth redirect at Forest login = developer bug (ENV_AUTH)** — do not touch the test login code to work around it.
- checkly-test's own `.gitignore` excludes `.claude/` — the automation layer lives here now, not there.
