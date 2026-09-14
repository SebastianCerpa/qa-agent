---
description: Fetch a Linear ticket and turn it into a new automated spec and/or a manual test-case checklist, via linear-liaison.
argument-hint: "<Linear ID or URL>"
---

Delegate to the **`linear-liaison`** subagent (via the Agent tool) to fetch the ticket in `$ARGUMENTS` from Linear.

If `$ARGUMENTS` is empty, ask the user for the Linear ID or URL before invoking the subagent.

Once you have the ticket content and `linear-liaison`'s recommendation (automate vs. plan manual cases vs. both), **ask the user which they want** unless it's obviously one or the other from the ticket itself:

- Automate → hand the ticket content to **`spec-writer`** (same as `/automate`, just sourced from the ticket instead of a typed description)
- Plan manual cases → hand the ticket content to **`test-case-planner`**
- Both → run them independently; they don't depend on each other

Relay whichever subagent(s) ran their output back to the user as-is, plus the original ticket link for reference.

This command never creates, updates, or comments on the Linear ticket — that's `/file-bug`'s territory, and even that only drafts.
