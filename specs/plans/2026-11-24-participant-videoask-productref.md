# Plan — productref on /participantvideoask (2026-11-24, approved)

Screen: `src/app/participant-videoask/` (route `/participantvideoask`). Only `.ts` and `.html` change.

## Agreed decisions
- `productref` on `participantvideoask` is a DocumentReference to `products/{id}`.
- Live/queue events carry no product of their own (products live on `arena events`); `productref` is an
  independent link.
- Product filter options = ONLY products that have a videoask step in their delivery sequence. No DFU filter.
- Product filter joins the event group — OR with Live / Queue / Workshop.
- Event cell shows EVERY ref a row carries, as-is (unknown ref -> raw id, as today).
- "Load only related documents" was dropped (filters need the full lists).

## 1. Bootstrap — product list
- 7th read in the existing `Promise.all`: all of `productToDeliverySequence` (the nested
  `deliveryoptions[].deliverysequence[].activity` cannot be queried server side).
- Keep a mapping when any `activity` ref's parent collection is `arenavideoask`; collect its `product` ref.
  Mappings with no `deliverysequence` / null `activity` exist in data (e.g. seeded `jny_PDS1`) and simply have
  no videoask step.
- Fetch only those products: `where(documentId(), 'in', ids)` chunked by 30.
- `normalise(snap, 'product', d => d['product'])` -> `eventIndex['products/{id}']`, `productList`.

## 2. Row display — all refs
- `eventRefs(row)`: every present ref in field order `arenaevent`, `queueref`, `workshopref`, `productref`.
- `eventLabel(ref)` / `eventKind(ref)` take a single ref; cell loops: `Workshop X (Workshop) · Product Y (Product)`.
- `KIND_LABEL['products'] = 'Product'`. Event-column sort = labels joined in field order.

## 3. Filter — Product in the OR event group
- `product` form control + Product dropdown in "Filter by any of these events".
- `hasEvent` includes product; `onSearch` adds chunked `where('productref', 'in', refs(c, 'products'))`.
- searchText / onOptionSearch / onPanelClosed / onResetForm / activeFilterCount / eventPills / eventTitle.

## 4. e2e (profiles suite, starlabs-e2e-tests)
- Literal `pva-*` hooks for the product dropdown + its search box + the event-cell ref chip.
- Seed: product WITH a videoask step (listed), product WITHOUT (negative), mapping with no deliverysequence,
  videoask rows: productref-only, workshopref+productref, workshop-only.
- Cases: dropdown lists only the videoask product; Product OR Workshop filter; cell shows both refs.

## After
Build, commit app hooks first then spec; journal + PROGRESS.md.
