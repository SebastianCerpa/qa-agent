---
description: Generate a manual QA checklist (cases + steps) from a ticket or feature description, via test-case-planner. No code, no test runs.
argument-hint: "<ticket ID/URL, or a feature description>"
---

Delegate to the **`test-case-planner`** subagent (via the Agent tool) to build a manual test plan for `$ARGUMENTS`.

If `$ARGUMENTS` looks like a Linear ticket ID/URL, fetch it first via the **`linear-liaison`** subagent (same as `/from-ticket`) and pass the ticket content to `test-case-planner` — don't make the user paste it manually if it's already fetchable.

If `$ARGUMENTS` is empty, ask the user what feature/flow needs a manual test plan.

Relay the checklist back to the user as-is. This command never writes code and never runs the test suite.
