# 2026-06-10 — Delivery-sequence EDIT path: null-guard the getDoc ref→path walk

**Change (load-bearing):** `src/app/Product Designer/delivery-sequence/delivery-sequence.component.ts`
constructor's edit-path `getDoc` handler (the `data != null` branch) now null-guards the Firestore
ref→path-string conversion. This is the **sibling fix** to the 2026-06-10 product-delivery *list* fix
(`2026-06-10-product-delivery-list-mutation-fix.md`), which examined this component and flagged exactly
this latent fragility but deliberately left it (it wasn't reachable by JP-AUTH, which drives the *create*
branch). It is now reachable.

## WHY it was reachable (the chain that closed)

The product-delivery LIST fix (commit `e53657b`) made `/productdelivery` render a row for **every**
`productToDeliverySequence` mapping — including ones authored with a delivery option that has **no
`deliverysequence`** (the seeded `jny_PDS1`: `deliveryoptions:[{deliverytype:'Standard Delivery'}]`).
Each row's edit button calls `editDelivery(row)` → `navigateByUrl('/deliverysequence?data=<id>')`. So the
list fix unblocked the path that lands on the edit form — whose constructor then threw.

The old edit-path handler walked the doc with **no null-guards**:

```ts
this.producttodelivery['product'] = this.producttodelivery['product']['path']
for (... of deliveryoptions) {
  for (let j = 0; j < element['deliverysequence'].length; j++) {   // undefined.length -> THROW
    seqelement['activity'] = seqelement['activity']['path']         // null['path'] -> THROW
  }
}
```

For `jny_PDS1` the inner `element['deliverysequence'].length` throws
`TypeError: Cannot read properties of undefined (reading 'length')` **inside the `getDoc(...).then()`**,
routed by zone.js to Angular's ErrorHandler → `console.error`, stranding the authoring form. (A
`deliverysequence` entry with a null `activity` would throw the `…(reading 'path')` variant.)

## The fix — and why it differs from the list's fix

The list builds a **fresh per-emit view-model** (it must: `collectionSnapshots` is a live re-emitting
stream, so mutating the snapshot self-poisons on the 2nd emit). This component is the **opposite shape**:
a **one-shot `getDoc`** feeding a **two-way-bound edit form** whose `onproducttodeliverysubmit()` converts
the path strings **back** to refs before `setDoc` (`doc(this.firestore, obj['product'])`,
`doc(this.firestore, seqelement['activity'])`). The in-place path-string mutation is **load-bearing for
that round-trip** — so the fix keeps the in-place shape and only makes each hop null-safe:

```ts
this.producttodelivery['product'] = this.producttodelivery['product']?.path ?? this.producttodelivery['product'] ?? null
this.producttodelivery['deliveryoptions'] = this.producttodelivery['deliveryoptions'] ?? []
for (let i = 0; i < this.producttodelivery['deliveryoptions'].length; i++) {
  let element = this.producttodelivery['deliveryoptions'][i]
  element['deliverysequence'] = element['deliverysequence'] ?? []   // normalize IN PLACE
  for (let j = 0; j < element['deliverysequence'].length; j++) {
    const seqelement = element['deliverysequence'][j];
    seqelement['activity'] = seqelement['activity']?.path ?? seqelement['activity'] ?? null
  }
}
```

- **`?.path ?? value ?? null`** is idempotent (tolerates an already-string path) and null-safe — same
  primitive the list fix used.
- **Normalize `deliverysequence`/`deliveryoptions` to `[]` *in place*** (not into a read-only local). This
  is the key decision: `onproducttodeliverysubmit()` **also** walks `element['deliverysequence'].length`
  with no guard, so had we only guarded the constructor's loop bound, editing `jny_PDS1` would mount the
  form but then **throw on Submit**. Writing `[]` onto the model makes the form binding *and* the submit
  walk both safe — honoring "don't break the round-trip." A subsequent Submit persists `deliverysequence:[]`
  (empty), which every consumer (`(… ?? []).map`/`for`/`.length`) already tolerates.
- **`?? []` over `deliveryoptions`** is defensive only (the seeded repro has one option); a doc with no
  options at all mounts an empty-but-non-throwing form.

The **create** branch (`data == null`) is untouched, so JP-AUTH (create + submit) is unaffected.

## Scope deliberately NOT widened

- **`onproducttodeliverysubmit()` activity=null edge:** if a *saved* `deliverysequence` entry had a null
  `activity`, the constructor guard sets it to `null` and Submit's `doc(this.firestore, null)` would throw.
  Not reachable by the seeded data (the form requires an activity; `jny_PDS1` has no sequence at all) and
  out of this fix's scope (the crash-on-open). Left as a documented latent edge.
- **"Can't add the first sequence row" UX:** the template's add-sequence button lives *inside* the
  per-row `*ngFor`, so an option normalized to `deliverysequence:[]` shows no add button. Pre-existing
  template behavior (pre-fix you couldn't open the form at all); not touched.

## Test (regression guard) — `e2e/journey/journey-deep.spec.ts` **JP-EDIT** (new)

Read-only case (never Submits, so the shared seeded `PDS1` baseline JP-PD counts is untouched): asserts the
seeded mapping reproduces the no-`deliverysequence` shape (precondition, anti-circular), navigates
`/deliverysequence?data=<PDS1>`, asserts the form mounts (the Delivery Type input carries the app-read
`Standard Delivery` value) and `assertNoFatal` (the throw is gone). `journeyIds.PDS1` added to
`support/journey.ts`.

**Negative control (proved the guard bites, not a tautological green):** reverted the component → rebuilt →
JP-EDIT **failed** with exactly
`CONSOLE.ERROR: ERROR TypeError: Cannot read properties of undefined (reading 'length')` at
`_DeliverySequenceComponent.<anonymous>` (ZoneAwarePromise/getDoc `.then` frames). Restored → rebuilt →
green. JP-PD + JP-AUTH stayed green throughout (no regression to the list/round-trip).

## ⚠️ Verification gotcha (the same `:4200` stale-sibling trap, reconfirmed)

`:4200` is served by `serve -s dist/atctranscription/browser` with cwd
`…/starlabs-angular-queue-e2e` (the **sibling worktree**) — its bundle lacks this fix; a `curl` to the new
chunk name there returns `200 text/html` (the SPA `index.html` fallback), **not** the JS. Built this repo's
fresh `dist` and served it on **`:4201`** (`200 application/javascript` for `chunk-YRYG5UDO.js`, which
carries `element["deliverysequence"] ?? []` + `productToDeliverySequence`×6 = the real component), and ran
the journey config with `BASE_URL=http://localhost:4201`. (Aside: `"are you sure want to submit"` is **not**
unique — `content/tier-access-config/config-new-tier` shares it — so a `grep | head -1` for it can pick the
wrong chunk; grep for `productToDeliverySequence` to pin the right one.)

Build: `node_modules/.bin/ng build --configuration development`. Run:
`BASE_URL=http://localhost:4201 e2e/node_modules/.bin/playwright test -c e2e/playwright.journey.config.ts --grep "JP-PD|JP-AUTH|JP-EDIT"` (3 passed, 50.9s; globalSetup teardown+reseeds).

## Pending

- Component fix is self-contained and verified green; commit atomically (mirrors how the list fix was
  committed). The JP-EDIT spec case + `journeyIds.PDS1` support addition + this journal join the
  2026-06-10 journey-deepening batch for the operator's journey-group commit. `PROGRESS.md` left to the
  operator (mid-deepening).
