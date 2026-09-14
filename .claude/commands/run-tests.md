---
description: Run the Checkly/Playwright suite (in $TARGET_REPO), report results, and for any failure investigate + explain the real root cause (trace/HAR/console, not just Playwright's error line). Never edits code, never proposes a fix.
argument-hint: "[spec path | group folder | empty for changed specs]"
---

Run the test suite in `$TARGET_REPO` (`/Users/sebastiancerpa/Desktop/checkly-test`) and report results. When a test fails, don't stop at Playwright's error string — investigate what actually happened (the trace, network/console signals, which step really broke) and explain that in the chat. **Still read-only in the sense that matters: never edit a file, never propose or apply a fix, never commit/push/open a PR.** Diagnosis, not remediation.

## Target

`$ARGUMENTS` — optional. If given, it's a spec path (e.g. `src/__checks__/Forest/fulfill-order.spec.ts`) or a group folder name (`Forest`, `Portal`, `GoogleCatalog`) to scope the run, resolved relative to `$TARGET_REPO`. If empty, scope to specs touched on the current branch of `$TARGET_REPO`:

```
cd "$TARGET_REPO" && { git diff --name-only main...HEAD -- '**/*.spec.ts'; git ls-files --others --exclude-standard -- '**/*.spec.ts'; }
```

The `git ls-files --others` half is not optional: a plain `git diff --name-only` **silently omits brand-new untracked specs** (see root `CLAUDE.md` → "Git & specs"), so a new spec on the branch would never get run. If no specs are found either way, ask the user whether to run the full suite before proceeding — it hits real staging apps and can be slow.

## Workflow

### 1. Build the run command

- **Full suite or group:** `cd "$TARGET_REPO" && npx checkly test [group/] --reporter=list`
- **Single spec:** `cd "$TARGET_REPO" && npx playwright test <spec> --config playwright.config.ts --reporter=list`

### 2. Run and capture output

Execute the command and capture stdout/stderr in full.

### 3. For every failure, find out what actually happened

If nothing failed, skip straight to step 4.

This step has two phases: capture the evidence **serially** (phase 3a), then fan the analysis out **in parallel** (phase 3b). The split is deliberate — the browser capture hits real staging with shared credentials, so it stays one-at-a-time; the analysis is pure trace/HAR reading and is where the wall-clock time actually goes, so it runs concurrently.

#### 3a — Capture evidence (one at a time)

For each failing test, one at a time (so concurrent staging logins don't fight over the same session, and each per-slug HAR is written cleanly), capture instrumented evidence:

```
cd "$TARGET_REPO" && export TRIAGE_HAR=triage-output/<slug>.har && npx playwright test <spec> -g "<test name>" --config playwright.triage.config.ts
```

This targeted re-run turns on tracing and writes a HAR, a trace, and a screenshot under `$TARGET_REPO/triage-output/` — the raw error string alone doesn't say which step broke or why; the trace does. Use a distinct `<slug>` per failure so the HARs never collide. Skip this sub-step only for obvious `tsc`/import errors, which need no browser run. If this instrumented run unexpectedly **passes**, say so plainly in the report (don't silently treat it as fixed) — that's a flakiness signal, not something to resolve here.

#### 3b — Analyze all failures in parallel

Once every failure's evidence is captured, delegate the investigations to the **`playwright-triage`** subagent (via the Agent tool). **Fan them out in a single message: emit one Agent tool call per failure in the same turn so they run concurrently — do not delegate one, wait for it, then delegate the next.** Each subagent gets the spec path, test name, raw error, and the **already-captured** HAR/trace/screenshot paths, and is told explicitly: **use the provided artifacts — do not re-run the browser**; and **diagnose and report only — do not edit any file or apply any fix**, even for a clear TEST_BUG.

Each subagent reads the trace's DOM snapshots and the HAR's network calls to identify the exact step that broke, attributes fault (TEST_BUG / FRONTEND_BUG / BACKEND_BUG / TEST_DATA / ENV_AUTH / INFRA_FLAKY), and writes a QA report to `$TARGET_REPO/triage-output/report-*.md`. Report filenames are per-test (`report-<spec-slug>-<test-slug>.md`), so parallel writers never collide.

### 4. Report results

Print a results table with every test:

| Status | Spec | Test name | Duration | Error (first line) |
|---|---|---|---|---|
| ✓ PASS | … | … | … | — |
| ✗ FAIL | … | … | … | … |

For each **failure**, print underneath the table:

> **`<spec>` › `<test name>`**
> **Error:** `<Playwright's error, first line>`
> **What actually happened:** <plain-English root cause from the triage subagent's verdict — the step that broke, what the trace/HAR showed, and the attributed culprit>
> **Report:** `$TARGET_REPO/triage-output/report-<slug>.md`

Then print a one-line summary: `N passed, M failed` (and timing if available).

If everything passed, say so and stop.

If there were failures, end with:

> **Next step:** If you want a fix proposed for any TEST_BUG failures above, run `/fix-tests $ARGUMENTS`.

## Guardrails

- Investigate freely — read the trace, HAR, and console to explain *why* a test failed. That's the point of this command now.
- Do NOT edit any file, propose a diff, or apply a fix — that's `/fix-tests`'s job, only on the user's explicit request.
- Do NOT commit, push, or open a PR.
- If a test consistently fails, that is not a reason to change scope — just report and explain it.
