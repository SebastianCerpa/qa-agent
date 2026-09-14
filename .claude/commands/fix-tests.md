---
description: Run the Checkly/Playwright suite (in $TARGET_REPO), triage each failure via the playwright-triage subagent, and propose best-practice fixes for review (never auto-commits, never silences a real regression).
argument-hint: "[spec path | group folder | empty for changed specs]"
---

Triage and propose fixes for failing Playwright/Checkly tests in `$TARGET_REPO` (`/Users/sebastiancerpa/Desktop/checkly-test`). Operate in **propose-only** mode: apply fixes to test files as **unstaged changes** for the user to review, and **never commit, push, or open a PR** unless the user explicitly asks afterward.

## Target

`$ARGUMENTS` — optional. If given, it's a spec path or a group folder (`Forest`, `Portal`, `GoogleCatalog`) to scope the run. If empty, scope to specs touched on the current branch — **including brand-new untracked specs, which `git diff` alone silently omits** (see root `CLAUDE.md` → "Git & specs"): `cd "$TARGET_REPO" && { git diff --name-only main...HEAD -- '**/*.spec.ts'; git ls-files --others --exclude-standard -- '**/*.spec.ts'; }`. If none, ask the user whether to run the full suite (it hits real staging apps and can be slow) before doing so.

## Workflow

### 1. Run and collect failures
- Run the scoped suite: `cd "$TARGET_REPO" && npx checkly test <target> --reporter=list`.
- If nothing failed, report that and stop — do not invent work.
- Parse the output into a list of distinct failing tests (spec path + test name + error).

### 2. Capture network/console signals (instrumented re-run)
For each failing test, one at a time, re-run just that one test with full instrumentation so the triage has HTTP/console evidence:

```
cd "$TARGET_REPO" && export TRIAGE_HAR=triage-output/<slug>.har && npx playwright test <spec> -g "<test name>" --config playwright.triage.config.ts
```

One test at a time — both so each per-slug HAR is written cleanly and so concurrent staging logins with the shared test credentials don't fight over one session. This writes a HAR, a trace, and a screenshot under `$TARGET_REPO/triage-output/`. Use a distinct `<slug>` per failure. If this instrumented run unexpectedly **passes**, delegate to the **`flaky-hunter`** subagent (via the Agent tool) to run it N more times before concluding anything — do not label it flaky or fixed from a single anomalous pass. (Skip step 2 only for obvious `tsc`/import errors, which need no browser run.)

### 3. Triage each failure — analysis, fix, AND verification (serial, one at a time)
Delegate each failure to the **`playwright-triage`** subagent (via the Agent tool), **one at a time, serially — do NOT fan them out concurrently.** A TEST_BUG fix is only confirmed once the subagent re-runs the test in the browser and sees it green (its own overriding rule: *an unverified fix is a hypothesis, not a fix*), and that verification run is a staging login with the shared test credentials. Several subagents verifying at once would put those logins in contention and produce false failures — so each subagent must finish its **analysis, edit, and its own verification run** before the next one starts.

Each subagent gets: the spec path, the test name, the raw error, and the paths to the **already-captured** `triage-output/<slug>.har`, trace, and screenshot (all under `$TARGET_REPO`).

Tell each subagent explicitly:
- **Use the provided artifacts for the analysis — don't re-run the browser just to re-capture** evidence that already exists from step 2.
- **For a clear TEST_BUG, apply the edit and then verify it by re-running the test** (`cd "$TARGET_REPO" && npx playwright test <spec> -g "<test name>" --config playwright.triage.config.ts`), and report the verified outcome in its verdict (`VERIFIED: yes | no`). A fix it could not make pass stays flagged as needs-human — never forced green.

Each subagent writes a QA bug report per failure to `$TARGET_REPO/triage-output/report-<spec-slug>-<test-slug>.md` (per-test filenames), attributes fault, and either edits and verifies the test (TEST_BUG only) or flags it. Respect its verdict — never override an app-bug flag to force green.

### 4. Reconcile and typecheck
Each subagent already verified its own fix in step 3; this step just consolidates.
- For any failure the subagent returned as `VERIFIED: no` (its fix didn't make the test pass), revert that edit and reclassify it as needs-human rather than leaving a broken change. **Revert depends on tracked vs untracked** (check `git status --short <file>` first): tracked spec → `cd "$TARGET_REPO" && git checkout -- <file>`; brand-new untracked spec (`??`) → `git checkout` errors and does nothing, so `cd "$TARGET_REPO" && rm <file>` instead (or restore your pre-fix copy). See root `CLAUDE.md` → "Git & specs".
- Run `cd "$TARGET_REPO" && npm run typecheck` once at the end to catch type breakage across all the edits together.

### 5. Report (do not commit)
Print a single triage table, most-actionable first:

| Test | Culprit | Confidence | Action | QA report | Human needs to |
|---|---|---|---|---|---|

Then:
- Link each `$TARGET_REPO/triage-output/report-*.md` — those are the shareable QA bug reports.
- Show a diff-stat of the proposed test changes so the user sees exactly what would change. **A plain `git diff --stat` omits any brand-new untracked spec entirely** (see root `CLAUDE.md` → "Git & specs"), so intent-add first: `cd "$TARGET_REPO" && git add -N $(git ls-files --others --exclude-standard -- '**/*.spec.ts') 2>/dev/null; git diff --stat` (`-N` registers new files in the diff without staging their content, so the changes stay unstaged for review).
- Call out **BACKEND_BUG / FRONTEND_BUG / TEST_DATA / ENV_AUTH** items prominently — these are real problems in the app, data, or environment, not the test, and no test edit was made for them.
- End with the explicit next step: the user reviews the diff + reports and, if they approve, tells you to commit the test fixes. Only then create a branch (if on `main`) and commit — in `$TARGET_REPO`, not this project.

## Guardrails
- Never weaken or delete an assertion to make a test pass — if that's the only way, it's a regression to flag.
- Never hardcode secrets, credentials, or base URLs into a spec to force a pass.
- Never edit `*.check.ts` construct files or `checkly.config.ts` as a "fix" for a failing spec.
- Everything you change stays unstaged until the user approves.
