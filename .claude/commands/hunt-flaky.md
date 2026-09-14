---
description: Run one named test N times (in $TARGET_REPO) to confirm whether it's genuinely flaky or a real bug, via the flaky-hunter subagent.
argument-hint: "<spec path> [-g \"test name\"] [N]"
---

Delegate to the **`flaky-hunter`** subagent (via the Agent tool) to determine whether the test in `$ARGUMENTS` is flaky or a real, reproducible failure.

Parse `$ARGUMENTS` for: the spec path, an optional `-g "test name"` filter, and an optional run count N (default 5 if not given). If the spec path is missing, ask the user which spec/test to check before invoking the subagent.

Relay the subagent's `FLAKINESS VERDICT` back to the user as-is. If the verdict recommends handing off to `playwright-triage` (either `CONFIRMED_FLAKY` or `CONSISTENTLY_FAILING`), tell the user explicitly and offer to run `/fix-tests` next — do not auto-chain into it.

This command never edits code.
