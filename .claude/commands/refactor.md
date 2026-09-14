---
description: Refactor an existing automated spec (in $TARGET_REPO) to Senior QA standards — structure, locators, waits, assertions, dead code, and TypeScript hygiene. Leaves changes unstaged for review.
argument-hint: "<spec path>"
---

Refactor the spec at `$ARGUMENTS` (resolved under `$TARGET_REPO`, `/Users/sebastiancerpa/Desktop/checkly-test`) to the standards a Senior QA Automation Engineer would apply. **Do not change what the test covers — only how it is written.** Do not run other existing tests. Do not create new checks.

If `$ARGUMENTS` is empty, ask the user which spec to refactor before doing anything.

---

## Step 0 — Read everything before touching anything

Read the full spec and every file it imports (all fully qualified under `$TARGET_REPO`):
- The spec itself, end to end
- `constants.ts` in the same folder
- Any helper `.ts` files imported
- `$TARGET_REPO/src/__checks__/utils/*` if referenced
- The matching `$TARGET_REPO/docs/TC-XXX/*.md` if it exists

Reconstruct the intended user flow step by step. Do not assume — read.

Then produce an **audit list** of every issue found (see the checklist below). Show it to yourself before writing any code. The audit is your plan; the refactor executes it.

---

## The Senior QA Checklist

Work through every category. Each item is either a fix to apply or a deliberate "no change" if the code already does it right.

### 1. Test structure

- [ ] Wrapped in `test.describe('<Feature Name>')` with a name that matches the business flow
- [ ] Every test has `test.setTimeout(180_000)` (or a justified lower value) as the first line
- [ ] Every meaningful action is inside a named `test.step('…', async () => { … })` block
  - Step names describe the USER action, not the code: `'Filter by Active subscriptions'` not `'click filter button'`
  - Steps follow the user's logical flow (login → navigate → act → assert)
- [ ] Multiple scenarios of the same flow are separate `test(…)` cases inside the same `describe`, not one big test with branching `if/else`
- [ ] Dead code removed: unused helper functions, commented-out code, unused imports, alternative implementations left in

### 2. Locators

Priority order (use the first that uniquely identifies the element):

```
getByRole('…', { name: '…' })
getByLabel('…') / getByPlaceholder('…')
getByText('…', { exact: true })
getByTestId('…')
```

Specific fixes to apply:

- [ ] **`svg[name="..."]` → never works in React.** Replace with `aria-label`, surrounding text, or class-based filter. If a row-level icon filter is needed but no reliable selector exists, document that in a comment and skip the filter — do not silently return wrong rows.
- [ ] **`div.chakra-*` / `.inline-flex`** → replace with `getByRole` or `getByText`. Never use Chakra UI class names as selectors — they change on library upgrades.
- [ ] **`tr[role="button"]`** → replace with `page.locator('tbody tr')` (scoped to tbody, not the whole table including the header row).
- [ ] **`.or()` chains with 3+ alternatives** → simplify. If the element can't be identified without 3 fallbacks, document why as a comment. A selector that needs 3 alternatives is a selector looking for the wrong thing.
- [ ] **Bare `tr` locators** → replace with `tbody tr`. The `<thead>` row has `<th>`, not `<td>`, and will be matched by `tr` but not by `tbody tr`.
- [ ] **Locators scoped to the full page when a container is available** → scope to the meaningful container (the drawer root, the modal, the form panel) before asserting on children.
- [ ] **`nth(2)` / `first()` on ambiguous elements** → add a comment explaining which element this is and why index-based is the only option.

### 3. Waits and timing

- [ ] **Remove every `waitForTimeout(N)`** — replace with web-first alternatives:
  - Element appears: `await expect(locator).toBeVisible({ timeout: 15_000 })`
  - List data loads: `await expect(page.locator('tbody tr').first()).toBeVisible({ timeout: 15_000 })`
  - Navigation: `await page.waitForURL('**/path', { timeout: 15_000 })`
  - Drawer opens (Forest Admin — no URL change): wait for a stable element inside the drawer (e.g., `getByRole('button', { name: 'Options' }).first()`)
  - Modal closes: `await expect(modal).toBeHidden({ timeout: 15_000 })`
- [ ] **`waitForURL` after a Forest Admin row click** → remove. Drawers do not change the URL. Use drawer element visibility instead.
- [ ] **`waitForLoadState` as the only wait** → not sufficient for async data. Always follow with an element-level wait.
- [ ] **`isVisible({ timeout: N })` + manual `if` check** → replace with Playwright's web-first `expect(locator).toBeVisible()` (it auto-waits and retries internally). Only use `isVisible()` when the element's presence is genuinely optional.

### 4. Assertions

- [ ] **Every meaningful state change has at least one explicit assertion** — a test that only clicks and never asserts only proves the app didn't crash, not that it did the right thing.
- [ ] **Assertion messages are descriptive** — every `expect(…)` should have a human-readable failure message:
  ```ts
  await expect(locator, 'Order status should be "fulfilled" after completion').toBeVisible();
  ```
- [ ] **Never delete or weaken an assertion to make the test pass** — if removing it is the only way, that is a regression to flag.
- [ ] **Assertions on content use `toContainText` / `toHaveText` instead of reading `textContent()` and checking in JS** — Playwright's matchers auto-wait and retry; `textContent()` + manual `if` does not.
- [ ] **`expect(n).toBeGreaterThan(0)` on dynamic data** → consider whether the test is verifying state (use `toBeVisible`) or count (keep `toBeGreaterThan` with a message).

### 5. Test data

- [ ] **Inline strings extracted to named constants** — group related data into typed `const` objects at the top of the file:
  ```ts
  const FORM_DATA = {
    hub: 'uuid-…',
    vendor: 'uuid-…',
  } as const;
  ```
- [ ] **Email param strings, UUIDs, model names, and option labels** → constants, never inline.
- [ ] **Random data generation** → extract to a clearly named helper and place it before the `test.describe` block.
- [ ] **`process.env.EMAIL`, `process.env.PASSWORD`** → keep as-is, never hardcode.

### 6. Login pattern (Forest Admin)

Every Forest Admin spec must use this exact pattern, extracted into a named `async function login(page: Page)`:

```ts
async function login(page: Page): Promise<void> {
  await page.goto(LOGIN_URL, { waitUntil: 'load' });
  const usernameInput = page.getByRole('textbox', { name: 'Username' });
  await usernameInput.waitFor({ state: 'visible' });
  await usernameInput.fill(process.env.EMAIL as string);
  await page.getByRole('textbox', { name: 'Password' }).fill(process.env.PASSWORD as string);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/orders', { timeout: 15_000 });
  await page.getByRole('button', { name: 'New Order' }).waitFor({ state: 'visible' });
}
```

If a spec's first step after login navigates away from `/orders`, still use `waitForURL('**/orders')` to confirm login succeeded before navigating further.

### 7. Helper functions

- [ ] All helpers are `async function name(page: Page): Promise<void>` (or a typed return if they return data)
- [ ] Helpers are placed **above** the `test.describe` block, never inside a test
- [ ] Helpers do ONE thing — if a helper has 3 distinct phases, split it into 3 helpers
- [ ] Dead helpers (defined but never called) → delete
- [ ] Helper names are verbs describing the action: `filterByProgram`, `openSubscriptionDrawer`, `togglePause` — not `doStuff` or `clickOnValidSubscription` (too vague)

### 8. TypeScript hygiene

- [ ] No implicit `any` — all function parameters are typed
- [ ] `as string` casts on `process.env.*` are acceptable — keep them
- [ ] `as const` on data objects — apply it
- [ ] No unused variables or imports (`tsc` will catch these — run it)
- [ ] Return types on all `async` helpers explicitly declared (`Promise<void>` or `Promise<T>`)

### 9. Forest Admin domain rules (apply always)

These are confirmed facts from HAR/trace analysis — not assumptions:

- **Drawer navigation:** clicking a list row opens a side drawer; the URL does NOT change. Never use `waitForURL` to confirm the drawer opened.
- **Click target:** the handler fires on `<td>`, not `<tr>`. Use `locator('tbody tr').first().locator('td').first().click()`.
- **Subscription list async data:** the table populates via async GraphQL after DOM paint. Always wait for `tbody tr` to be visible before interacting with rows.
- **SVG icons:** `svg[name="..."]` always returns 0 in React. Use `aria-label` or surrounding text.
- **Drawer confirmation sentinel:** `getByRole('button', { name: 'Options' }).first()` becoming visible is a reliable signal that the detail drawer has loaded.

---

## Step 1 — Apply the refactor

Apply all applicable fixes from the checklist. Follow this discipline:

- **One concern at a time** — structure first, then locators, then waits, then assertions, then data, then cleanup.
- **No behavior changes** — if a fix would change what the test asserts or what flow it covers, stop and document it as an open question.
- **If a locator can't be improved without running the app** — leave it, add a comment: `// TODO: verify selector from trace — current best guess without DOM access`.
- **If dead code spans > 5 lines** — note it explicitly in the report before deleting.

---

## Step 2 — Typecheck

After all edits, run:

```
cd "$TARGET_REPO" && npm run typecheck
```

Fix every error before reporting. A refactor that introduces type errors is not finished.

---

## Step 3 — Report

Print a structured report:

```
## Refactor report: <spec path>

### Issues found and fixed
- [STRUCTURE] …
- [LOCATOR] …
- [WAIT] …
- [ASSERTION] …
- [DATA] …
- [DEAD CODE] …
- [TS] …

### Issues left open (need app access or human decision)
- …

### Typecheck
PASS / FAIL — <error count and list if any>

### Next step
Review the diff, then run `/run-tests <spec path>` to verify the refactored spec still passes. (Diff command depends on tracking: tracked spec → `cd "$TARGET_REPO" && git diff <spec path>`; brand-new untracked spec → `git diff` shows nothing, use `cd "$TARGET_REPO" && git diff --no-index /dev/null <spec path>`.)
```

Then show a diff-stat of the changed file so the user sees exactly what changed. For a **tracked** spec, `cd "$TARGET_REPO" && git diff --stat <spec path>`; for a **brand-new untracked** spec that produces nothing, intent-add first: `cd "$TARGET_REPO" && git add -N <spec path> && git diff --stat <spec path>` (`-N` adds it to the diff without staging content — see root `CLAUDE.md` → "Git & specs").

Do NOT commit. Do NOT push. Do NOT run the full suite.
