# QA Agent — Ridepanda QA automation team

A team of specialized AI agents, slash commands, and a chat web app that operate on Ridepanda's
[Checkly](https://www.checklyhq.com/) monitoring-as-code repository. This project is **the team, not the tests** — it contains
no test code of its own. Instead it packages a router agent, a roster of specialized subagents, and a set of
slash commands that read, write, run, and triage the Playwright browser checks living in a separate target repository.

The agents are built on the [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview) and are driven either
from the Claude Code CLI or from the bundled Next.js web app (the "Qualitech" chat interface) in [`qa-agent/`](qa-agent/).

---

## Table of contents

- [Concept: two repositories](#concept-two-repositories)
- [Repository layout](#repository-layout)
- [The QA team](#the-qa-team)
- [The fifteen routing modes](#the-fifteen-routing-modes)
- [The web app runner (Qualitech)](#the-web-app-runner-qualitech)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Getting started](#getting-started)
- [Integrations](#integrations)
- [Conventions and hard rules](#conventions-and-hard-rules)
- [Project status](#project-status)

---

## Concept: two repositories

The design deliberately separates the **automation layer** from the **test code**:

| Repository | Role | Path |
|---|---|---|
| **QA Agent** (this repo) | The team: router, subagents, commands, skill, and the web app that runs them | this project |
| **Target repo** (`checkly-test`) | The actual Playwright/Checkly browser checks that run against real staging apps | referenced as `$TARGET_REPO` |

Every command and subagent in this project reads and writes against `$TARGET_REPO`, never against the local
`QA Agent` folder. The target path is defined in a **single place** — [`.claude/settings.json`](.claude/settings.json) — and
exposed to every agent as a real shell environment variable. If the path ever changes, it is updated there only.

The target repo contains Playwright browser checks running against real staging applications (Forest Admin, Portal,
Google Catalog), configured as Checkly monitoring-as-code.

---

## Repository layout

```
QA Agent/
├── CLAUDE.md                     Project instructions and hard rules (single source of truth)
├── .mcp.json                     Checkly MCP server wiring (remote HTTP, API key over headers)
├── .claude/
│   ├── settings.json             Declares TARGET_REPO as a shell env var
│   ├── routing.md                The 15-mode routing discipline (appended to the orchestrator prompt)
│   ├── launch.json               Dev-server launch config
│   ├── agents/                   The specialized subagents (one Markdown prompt each)
│   │   ├── docs-referencer.md
│   │   ├── flaky-hunter.md
│   │   ├── linear-liaison.md
│   │   ├── playwright-triage.md
│   │   ├── qa-pr-reviewer.md
│   │   ├── spec-auditor.md
│   │   ├── spec-writer.md
│   │   ├── stakeholder-reporter.md
│   │   ├── test-case-planner.md
│   │   └── troubleshooter.md
│   ├── commands/                 The slash commands (one per mode)
│   └── skills/
│       └── qa-team-guide/        Roster and quick-reference skill
└── qa-agent/                     The Next.js web app (the "Qualitech" chat runner)
    ├── app/                      App Router pages and API routes
    ├── components/               React UI (chat view, sidebar, permission prompts, etc.)
    └── lib/                      The SDK runner, command loader, permission gating, stream reducer
```

---

## The QA team

The team is a router (the main loop) plus ten specialized subagents. Each subagent has a narrow responsibility and its
own model, tools, and prompt. Most are reachable through a dedicated slash command, and the router can also delegate to
them automatically.

| Role | Subagent | Command | When to reach for it |
|---|---|---|---|
| Router | — (main loop; rules in `.claude/routing.md`) | — (default entry point) | You are not sure which mode you need — describe the goal and it routes |
| Test runner | `playwright-triage` (diagnose-only) | `/run-tests [target]` | "What is passing/failing, and why" — investigates and explains, never edits |
| Triage and fix | `playwright-triage` | `/fix-tests [target]` | A test is failing and you want a proposed fix, not just an explanation |
| Spec writer | `spec-writer` | `/automate <flow>` | A brand-new feature or flow needs a check written from scratch |
| Refactorer | — (direct) | `/refactor <spec path>` | An existing spec works but needs a quality cleanup — same coverage, better code |
| Flaky hunter | `flaky-hunter` | `/hunt-flaky <spec> [-g name] [N]` | Not sure whether a failure is a real bug or environmental noise |
| PR reviewer | `qa-pr-reviewer` | `/review-pr <PR#\|branch>` | A QA-quality pass on test changes before merging (never auto-posts) |
| Docs referencer | `docs-referencer` | `/docs-lookup <question>` | A Checkly/Playwright API or config answer grounded in the real docs |
| Troubleshooter | `troubleshooter` | `/troubleshoot <description>` | Repo/environment-level breakage — deploy failures, config/dependency issues, CI-wide redness |
| Stakeholder reporter | `stakeholder-reporter` | `/stakeholder-report [period]` | A plain-English summary for a non-technical audience (never auto-sent) |
| Spec auditor | `spec-auditor` | `/audit-specs [group]` | Batch sweep for fragile patterns and staleness candidates |
| Test-case planner | `test-case-planner` | `/plan-test-cases <ticket\|description>` | A manual QA checklist instead of automated code |
| Linear ticket intake | `linear-liaison` | `/from-ticket <ID\|URL>` | Turn a Linear ticket into a new check and/or a manual test plan |
| Exploratory tester | — (orchestrates several) | `/test-ticket <ID\|URL\|description>` | Actually run a ticket's flow against staging like a user, with screenshot evidence |
| Bug filer | `linear-liaison` | `/file-bug <triage report>` | Turn a real dev-facing bug into a drafted Linear ticket (drafts only, never auto-creates) |
| Pre-release gate | — (orchestrates auditor + suite + typecheck) | `/pre-release-check [group]` | A single go/no-go check before deploying |

For onboarding-style questions ("who handles X", "which agent do I need"), see the
[`qa-team-guide` skill](.claude/skills/qa-team-guide/SKILL.md).

---

## The fifteen routing modes

The router follows a strict discipline defined in [`.claude/routing.md`](.claude/routing.md): map each request to
**exactly one** of fifteen modes and invoke that mode's command or subagent — never mix modes, never run extra modes
"just in case." When intent is unclear, it narrows by cluster and asks one clarifying question rather than guessing.

1. Run tests (report only)
2. Triage and fix test failures
3. Automate a new flow
4. Refactor an existing spec
5. Hunt for flaky tests
6. Review a PR
7. Look up official docs
8. Troubleshoot a repo/environment problem
9. Stakeholder report
10. Audit specs for fragile patterns / staleness
11. Plan manual test cases
12. Pull a Linear ticket into automation
13. File a bug ticket from a triage report
14. Pre-release gate
15. Test a ticket like a user (exploratory run with evidence)

The routing guide is intentionally **not** an agent file. An agent file would only register a dead-end subagent the
orchestrator cannot route through. Instead the runner reads `routing.md` and appends it to the main loop's system prompt,
so the routing governs the orchestrator without bloating every subagent call.

---

## The web app runner (Qualitech)

[`qa-agent/`](qa-agent/) is a Next.js chat application that drives the team headlessly through the Claude Agent SDK — a
browser UI over the same agents, with live streaming, conversation history, and interactive tool-permission prompts.

**Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4, TypeScript, and the
`@anthropic-ai/claude-agent-sdk`.

**How it runs the team** (see [`qa-agent/lib/claudeRunner.ts`](qa-agent/lib/claudeRunner.ts)):

- Each chat message starts one **generation** — a single SDK `query()` — with the working directory pinned to this project.
- The **main loop runs on Sonnet**; each subagent pins its own model in its agent frontmatter (for example, Opus for
  `playwright-triage`'s root-cause work).
- The routing guide is appended to the Claude Code system-prompt preset so the orchestrator follows the 15-mode discipline.
- **Tool permissions are interactive.** Safe tools run silently; anything not on the allow-list falls through to
  `canUseTool`, which surfaces a prompt in the UI and waits for the user's decision. This requires streaming input, so the
  prompt is fed as an async generator that keeps the control channel open for the whole turn.
- Subagents are forced to run in the **foreground** so their permission prompts can still be answered through the UI.
- Only one generation runs globally at a time, by design. Conversation turns are persisted to disk.

Run it locally (see [Getting started](#getting-started) below); it binds to `127.0.0.1:3000`.

---

## Prerequisites

- **Node.js 20+** and npm
- **Claude Code** access (the runner uses the Claude Agent SDK / Claude Code CLI)
- A local checkout of the **target test repository** (`checkly-test`)
- API keys for the integrations you intend to use (see [Configuration](#configuration))

---

## Configuration

### Target repository path

Defined once in [`.claude/settings.json`](.claude/settings.json):

```json
{
  "env": {
    "TARGET_REPO": "/absolute/path/to/checkly-test"
  }
}
```

Every agent and command references it as `$TARGET_REPO`. Update this value to match where you cloned the target repo.

### Environment variables (set in your shell profile — never committed)

These are read from the environment of the shell that launches the web app (for example `~/.zshrc`). They are never
stored in any file in this repository; `.gitignore` also excludes `.env*` and `.claude/settings.local.json` as a second
layer of protection.

```bash
# Checkly user API key (cu_...) or service key (sv_...), used by the Checkly MCP server
export CHECKLY_API_KEY=cu_...

# Linear API key, used by linear-liaison for ticket fetch and bug drafting
export LINEAR_API_KEY=lin_api_...
```

- `.mcp.json` references `${CHECKLY_API_KEY}` so the secret never touches disk. The Checkly **account ID** is a plain
  identifier (not a credential) and is stored directly in `.mcp.json`.
- Until `CHECKLY_API_KEY` is set, the `checkly` MCP server simply fails to connect and the agents fall back to the
  `npx checkly` CLI, so nothing hard-breaks.
- `linear-liaison` uses `curl` against Linear's GraphQL API directly (not an MCP connector) because the headless runner
  cannot complete Linear's interactive OAuth flow.

---

## Getting started

Clone the repo and set the target path and environment variables as described above, then run the web app:

```bash
cd qa-agent
npm install
npm run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000) and start a conversation. Describe what you want in plain language and
the router will select the right mode, or invoke a slash command directly.

You can also drive the team from the **Claude Code CLI** opened at the root of this project — the same agents, commands,
and routing apply.

---

## Integrations

### Checkly (MCP)

Wired in via [`.mcp.json`](.mcp.json) as a remote HTTP MCP server (`https://api.checklyhq.com/mcp`). It authenticates by
**API key over headers**, not OAuth — deliberately, because the headless runner cannot complete Checkly's interactive
OAuth flow. Only the read-only tools (`whoami`, `list-check-stats`, `list-check-results`,
`list-account-environment-variables`) are pre-approved; any state-mutating Checkly tool falls through to a fresh
permission prompt every time.

### Linear (GraphQL over curl)

`linear-liaison` talks to Linear's API directly with `curl` and a `LINEAR_API_KEY`. It **only fetches and drafts** — it
never creates or modifies a Linear issue without an explicit confirmation in the conversation, every time.

---

## Conventions and hard rules

These apply to every agent and command, in every mode, without exception. The full text lives in
[`CLAUDE.md`](CLAUDE.md).

**Safety and review**

- Never commit, push, open a PR, post a PR comment/review, or send any report or message on the user's behalf unless the
  user explicitly asks after reviewing the output.
- Never weaken or delete an assertion to make a test pass — if that is the only fix, it is a real regression to flag, not
  to silence.
- Any state-mutating MCP tool call requires a fresh explicit confirmation every time; a prior approval does not carry
  forward.
- Never hardcode secrets — use `process.env.EMAIL`, `process.env.PASSWORD`, `process.env.ApiKey`.

**Domain rules**

- The 24-hour check frequency (`Frequency.EVERY_24H` / `1440`) is fixed company policy and is never suggested as a change.
- `constants.ts` must not import construct files — this crashes the Checkly runner at runtime.
- A Google Auth redirect at Forest login is a developer bug (ENV_AUTH), not something to work around in the test login code.

**Working-directory discipline** (because there are two repos)

- Every `npm`/`npx`/`git`/`gh` command runs as `cd "$TARGET_REPO" && ...`; no working directory is assumed to carry over.
- Every file operation against the target repo uses a **fully qualified path** under `$TARGET_REPO`, never a bare
  relative path (which would silently resolve inside this project instead).

**Working with new specs (untracked files)**

A brand-new spec that was never committed shows as untracked in `git status`. Git's tracked-file commands misbehave on
untracked files, so:

- `git diff` shows nothing for an untracked file — it is not evidence an edit failed. Use `git status --short <file>`
  plus reading the file back to confirm an edit landed.
- `git checkout -- <file>` errors on an untracked file and will not revert it; use `rm <file>` to discard a bad edit on a
  brand-new spec.

---

## Project status

Active and in use. One area is a known gap, not yet designed: **staging/environment data preparation** (creating test
orders, users, or records before a check runs). It is currently part manual (Forest Admin UI) and part existing internal
seed script — a dedicated command around it is pending those specifics.
