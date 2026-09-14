---
name: qa-team-guide
description: Roster and quick-reference for the QA automation team — who does what, which /command or trigger phrase reaches them, and where the target repo path convention lives. Use this for onboarding-style questions ("who handles X", "what can this team do", "which agent do I need") — not for actually executing a task, which should go straight to the router or the relevant /command instead.
---

# The QA team

This project (`QA Agent`) is the team. It operates on a separate repo, `$TARGET_REPO` = `/Users/sebastiancerpa/Desktop/checkly-test` (see root `CLAUDE.md` for the full path convention — every command/agent here reads and writes there, never locally).

## Roster

| Role | Subagent | Command | When to reach for it |
|---|---|---|---|
| Router | — (main loop; routing rules in `.claude/routing.md`, appended to the orchestrator's system prompt) | — (default entry point) | Don't know which mode you need — just say what you want, it routes |
| Test runner | `playwright-triage` (diagnose-only) | `/run-tests [target]` | "What's passing/failing, and why" — investigates + explains failures, never edits code |
| Triage & fix | `playwright-triage` | `/fix-tests [target]` | A test is failing and you want a proposed fix, not just an explanation |
| Spec writer | `spec-writer` | `/automate <flow description>` | A brand-new feature/flow needs a check written from scratch |
| Refactorer | — (direct) | `/refactor <spec path>` | An existing spec works but needs quality cleanup — same coverage, better code |
| Flaky hunter | `flaky-hunter` | `/hunt-flaky <spec> [-g name] [N]` | Not sure if a failure is a real bug or environmental noise |
| PR reviewer | `qa-pr-reviewer` | `/review-pr <PR#\|branch>` | Want a QA-quality pass on test changes before merging (never auto-posts) |
| Docs referencer | `docs-referencer` | `/docs-lookup <question>` | Need a Checkly/Playwright API/config question answered from the actual docs, not memory |
| Troubleshooter | `troubleshooter` | `/troubleshoot <description>` | Something's broken at the repo/environment level — deploy failures, dependency/config issues, CI-wide redness (not one failing spec — that's `/fix-tests`) |
| Stakeholder reporter | `stakeholder-reporter` | `/stakeholder-report [period]` | Need a plain-English summary for someone non-technical (never auto-sent) |
| Spec auditor | `spec-auditor` | `/audit-specs [group]` | Batch sweep for fragile patterns (fact) and staleness candidates (flagged for human review) — not a one-at-a-time refactor |
| Test-case planner | `test-case-planner` | `/plan-test-cases <ticket\|description>` | Need a manual QA checklist, not automated code |
| Linear ticket intake | `linear-liaison` | `/from-ticket <ID\|URL>` | A Linear ticket should become a new check and/or a manual test plan |
| Ticket exploratory tester | — (orchestrates `linear-liaison` + `spec-writer` + `playwright-triage`) | `/test-ticket <ID\|URL\|description>` | Actually *run* a ticket's flow against staging like a user — throwaway spec, pass/fail screenshots shown in chat, failure explained. Never adds a permanent spec (that's `/automate`), never commits |
| Bug filer | `linear-liaison` | `/file-bug <triage report>` | A triage report found a real dev-facing bug (FRONTEND_BUG/BACKEND_BUG) worth a Linear ticket — always drafts, never auto-creates |
| Pre-release gate | — (orchestrates `spec-auditor` + suite + typecheck) | `/pre-release-check [group]` | About to deploy, want one go/no-go check |

## Standing rules, team-wide

- Every subagent and command works against `$TARGET_REPO`, never the local `QA Agent` folder — see `CLAUDE.md` for the full path convention (Bash `cd`s there; every Read/Edit/Write/Glob/Grep path is fully qualified under it).
- Nobody commits, pushes, opens a PR, posts a PR comment/review, or sends a report/message on the user's behalf without an explicit yes, every time.
- Nobody weakens or deletes an assertion to force a test green.
- 24h check frequency is fixed company policy — never suggested as a change.
- Any state-mutating MCP action (e.g. creating an account environment variable) needs a fresh explicit yes, regardless of what was approved earlier in the conversation.

## If you're not sure which one you need

Just describe the problem in plain language to the router (`claude` agent, the default) — it asks one clarifying question if your intent doesn't clearly map to one mode, rather than guessing or running multiple modes "just in case."
