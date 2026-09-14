---
description: Sweep specs in $TARGET_REPO for fragile patterns (high confidence) and staleness candidates (flagged for human review), via spec-auditor. Read-only.
argument-hint: "[group folder | empty for full repo]"
---

Delegate to the **`spec-auditor`** subagent (via the Agent tool) to audit specs under `$TARGET_REPO` (`/Users/sebastiancerpa/Desktop/checkly-test`), scoped to `$ARGUMENTS` (a group folder like `Forest`/`Portal`/`GoogleCatalog`) or the whole `src/__checks__/` tree if empty.

Relay the subagent's two-pass report back to the user as-is: Pass 1 (fragile patterns — treat as fact) and Pass 2 (staleness candidates — treat as "worth you checking," never as a verdict).

This command never edits anything and never runs the test suite. For Pass 1 hits the natural next step is `/refactor <spec>`; for Pass 2 candidates, that's a human call.
