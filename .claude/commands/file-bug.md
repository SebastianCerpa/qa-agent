---
description: Draft a Linear bug ticket from a playwright-triage report (FRONTEND_BUG/BACKEND_BUG only), via linear-liaison. Draft-only — never creates the ticket without your explicit go-ahead.
argument-hint: "<path to triage-output/report-*.md>"
---

Delegate to the **`linear-liaison`** subagent (via the Agent tool) to draft a Linear bug ticket from the triage report at `$ARGUMENTS` (a path under `$TARGET_REPO/triage-output/`).

If `$ARGUMENTS` is empty, ask the user which report to use — or, if they just finished `/fix-tests` and it surfaced FRONTEND_BUG/BACKEND_BUG findings, offer the report paths from that run.

Present the drafted ticket (title, team, labels, description) to the user and **stop there**. Do not create it in Linear.

Only if the user explicitly confirms afterward ("yes, file it", "créalo") do you re-invoke `linear-liaison` to actually run the creation — and even then, confirm the target Linear team first if it wasn't already established, never guessed.
