---
description: Full pre-deploy gate for $TARGET_REPO — runs the complete suite, audits specs for fragile patterns/staleness, and typechecks, into one consolidated go/no-go report.
argument-hint: "[group folder | empty for full repo]"
---

Run the full pre-release gate against `$TARGET_REPO` (`/Users/sebastiancerpa/Desktop/checkly-test`), scoped to `$ARGUMENTS` if given, otherwise the whole repo. This command **reports and recommends — it does not deploy anything and does not fix anything itself.**

## Workflow

### 1. Run the suite
`cd "$TARGET_REPO" && npx checkly test [$ARGUMENTS] --reporter=list` — same as `/run-tests`. Capture full pass/fail results.

### 2. Audit specs
Delegate to **`spec-auditor`** (via the Agent tool), same scope. Capture both passes (fragile patterns + staleness candidates).

### 3. Typecheck
`cd "$TARGET_REPO" && npm run typecheck` — a type error here means the deploy would break regardless of what the suite shows.

Steps 1–3 have no dependency on each other — run them in whatever order is fastest, but don't skip any before reporting.

### 4. Consolidated report

```
## Pre-release check: <scope> — <date>

### Suite results
N passed, M failed
<failures listed, if any>

### Typecheck
PASS / FAIL

### Spec audit
Pass 1 (fragile patterns): N found — <highlight any in specs that are currently passing but fragile; a green fragile test is a future red>
Pass 2 (staleness candidates): N flagged for human review

### Recommendation
<GO | GO WITH CAVEATS | NO-GO>, one sentence why.
```

**No-Go criteria (state explicitly if any apply):** any failing test in the release scope, any typecheck error, or a Pass 1 fragile-pattern hit inside a spec that gates a critical flow (login, checkout, order fulfillment) — a fragile pattern in a currently-green critical-path test is exactly the kind of thing that turns into a 2am page later.

If there are failures, point to `/fix-tests` as the next step rather than diagnosing them here — this command's job is the gate, not the triage.

Never deploy, commit, push, or run `checkly deploy` for real as part of this command, regardless of the recommendation.
