# 2026-11-24 — /productdelivery: fetch only mapped docs, add VideoAsk

**Change:** `src/app/Product Designer/product-delivery/product-delivery.component.ts`.

## Before
The constructor opened 7 live `collectionSnapshots` over WHOLE collections (`products`, `appointmenttype`,
`delivery forms`, `delivery report`, `delivery events`, `delivery queue`, `delivery fieldwork`) — 400+ docs
held live — only to turn `productToDeliverySequence` refs into names. `arenavideoask` was never loaded, so
VideoAsk activities (pickable in `/deliverysequence`, `arenavideoask.title`) rendered as a blank `()`.

## After (operator-approved D1–D4)
- **D1** `productToDeliverySequence` stays a live stream (table refreshes after an edit). Names are read
  ONCE per path (`fetchedPaths`); a re-emit only reads newly mapped docs. Trade-off accepted: a renamed
  product/activity shows its new name only after the screen is reopened.
- **D2** Products: only the mapped ones, not the full `products` collection.
- **D3** `resolveNames()` groups referenced paths by `ref.parent.id` and reads them with
  `where(documentId(), 'in', ≤30 ids)` (Firestore's `in` cap), all in parallel — single-field, no index.
- **D4** `arenavideoask` → `title` → type label "VideoAsk".

`DELIVERY_SOURCES` (collection → name field + label) replaces the 6 copy-pasted listeners. An activity in a
collection not in that table is not fetched and renders blank — identical to before, not a new guard.
The view-model build from the 2026-06-10 mutation fix is untouched; the template is untouched.

## Found, not changed (out of scope)
- `/deliverysequence` still loads every catalog — it needs them as picker options.
- `delivery-sequence.component.ts:267` labels fieldwork activities as `"Queue"` (copy-paste bug).

## e2e (hub `starlabs-e2e-tests`, journey suite — uncommitted on hub `main`)
- Seed: new product `P3` + mapping `PDS2` (P3 → DF1 form, APT1 appointment, VA1 VideoAsk), `arenavideoask`
  VA1 (mapped) + VA2 (negative control, mapped nowhere); `arenavideoask` added to teardown. Own product +
  mapping because PDS1 must keep NO deliverysequence (JP-EDIT) and P2 must stay unmapped (JP-AUTH).
- JP-PD now asserts the P3 row shows `name (Form)`, `name (Appointment)`, `title (VideoAsk)`, and that VA2 and
  the unmapped P2 never render. JP-03's seeded-product count 2 → 3.
- Run on a SEPARATE local emulator (Firestore 8181 / Auth 9097 / Storage 9198, config in the session
  scratchpad) because another session held 8080/9099; app served on :4300 with `environment.emulator.ts`
  ports temporarily switched, then restored. JP-PD / JP-AUTH / JP-EDIT / JP-03 pass. Against the OLD
  component, JP-PD fails exactly on the VideoAsk assertion — the test catches the gap.
- Full journey suite: 107 passed, 14 failed, 36 skipped. The same 14 (JP-02, JP-02b, JP-21, JCD-05,
  JCH-16/18/19, DDC-STK-01/02/03, DDC-FLT-01/02, DDC-CTD-01/02) also fail with the hub at HEAD (without these
  changes) — pre-existing on this local setup, not caused by this change. Not investigated.

## Pending
- Commit app change + journal (commit was blocked by a permission prompt); commit hub changes (branch first —
  hub is on `main`). Push only when the operator asks.
