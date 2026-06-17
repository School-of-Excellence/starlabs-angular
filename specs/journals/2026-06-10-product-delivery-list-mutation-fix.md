# 2026-06-10 — Product-delivery list: stop mutating the snapshot, build a fresh per-emit view-model

**Change (load-bearing):** `src/app/Product Designer/product-delivery/product-delivery.component.ts` `ngOnInit`
no longer mutates the `collectionSnapshots('productToDeliverySequence')` documents in place. It now derives a
**fresh view-model per emit** (idempotent + null-safe).

## WHY the bug existed (two failure modes, same root cause)

The old `ngOnInit` did, per emitted doc:

```ts
snapdata['product'] = snapdata['product']['path']            // ref -> string, written BACK onto the doc
for (... element of snapdata['deliveryoptions']) {
  for (... seqelement of element['deliverysequence']) {       // NO null-guard on deliverysequence
    if (seqelement['activity']) seqelement['activity'] = seqelement['activity']['path']
  }
}
```

`collectionSnapshots` is a **live stream — it re-emits on every change** (and the SDK can hand back the same
underlying objects). Mutating the snapshot data is therefore self-poisoning:

1. **Re-emit (prod-shaped docs):** on the 2nd emit `snapdata['product']` is already the string path from the
   1st emit, so `snapdata['product']['path']` is `undefined`, and the same self-poisoning on
   `seqelement['activity']`/the deliverysequence walk throws `TypeError: Cannot read properties of undefined
   (reading 'length')` inside the subscription callback — **before** `this.productDeliverySource.data = data`,
   so the table is left with **zero data rows** + a fatal console error.
2. **First emit (test-shaped doc):** the seeded mapping (`jny_PDS1`) has `deliveryoptions: [{ deliverytype:
   'Standard Delivery' }]` with **no `deliverysequence`** — so `element['deliverysequence'].length` throws on
   the **very first** emit. Same symptom (0 rows).

Both collapse the MatTable to header-only. Verified live (DOM showed an empty `<tbody>` + the
`Cannot read properties of undefined (reading 'length')` console error).

## The fix

Read each ref's `.path` into **new** objects/arrays; never write back:

```ts
const productPath = snapdata['product']?.path ?? snapdata['product'] ?? null
const sequence = (snapdata['deliveryoptions'] ?? []).map(element => ({
  ...element,
  deliverysequence: (element['deliverysequence'] ?? []).map(seqelement => ({
    ...seqelement,
    activity: seqelement['activity']?.path ?? seqelement['activity'] ?? null,
  })),
}))
```

- **Idempotent:** `?.path ?? value` tolerates an already-string path, so a re-emit is harmless.
- **Null-safe:** `?? []` on `deliveryoptions`/`deliverysequence` handles mappings authored without a sequence.
- Template contract preserved: `product` stays the path string (`{{mapProduct[row.product]}}`), `sequence` is
  the deliveryoptions array, each `sequence['activity']` is a path string (`{{mapDelivery[...]}}`).

## Sibling files — examined, deliberately NOT changed

- **`delivery-sequence.component.ts`** (constructor `getDoc`): same ref→path conversion, but it's a **one-shot
  read** feeding a two-way-bound edit form, and `onproducttodeliverysubmit()` converts the path strings **back**
  to refs before `setDoc`. The mutation is load-bearing for that round-trip and never re-subscribes, so it does
  not manifest the bug. (Latent fragility only: line ~69 `seqelement['activity']['path']` has no null-guard —
  an edited doc with a null activity would throw. Not exercised by JP-AUTH, which drives the *create* branch.)
- **`journey-product-purchase.component.ts`**: its `productToDeliverySequence` read is **already** non-mutating
  and null-safe (`mapProductDeliveryType[data["product"].id] = (data["deliveryoptions"] ?? []).map(...)`). No fix
  needed — correcting the original report's note that it shared the pattern.

## Test (regression guard)

`e2e/journey/journey-deep.spec.ts` **JP-PD** was tightened from a shell-only assertion to: rendered MatTable
data-row count `== countWhere('productToDeliverySequence')` (currently 4 on the shared test project: `jny_PDS1`
+ `appt_PDS1` + 2×`evt_*`), the app-resolved product name renders (`product.path -> mapProduct[name]`,
anti-circular), and **`assertNoFatal`** (the throw is gone). Its now-stale "B-PD bug tolerated" comments were
rewritten. JP-PD + JP-AUTH both green.

## ⚠️ Verification gotcha (cost ~20 min — worth remembering)

`:4200` was **not** serving this repo's build. The running `serve -s dist/...` had cwd
`/Users/antano/solarcode/ah/starlabs-angular-queue-e2e` — a **sibling worktree** — so `:4200` served that
worktree's **stale** bundle (old `chunk-SOMRNYGC.js` = pre-fix product-delivery), and the test hit old code
(0 rows) even though `ng build --configuration development` here produced the fixed `chunk-7Q6ERUG4.js`.
Verified by serving **this** repo's fresh `dist` on `:4201` and running with `BASE_URL=http://localhost:4201`
(the journey config honors `BASE_URL`). Content-type tells them apart: a real chunk returns
`application/javascript`; a missing one returns `text/html` (the `serve -s` SPA fallback — so a curl `200` is
**not** proof the file exists).

**To see this fix on `:4200`:** rebuild/redeploy the served worktree (`starlabs-angular-queue-e2e`), or restart
`serve` against this repo's `dist/atctranscription/browser`.

## Pending

- The component fix is committed (atomic `fix(...)`). The JP-PD spec tightening (in the untracked
  `journey-deep.spec.ts`) and this journal join the 2026-06-10 journey-deepening batch for the operator's
  journey-group commit. `PROGRESS.md` left to the operator (mid-deepening, uncommitted).
</content>
