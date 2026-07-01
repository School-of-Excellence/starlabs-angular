# 2026-06-07 — studio-core.spec.ts: stale `atcmodel: []` comments → `null` (and why null is load-bearing)

## What was asked
Two comments in `e2e/queue/studio-core.spec.ts` described the seeded `queue studio pairing`
(`<run>_pair_0`) as having `atcmodel: []`: the file-header SEEDED-PRECONDITIONS bullet (~:26) and the
SS-03 inline precondition comment (~:258). The seed had since changed to `atcmodel: null`. Update the
two comments only — no test logic, no assertions.

## Verified against source before touching anything
- Seed writes **null**: `e2e/fixtures/seed-test-project.js:643` (`seedStudioFlowPreconditions`) sets
  `atcmodel: null` on the pairing; `e2e/lib/fake-data.js:126/137` (`queueStudioPairing`) defaults
  `atcmodel = null` and already carried its own short-circuit rationale comment (`:122-123`, `:137`).
- The consumer: production filter `src/app/queue system/dynamic-studio/dynamic-studio.component.ts:808`
  builds each stage's `tokenlist` with
  `([null,undefined].includes(this.selectedStudio['atcmodel']) || this.selectedStudio['atcmodel'].includes(this.mapProducts[e['productref'].id]))`.

## KEY FINDING — the old comment wasn't merely stale, it was inverted
With `atcmodel: []`: `[null,undefined].includes([])` is **false**, so the `||` does **not**
short-circuit and the right operand runs `this.selectedStudio['atcmodel'].includes(this.mapProducts[e['productref'].id])`
— dereferencing `e['productref'].id` on tokens that have **no `productref`** → throws → the
`forEach`/filter dies and **no `studio-token-card` renders**. SS-03 (and the other studio cases that
load the waiting list) would never see their eligible card.

With `atcmodel: null`: `[null,undefined].includes(null)` is **true**, the `||` short-circuits, the
absent `productref` is never touched, and the filter reduces to the
`status=='ready' && currentstage==<stage> && liveassignmentid==null` discriminators the tests actually
rely on. So `null` is a **required** precondition, not an incidental seed value.

The old SS-03 comment additionally explained a `selectedStudio.atcmodel ⊇ token.productref.atcmodel`
rationale — which, under `[]`, would *throw* before any ⊇ comparison happened. That explanation was
describing behavior the code never reaches. Corrected both comments to state `null` + the one-line
short-circuit reason (matching the existing rationale already in `fake-data.js` and the seeder).

## Changed (comment-only)
- `e2e/queue/studio-core.spec.ts` header bullet (~:26): `atcmodel:[]` → `atcmodel:null` + a note that
  null is required so the eligibility filter (ts:808) short-circuits before the absent token productref.
- `e2e/queue/studio-core.spec.ts` SS-03 inline (~:258-260): replaced the `[]`/⊇ rationale with the
  `null` short-circuit explanation; preserved the conclusion (status+currentstage+liveassignmentid are
  the discriminating fields).

## What surprised us / commit scope
`studio-core.spec.ts` already held a **third** uncommitted hunk that is NOT part of this task: a
`getDocRefUpdate` change (~:650) defaulting `stagestatus: 'Approved', tokenstatus: 'Active'` + an
expanded JSDoc — part of the broader in-progress e2e effort. Per operator decision, this commit is
**surgical**: only the two comment hunks were staged (via `git diff | git apply --cached` of the
comment hunks alone), leaving the `getDocRefUpdate` change and the rest of the WIP uncommitted.

## Pending
The larger e2e WIP on `test/queue-e2e` (~21 modified files, +698/−129 — the emulator-runnable suite /
green-run effort, incl. the seed `atcmodel: null` change these comments now correctly describe) remains
uncommitted by design.
