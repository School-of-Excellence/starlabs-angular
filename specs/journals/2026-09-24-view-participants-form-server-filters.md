# 2026-09-24 — View Participants Form: filters query Firestore

Screen: `src/app/Participants Profile Management/view-participants-form/` (ts, html, css).

## What changed
| Before | After |
|---|---|
| One query: `formsByClient` by date only; every dropdown/Liked/Flagged filtered the loaded rows in the browser | **Fetch** sends date + participant + queue + workshop + form + liked + flagged to Firestore as `where()` clauses |
| Dropdowns applied instantly (client-side) | Dropdowns/toggles are staged; a "Changes not applied — press Fetch" pill shows until Fetch |
| Blocking dialog on fetch; each Fetch leaked a live `collectionData` subscription | Inline: Fetch button spinner, progress bar + overlay on the table; previous fetch subscription is unsubscribed |
| Flat `top-bar` row of controls | Card-style filter panel: grid of fields, Liked/Flagged toggle chips, secondary actions, primary Fetch |
| Clear-all called `ngOnInit()` (re-subscribed valueChanges every click) | `clearFilters()` resets and re-fetches |

My Forms chips and Import Emails stay **instant client-side refinements** of the fetched rows (imported emails can be hundreds of ids — beyond Firestore's `in` limit).

## Why
- Firestore caps a query at **30 disjunctions** (product of all `in` sizes). `buildQueries()` puts the smallest filters in whole, chunks the first that doesn't fit across parallel queries (merged + de-duped by `docid`), and leaves any rest to the table predicate.
- The table predicate (`customfilter`) still applies every filter, now from `appliedFilters` (snapshot at Fetch time) — so results are correct even when a filter couldn't go server-side.
- **Missing composite index** (`failed-precondition`) → automatic fallback to the old date-only query + browser filtering, with a notice. Nothing breaks before indexes exist.
- Refs are built against the `firestore-forms` DB (`queue generation/{id}`; workshops `workshopconfiguration/{id}` or `eiflix workshop/{id}` by origin list), matching how `formtemplate.component.ts` writes `queueref`. **Unverified for `workshopref`** — no writer found in this repo; if workshop-filtered fetches return 0 rows unexpectedly, check a real doc's `workshopref` path.

## Indexes needed (firestore-forms DB, collection `formsByClient`)
Each: `<field> ASC, date DESC` for `profileid`, `formname`, `queueref`, `workshopref`, `liked`, `tagged` (index merging covers combinations). Use the link printed in the console on first `failed-precondition`.

## Revert
`git checkout -- "src/app/Participants Profile Management/view-participants-form/"` restores the client-side filtering + old top bar (all three files changed together).

## Pending
- Create the 6 indexes in the forms DB.
- e2e: new hooks `vpf-filter-panel`, `vpf-active-filter-count`, `vpf-pending-changes`, `vpf-result-count`, `vpf-fetch-spinner`, `vpf-fetch-notice`, `vpf-fetch-progress`, `vpf-fetch-overlay` need spec coverage before push.
- Not visually verified: dev build currently fails on the untracked `Participant Intelligence/` folder (AudienceSwitcherComponent not exported), unrelated to this screen.

## Follow-up: exports were slow (same session)
**Cause:** Excel, Merged PDF and Individual PDFs each ran two sequential `getDoc`s per selected row (`delivery forms` template + a re-read of the `formsByClient` doc). N rows → 2N round trips in series. Excel never used the template; the `formsByClient` re-read duplicated data already in the table rows.

| Export | Before | After |
|---|---|---|
| Excel | 2N sequential reads | 0 reads — built from the table rows |
| Merged PDF | 2N sequential reads | 1 parallel read per **distinct** form template (`loadFormTemplates`) |
| Individual PDFs / single PDF | 2 reads per file | templates loaded once up front; `generateAndDownloadPDF(form, template?)` |

Behaviour change: Excel no longer skips rows whose `delivery forms` template was deleted (it never needed the template). PDFs still skip or fail those rows, since they render from the template. The 500 ms delay between individual PDFs is kept, because browsers block rapid multi-downloads.
Revert: same `git checkout` of the component folder.

## Follow-up: loading ended before all docs arrived
**Cause:** `collectionData` emits a listener's first snapshot even when it only comes from the local cache (`metadata.fromCache`). That can be partial, e.g. docs cached from the previous fetch, and it switched `isFetching` off early. After that, the server results made the table grow.
**Fix:** `liveQuery()` wraps `onSnapshot(..., { includeMetadataChanges: true })` and passes `fromCache` through. `isFetching` only turns off once **every** chunked query has a server-confirmed snapshot. Selection is also cleared only on that first server result. Before, it was cleared on every live update, so liking or flagging a row wiped the selection.

## Follow-up: no live listeners (operator directive)
The screen now uses **one-shot `getDocs` only**. `runFetch()` does `Promise.all(getDocs)` across the chunked queries. The queue dropdown list moved from `collectionData` to `getDocs`. No `collectionData` or `onSnapshot` calls are left in the component.
- The previous `fromCache`/`liveQuery` fix is removed. `getDocs` resolves with the full server result, so loading ends only once everything has arrived.
- A `fetchSeq` counter drops responses from an older fetch if a newer one was started (it replaces unsubscribing).
- Like, flag, opportunity and notes edits already update the row in place, so the table stays correct without a listener. Edits made by other users show up on the next Fetch.

## Follow-up: Opportunity filter
Added an **Opportunity** toggle chip (`vpf-filter-opportunity`, green) next to Liked and Flagged. It works like them: it's staged until Fetch, then sent as `where('opportunity', '==', true)` and also checked in the table predicate. It needs another `formsByClient` index in the forms DB: `opportunity ASC, date DESC`. Until then, the missing-index fallback filters it in the browser.
