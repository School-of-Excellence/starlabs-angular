---
name: screen-e2e-coverage
description: Add e2e coverage for a screen you built or changed in starlabs-angular — test hooks, the right suite in the starlabs-e2e-tests hub, a seeded world with negative controls, the spec, hook registration, and the landing order. Run this BEFORE pushing a screen change. Triggers - "e2e for this screen", "write tests for this screen", "before I push", "add test hooks", "readiness gate blocked me".
---

# Screen → e2e coverage

The pipeline: **starlabs-angular** owns the screen and its `data-testid` hooks;
**starlabs-e2e-tests** (`/Users/macbook/Projects/Functions/starlabs-e2e-tests`, the hub) owns the
Playwright engine, the seeds and the specs. The readiness gate compares the two and blocks the push
when they disagree.

Work through the steps in order. Do not skip step 6 — it is the one the gate actually reads.

## 1. Hooks on the screen

- Naming: `<prefix>-<group>-<name>`, kebab, lowercase. **One prefix per component**, declared in the
  spec's file header (e.g. `irl` = interim-report-log parent, `ird` = the dashboard child).
- **Literal attributes only.** The scanner's regex (`scripts/readiness/lib.cjs` → `TESTID_REF`) drops
  any `data-testid` whose value contains `${…}`. A generated grid must look its attribute up in a
  table of whole literal strings:
  ```ts
  const CELL_TESTID = { 'Business|b3': 'data-testid="ird-cross-business-b3"', /* … */ };
  // template: <button class="cell" ${CELL_TESTID[key]} …>
  ```
  Same rule on the spec side: `getByTestId('literal')` only — an id passed through a helper parameter
  is invisible to the gate, so helpers take a `Locator`, not an id.
- Shadow DOM is fine: Playwright pierces open shadow roots, so `getByTestId` reaches through.
- Renaming a hook breaks whoever asserts it. Grep the hub's spec dirs before you rename.

## 2. Find the suite — never invent one

`suites-manifest.json` in the hub maps app globs to suites (`appPaths`). Find the suite whose glob
already covers your folder:

```bash
grep -n "src/app/<YourFolder>" /Users/macbook/Projects/Functions/starlabs-e2e-tests/suites-manifest.json
```

That suite's `specDir` is where your spec goes — no new Playwright config, npm script, manifest entry
or CI caller. Only if nothing matches: add the glob to the closest suite and regenerate the docs
(`node scripts/gen-suites-doc.mjs`). A brand-new suite is a last resort.

Also read the specs already in that dir: your file **adds**, it never re-asserts their cases.

## 3. Seed the world — with negative controls

Extend the suite's `seed-<suite>.js`, don't write data from the test.

- Run-tag everything: ids `` `${TESTRUNID}_…` ``, actors `<role>+<run>@example.com`, `{testrunid, _testdata:true}`.
- Add every new collection to the seed's `SEEDED` teardown list.
- **Every rule needs something that must be excluded.** Without it a green test cannot tell "the rule
  ran" from "there was nothing to drop". Examples that earned their place: a participant with reports
  but no crossover record; a journey reachable only through the second fallback field; an event
  request that is `registered` rather than `attended`.
- **Don't disturb the neighbours.** Other specs assert exact counts over shared collections — check
  before adding a doc for an actor they count (one nearby case asserts "participant0 has exactly 2
  ask-AH rows", so the new doc had to hang off participant1).
- Any route the spec navigates to needs a `dashboard` route-grant doc in the seed.

## 4. Write the spec

Copy the shape of a recent spec in the same suite. Non-negotiables:

- **File header** carrying: the recon/journal reference, the seeded world, and the anti-circularity
  argument (what is seeded vs what the app computes). This is load-bearing, not decoration.
- Ids as the first token of the title: `IRD-01 …`. Describe: `'<Suite> — <Screen> (<what is proved>)'`.
- `attachConsoleGuard` / `assertNoFatal`, `install<Suite>Stubs` **before** navigating, real-form login.
- Independent oracles from `queue/support/firestore-admin` (`getDoc`, `countWhere`, `queryWhere`,
  `pollUntil`) — never assert a value the test wrote.
- Narrow the screen to a run-unique actor first, so shared-project data cannot move your numbers.
- No `test.step`, no tags. `test.skip` only for infrastructure the test cannot create (an undeployed
  index or Cloud Function); missing data is a seed bug, not a skip.

## 5. Register the hooks no case drives

Anything you added but do not drive goes in an `ADDR` block, literal, as `test.fixme`:

```ts
test.fixme('<PREFIX>-ADDR2 … addressable (deferred behavioral)', async ({ page }) => {
  await page.goto('/<route>', { waitUntil: 'domcontentloaded' });
  expect(page.getByTestId('ird-xbucket-x1')).toBeTruthy();
});
```

## 6. Verify before pushing

```bash
# hooks line up in BOTH directions (0 missing, 0 unreferenced)
python3 .claude/skills/screen-e2e-coverage/scripts/hook-diff.py src/app/<YourFolder> <suite>

# the spec compiles and every case registers
cd /Users/macbook/Projects/Functions/starlabs-e2e-tests && npx playwright test --config=playwright.<suite>.config.ts --list

# the app still builds
cd /Users/macbook/Projects/AngularProjects/starlabs-angular && npx tsc -p tsconfig.app.json --noEmit
```

Then update the suite's row in the hub's `TEST-MAP.md` (hand-edited; `SUITES.md` is generated) and
write a hub journal in `specs/journals/YYYY-MM-DD-topic.md` saying **why** the seed looks like that.

## 7. Land it in this order

1. **App hooks first** — commit and push the starlabs-angular change.
2. **Then the spec** — branch + PR on the hub, or straight to `main` if the operator says so.

Reversed, CI runs the spec against a build with no hooks and every case fails on the first selector.

State plainly whether the cases were ever executed. A local run needs either ADC for the cloud test
project or the emulator lane (which needs the gitignored `src/environments/environment.emulator.ts`,
synthesized only in CI). If you could not run them, say the gate is the first real run.

## Environment traps

- **Check the Firebase project before any write:** `environment.development.ts` ships with
  **production** active and starlabs-test commented out. In the browser:
  `performance.getEntriesByType('resource')` → look for `projects/<id>`. Test writes belong on
  starlabs-test or the emulator, never `fir-sample-aae4a`.
- **macOS has no `timeout`** — `timeout 300 npx tsc … | grep` silently prints nothing and looks green.
- A Chrome tab running in the background throttles timers; wait on DOM changes, not `setTimeout`.
