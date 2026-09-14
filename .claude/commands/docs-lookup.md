---
description: Look up authoritative Checkly/Playwright documentation to ground an API or config question, via the docs-referencer subagent.
argument-hint: "<question>"
---

Delegate to the **`docs-referencer`** subagent (via the Agent tool) to answer the question in `$ARGUMENTS` by reading official Checkly (`checklyhq.com/docs`) and/or Playwright (`playwright.dev/docs`) documentation, checked against the versions pinned in `$TARGET_REPO/package.json`.

If `$ARGUMENTS` is empty, ask the user what they want to look up before invoking the subagent.

Relay the subagent's answer and citations back to the user as-is. If the subagent flags that the docs don't confirm something, pass that uncertainty along too — do not smooth it into a confident answer.

This command never edits code and never runs commands beyond reading local version info.
