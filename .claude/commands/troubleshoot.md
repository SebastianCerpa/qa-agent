---
description: Diagnose a repo/environment-level QA problem in $TARGET_REPO (deploy failures, config/dependency issues, CI-wide redness) via the troubleshooter subagent — not for a single failing spec.
argument-hint: "<description of the problem>"
---

Delegate to the **`troubleshooter`** subagent (via the Agent tool) to diagnose the problem described in `$ARGUMENTS`, in `$TARGET_REPO` (`/Users/sebastiancerpa/Desktop/checkly-test`).

If `$ARGUMENTS` describes **one specific failing Playwright spec** rather than a repo/environment-level problem, don't invoke this — redirect to `/fix-tests` instead, which does the right kind of deep single-test forensics.

If `$ARGUMENTS` is empty, ask the user what's broken before invoking the subagent.

Relay the subagent's troubleshoot report back to the user as-is. If it proposes a state-mutating action (e.g. adding an account environment variable), surface that request explicitly and wait for the user's fresh, explicit yes before it's carried out — never treat a past approval as covering it.
