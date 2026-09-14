---
description: Write a new Checkly browser check (spec + construct) in $TARGET_REPO for a flow or feature described by the user. Delegates to the spec-writer subagent. Does not run existing tests.
argument-hint: "<description of the flow to automate>"
---

Delegate to the **`spec-writer`** subagent (via the Agent tool) to write a new Playwright/Checkly browser check in `$TARGET_REPO` (`/Users/sebastiancerpa/Desktop/checkly-test`) for the flow described in `$ARGUMENTS`.

Pass the subagent the full flow description verbatim. If `$ARGUMENTS` is empty or too vague for it to proceed (it will ask for app / user flow / test data / ticket reference), relay those questions to the user before re-invoking it — do not guess on its behalf.

**Do not run any existing tests. Do not triage existing failures.** This command is write-only.

If the user describes **multiple** flows/tickets to automate at once, invoke `spec-writer` once per flow in parallel (independent subagent calls) rather than one call covering all of them — keeps each flow's file pair and delivery report cleanly separated.

Relay the subagent's delivery report back to the user as-is: files created, typecheck result, step-by-step coverage, open questions, and the explicit next step (`/run-tests <spec path>`).

Do NOT commit, push, or open a PR unless the user explicitly asks afterward.
