---
description: Review a PR/branch/diff of test changes (in $TARGET_REPO) against the Senior QA checklist via the qa-pr-reviewer subagent. Findings only — never posts to GitHub.
argument-hint: "<PR#|branch|path>"
---

Delegate to the **`qa-pr-reviewer`** subagent (via the Agent tool) to review the target in `$ARGUMENTS` (a PR number, branch name, or file path within `$TARGET_REPO`, `/Users/sebastiancerpa/Desktop/checkly-test`) against the Senior QA checklist.

If `$ARGUMENTS` is empty, ask the user what to review (PR number, branch, or path) before invoking the subagent.

Relay the subagent's structured findings (Blocking / Non-blocking / Good practice / Verdict) back to the user as-is.

**Never post this as a PR comment or GitHub review, and never approve/request-changes, unless the user explicitly asks after reading the findings.** This command is read-only end to end.
