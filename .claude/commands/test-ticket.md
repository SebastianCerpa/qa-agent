---
description: Analyze a ticket, then execute its flow against staging like a real user (throwaway Playwright run) — capturing pass AND fail evidence, showing it in chat, and explaining any failure via playwright-triage. Never adds a permanent spec, never commits.
argument-hint: "<Linear ID/URL, or a pasted ticket/flow description>"
---

Take a ticket, figure out **what a user would actually do**, then **do it** against the real staging app — and prove it with evidence. This is exploratory execution, not spec authoring: the test that runs is a **throwaway**, captured for evidence and then set aside (never added to the suite, never committed).

It sits between `/from-ticket` (which only *writes* a spec/checklist, never runs it) and `/run-tests` (which runs *existing* specs, not a ticket). Use this when the user says: "prueba este ticket", "testea el ticket como un usuario", "¿esto funciona en staging?", "reproduce el flujo del ticket", "test this ticket end to end".

`$TARGET_REPO` = `/Users/sebastiancerpa/Desktop/checkly-test`. **Every Bash command runs as `cd "$TARGET_REPO" && ...`; every file path is fully qualified under `$TARGET_REPO`** (see root `CLAUDE.md`).

---

## Phase 0 — Resolve the ticket (source = Linear **or** a pasted description)

`$ARGUMENTS` can be either:

- **A Linear ID/URL** (matches `^[A-Z]{2,}-\d+$`, e.g. `ENG-123`, or contains `linear.app`) → delegate to the **`linear-liaison`** subagent (Agent tool) to fetch title, description, acceptance criteria, labels, and any referenced data. This is a **read-only fetch** — `linear-liaison` never creates/updates/comments on the ticket.
- **Anything else** → treat `$ARGUMENTS` as a pasted ticket/flow description; use it directly.
- **Empty** → ask the user for a Linear ID/URL or a pasted description before proceeding.

## Phase 1 — Analyze: identify what to do (before touching staging)

From the ticket/description, extract and state back to the user, briefly:

- **App + role** — Forest Admin / Portal / Google Catalog / Get, and which user (admin, hub operator, customer…). If it doesn't map cleanly to a known AppGroup, say so and ask rather than guess.
- **The happy path a real user would follow** — concrete, ordered steps from login to the final expected state.
- **The acceptance criteria** — the observable end state that means "this works" (a visible confirmation, a row that appears, a status that changes — not "it should work").
- **Test data required** — specific order IDs, emails, records the flow depends on. Env-based secrets (`EMAIL`/`PASSWORD`/`ApiKey`) are already available; only *flow-specific* data is a gap. If the flow needs seeded data that isn't provided, flag it now — staging data prep is a known manual gap (see root `CLAUDE.md` → "Pending").

Keep this to a short **"esto es lo que voy a probar"** block so the user can catch a misread before we hit staging. If the ticket is broad or ambiguous enough that the happy path isn't clear, either ask **one** clarifying question or delegate the decomposition to **`test-case-planner`** — don't invent a flow the ticket doesn't describe.

**Staging is real — gate mutating flows.** If the flow performs **mutating actions** (create / submit / delete / pay / transfer), say so explicitly in the plan and get a quick go-ahead before running, because the run will actually change staging data and can't be paused mid-script. Read-only / navigation-only flows proceed directly.

## Phase 2 — Author the throwaway exploratory spec

Delegate to the **`spec-writer`** subagent (Agent tool), passing the analyzed app + happy-path steps + acceptance criteria + test data + the ticket content verbatim. Give it this explicit **EXPLORATORY THROWAWAY contract**, which overrides its default delivery:

- Write **only** the `.spec.ts` — **no `.check.ts`**, do **not** register it as a Checkly construct, do **not** add it to the suite.
- Path: `$TARGET_REPO/src/__checks__/<AppGroup>/_exploratory-<slug>.spec.ts` (leading `_exploratory-` marks it as scratch; it lives under the AppGroup folder only so `./constants`, `./login`, etc. resolve and both Playwright configs discover it). `<slug>` = the Linear identifier lowercased (`eng-123`) or a short kebab feature slug.
- Log in via the app's normal pattern using `process.env.EMAIL` / `process.env.PASSWORD` — **login is done by the code reading env vars, never by hand.** Never hardcode secrets.
- Wrap each user action in `test.step('<what the user does>', …)`, and after each meaningful step capture a **success screenshot**:
  `await page.screenshot({ path: 'triage-output/exploratory/<slug>/NN-<step>.png' });` (NN = zero-padded order). These are the "pruebas satisfactorias".
- End with a real assertion on the acceptance criteria (`expect(...).toBeVisible()` etc.). **Do not weaken or omit this assertion to make the flow pass** — the assertion *is* the test.
- Follow all repo conventions (locator priority, no `waitForTimeout`, drawer vs URL waits, Forest login caveats). Do **not** run the spec — the command runs it. Do run `npm run typecheck` and fix type/import errors before handing back.

## Phase 3 — Execute it like a user (one instrumented run)

Run the throwaway spec **once**, from `$TARGET_REPO`, under the **triage config** (`playwright.triage.config.ts`) so we get a full trace + a HAR + an auto screenshot-on-failure with **zero** changes to the spec, all isolated to this run's folder. Use exactly this shape — `cd … && export TRIAGE_HAR=… && npx playwright …` — because each segment matches a pre-approved allow-list entry in `.claude/settings.local.json` (`Bash(cd *)`, `Bash(export TRIAGE_HAR=*)`, `Bash(npx playwright *)`), so it runs **without a permission prompt** in the Qualitech runner. The inline-env form (`TRIAGE_HAR=… npx …`) does **not** match and would prompt every time:

```
cd "$TARGET_REPO" && export TRIAGE_HAR=triage-output/exploratory/<slug>/network.har && npx playwright test src/__checks__/<AppGroup>/_exploratory-<slug>.spec.ts --config playwright.triage.config.ts --output=triage-output/exploratory/<slug>/artifacts
```

`triage-output/` is gitignored, so everything captured stays local and uncommitted. Capture stdout/stderr and the exit code. Then read what landed in `triage-output/exploratory/<slug>/`:

- `NN-*.png` — the per-step success screenshots (the good evidence).
- `artifacts/…` — the failure screenshot + `trace.zip` (only present on failure).
- `network.har` — every request/response with bodies (the "was it the backend?" signal).

## Phase 4 — Verdict + evidence

### If it PASSED
Every step ran and the acceptance assertion held. Collect the ordered `NN-*.png` success screenshots — that's the proof the flow works as a user expects.

### If it FAILED
A step or the acceptance assertion broke. Delegate to the **`playwright-triage`** subagent (Agent tool), handing it the spec path, the test name, the raw error, and the **already-captured** artifact paths (screenshot, `trace.zip`, `network.har`). Instruct it explicitly: **use the provided artifacts — do not re-run the browser; diagnose and report only — do not edit any file.** It attributes the failure to one of `TEST_BUG` / `FRONTEND_BUG` / `BACKEND_BUG` / `TEST_DATA` / `ENV_AUTH` / `INFRA_FLAKY` and writes a report to `triage-output/`.

Read the verdict — it decides what "failed" actually means:

- **`FRONTEND_BUG` / `BACKEND_BUG`** → this is the **"algo está mal programado"** case. Report it as a real finding, with evidence, and then **draft a Linear bug ticket for review**: delegate to **`linear-liaison`** (Agent tool) with the triage report path, exactly as `/file-bug` does. `linear-liaison` **drafts only — it never creates, updates, or comments on a Linear issue.** Show the draft in chat for the user to analyze; do **not** submit it. Creating the real ticket needs the user's fresh explicit yes (mode 13 discipline), which running this command does not grant.
- **`TEST_DATA`** → the flow needed seeded data we didn't have; it's an environment/data gap, not an app bug. Say so, and name what data would be needed.
- **`ENV_AUTH`** (e.g. Google Auth redirect at Forest login) → per hard rule this is a **developer/env bug, not a product pass/fail**. Report it as **BLOCKED**, and do **not** touch the login code to work around it.
- **`INFRA_FLAKY`** → environmental noise. Say the run was inconclusive; suggest `/hunt-flaky` if they want confidence.
- **`TEST_BUG`** → our throwaway script was wrong (bad selector / missing wait / wrong navigation), **not** the app. Because the spec is disposable, you may apply **one** minimal self-correction to the scratch spec (selector/wait/navigation only — **never** weaken or remove the acceptance assertion) and **re-run once** (Phase 3 again). Then take the final outcome:
  - Passes on retry → report PASS, and note plainly that the first exploratory attempt had a script-level miss (say what), so this is not evidence of an app problem.
  - Still fails → re-run `playwright-triage` on the fresh artifacts for the final verdict and report that.
  - Bound this to **one** retry — do not loop.

## Phase 5 — Show the evidence in chat and explain

Surface the evidence on **both** outcomes. **The Qualitech web runner renders text only — it cannot display an image inline, and `SendUserFile` is not available there** — so the primary, always-works channel is a written manifest, not an inline image:

- **Read** the key screenshots yourself (the ordered `NN-*.png` on success; the failure screenshot on failure) so your explanation is grounded in what they actually show, then **describe** each in one line.
- Print an **evidence manifest**: every saved file with its **absolute path** under `triage-output/exploratory/<slug>/` and a one-line caption, so the user can open them from disk ("`…/01-landing.png` — landing page", "`…/EVID-*.png` — the banner under test"). This is what makes the evidence usable in Qualitech.
- **Only if** the current runtime actually exposes `SendUserFile` (e.g. the desktop Code tab, not the Qualitech web app) may you *additionally* call it (`display: "render"`) to show the images inline. Never depend on it, and never let its absence block the report.
- Then write the verdict:

> **Ticket:** `<ID/title>` — <app / role>
> **Resultado:** ✅ PASÓ  /  ❌ FALLÓ  /  ⛔ BLOQUEADO
> **Lo que probé (como usuario):** <the ordered steps, one line each>
> **Evidencia:** <the screenshot filenames shown above, under `triage-output/exploratory/<slug>/`>
>
> On failure, add:
> **Qué pasó realmente:** <plain-Spanish root cause from triage — the step that broke, what the trace/HAR showed>
> **Culpable:** <TEST_BUG / FRONTEND_BUG / BACKEND_BUG / TEST_DATA / ENV_AUTH / INFRA_FLAKY> — <one line on why>
> **Reporte de triage:** `triage-output/report-<slug>.md`
> **Siguiente paso:** <e.g. "revisa el **borrador de bug** de arriba; dime 'créalo' y lo abro en Linear (nunca lo creo sin tu sí)", or "provee el dato X y lo re-corro", or "`/hunt-flaky` si sospechas ruido">

Explain in plain language *why* it failed — never stop at Playwright's raw error line.

## Phase 6 — Clean up (it was throwaway)

Keep the evidence folder `triage-output/exploratory/<slug>/` (gitignored, so the user can reopen the screenshots/HAR/trace). Move the scratch spec into that folder as a record so it never lingers in the suite area:

```
cd "$TARGET_REPO" && mv src/__checks__/<AppGroup>/_exploratory-<slug>.spec.ts triage-output/exploratory/<slug>/
```

(The scratch spec is untracked — `??` in `git status` — so it's just a plain file move; there's no committed baseline to worry about. Once moved under `triage-output/` it's outside `testDir`, so no config will ever auto-discover it again.) If for any reason you'd rather discard it outright, `rm` it — **do not** `git checkout -- <file>` on an untracked file (that errors and reverts nothing; see root `CLAUDE.md` → "Git & specs").

Note: `mv`/`rm` are deliberately **not** on the pre-approved allow-list, so this one cleanup step surfaces a single approval prompt in the Qualitech UI. That's expected and intended — a visible confirmation before the throwaway is removed. Approve it to finish; every earlier step in the flow was allow-listed and ran without prompts.

## Guardrails

- **Throwaway only.** Never leave a `.check.ts` behind, never register the flow as a Checkly check, never add it to the suite. If the user *does* want this automated for real, that's `/automate` or `/from-ticket` — say so, don't do both jobs here.
- **Never commit, push, or open a PR.** Never create/update/comment on any Linear issue — the source ticket is read-only (Phase 0), and a bug ticket (Phase 4) is only ever **drafted** for review, never submitted without the user's fresh explicit yes.
- **Never weaken or delete the acceptance assertion** to force a green — if the only way to "pass" is to weaken it, the flow genuinely fails and that's the finding.
- **Never hardcode secrets; never type credentials by hand** — login goes through code reading `process.env`.
- **24h frequency is company policy** — irrelevant here (no construct is written), but never suggest changing it.
- **Gate mutating staging actions** on a quick user go-ahead (Phase 1); read-only flows proceed.
- Keep to **one** self-correction retry for a `TEST_BUG`; beyond that, report honestly rather than chasing green.
