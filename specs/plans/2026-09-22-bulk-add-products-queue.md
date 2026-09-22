# Bulk Add Products → queue + Cloud Function

> **Status: IMPLEMENTED 2026-09-22 (uncommitted, both repos).** Evidence in
> `specs/evidence/2026-09-22-bulk-add-products/` — Angular build PASS, CF emulator integration
> test 17/17 PASS, e2e readiness gate GREEN, Playwright spec compiles. Follow-ups: full live
> Playwright browser run (needs hub bootstrap) + production rules/indexes.
>
> **Revisions after first cut:**
> - **Lean job doc — ids only, no stored metadata.** `success` holds **profileid strings**; `failures`
>   hold **`{profileid, reason}`** only. No participant metadata, no `createdbyname`, no `finishedat` are
>   stored (an earlier cut wrongly enriched success/failures — reverted). Completion is signalled by
>   `retry:false && processing:false`. The **History UI resolves metadata at display time** (client
>   `getMeta` against `participant metadata`, batched by 30) — for both participants (on the modal) and
>   the creator ("who added it").
> - **Dialog redesigned** (refined admin surface, custom tab bar, status-badged **compact** job cards;
>   searchable product dropdown via `ngx-mat-select-search`; `bap-overlay` panelClass for the fit).
>   **Participant list opens in its own overlay dialog** (not an inline expansion), resolving metadata on open.


**Goal:** replace the synchronous, per-participant read/write loop in the "Add Products" dialog with a fire-and-forget queue. Client writes job docs; a Cloud Function does the work server-side (batched, Admin SDK); results + manual retry surface in a History tab.

**Two repos:**
- **starlabs-angular** (this) — dialog changes, History tab, job service, `firestore.rules`, `firestore.indexes.json`.
- **starlabs-cloud-function** (`/Users/macbook/Projects/Functions/starlabs-cloud-function`, branch `development`) — the trigger + pipeline.

**Why (WHT lives in the journal):** current `updateProduct`/`fetchPurchase` does ~6N serial browser reads (double loop × 3 serial `getDocs`) before writing anything → 10–45s spinner for 20–50 participants. See `specs/journals/2026-09-22-*` (to write).

---

## Locked decisions
- **Chunk by 100.** 1000 participants → 10 job docs, sharing a `batchId`.
- **Retry per chunk** (not per batch). Manual only — **no auto-retry**.
- **`retry` flag doubles as refire guard.** Created `true`; function flips `false` in its single final write. Button disabled while `true`.
- **`processing` + `claimedAt`** = concurrency claim (stops duplicate-delivery double-run) + stale-lock recovery.
- **Ineligible participants go into `failures`** with the real reason (`no-journey` / `multiple-journeys`) — no separate `skipped` array.
- **`description` required** at submit ("why are you adding this product").
- **History tab = all jobs**, lazy-loaded (`limit` + `startAfter`), grouped by `batchId` client-side (Option A / flat chunk docs). No `createdByUid`; no profileid filter.
- **Single product per job** (`productref` singular).
- **One job-doc write at the end** — no per-participant job-doc updates (avoids the ~1 write/sec single-doc limit).
- **Target writes = one transaction per participant** (atomic; run in parallel) — a failed participant leaves zero docs, so retry is clean and `productsdata_to_pmd` can't double-fire.

---

## Job doc — `bulkProductJobs/{docid}`

| Field | Written by | Value / note |
|---|---|---|
| `docid` | Angular | own id |
| `batchId` | Angular | shared across the ≤10 chunk docs of one submit |
| `createdat` | Angular | `serverTimestamp()` |
| `createdby` | Angular | operator **profileid** |
| `description` | Angular | **required, min 10 chars** (why the product is added) |
| `profiles: []` | Angular | profileids in this chunk (≤100) — the work queue |
| `productref` | Angular | single product |
| `packageref` | Angular | |
| `minimumpayment` | Angular | |
| `retry` | Angular init `true` / CF → `false` | trigger signal + refire guard + button-disable |
| `processing` | CF | claim lock, init `false` |
| `claimedAt` | CF | timestamp of claim; detects dead locks |
| `success: []` | CF | profileids completed (moved out of `profiles`) |
| `failures: [{profileid, reason}]` | CF | failed/ineligible + reason |
| `finishedat` | CF | last completion time |

---

## Lifecycle

```
create {retry:true, processing:false}
  → onDocumentWritten fires
     → CLAIM (txn): retry==true AND (processing==false OR now-claimedAt>10min)
                    ? set processing:true, claimedAt:now  → work
                    : ABORT
     → work set: profiles non-empty ? process profiles : drain+reprocess failures
     → per profile: ok → success[] ; err/ineligible → failures[]{reason}
     → FINAL write (once): move arrays, processing:false, retry:false, finishedat
  → trigger refires with retry:false → guard → no-op
manual retry: set retry:true → same path, processes failures
```

State: `retry:true & processing:false` = queued · `processing:true` = running · `retry:false & failures:[]` = done · `retry:false & failures:[…]` = needs attention · `processing:true & claimedAt` stale = stuck (Reset).

---

## Cloud Function tasks — `starlabs-cloud-function` (branch `development`)

| # | Task | Note / watch out |
|---|---|---|
| 1 | `onDocumentWritten('bulkProductJobs/{docid}')`, platform **`retry:false`** | must be `Written` (create + the manual-retry update both fire it) |
| 2 | **Claim** in a txn: proceed iff `retry==true && (processing==false || now-claimedAt>10min)`; set `processing:true, claimedAt:now` | this is the whole duplicate-delivery + stuck-lock fix |
| 3 | Pick work set: `profiles` non-empty → process `profiles`; else drain `failures` → reprocess | same `retry:true` triggers both; state disambiguates |
| 4 | **Batched reads**: `where('profileid','in', ≤30)` on `participantjourneyproduct` (+ `participantsproduct`, `journeyproductpurchase`), 3 collections in parallel per chunk | fixes the wasteful calls — one pass, no double `fetchPurchase`, no 3-serial reads |
| 5 | **Eligibility**: exactly one active journey (`journeystatus in initiated/ongoing/completed`); else → `failures` with `no-journey`/`multiple-journeys` | port of `addProduct` "Not Found" logic, now labeled |
| 6 | **Writes = one Firestore transaction per participant.** Each participant's set (`participantsproduct`, `journeyproductpurchase`, `participantjourneyproduct` — port `updateProduct` Phase 1 field-build — **+ `updateDeliverySequence`** read-then-write on `participantdeliverysequence`) commits atomically. Run participants **in parallel** (bounded concurrency, e.g. p-limit ~25), independent of each other. | ~4 writes/participant, well under the 500 txn cap. Atomic = **a failed participant leaves ZERO docs** → clean retry, and `productsdata_to_pmd` can never double-fire for it. One participant failing never rolls back another. |
| 7 | Per participant: txn commits → push to `success`; txn throws → push to `failures` `{profileid, reason}`. Accumulate **in memory**; write the job doc **once at the end** (arrays, `processing:false`, `retry:false`, `finishedat`). | no per-participant *job-doc* writes; the transaction is the target-collection write |
| 8 | **`updateDeliverySequence` port — pass the FULL per-profile product list, not the delta.** It `setDoc`-overwrites the whole `products` array (`authguard.service.ts:967`); a delta wipes existing entries. Keep the existing-`delivery[]` preservation map (`:948,:961`). | idempotent by construction (full read→rebuild→replace); the risk is *data loss from a partial list*, not a double-bump |
| 9 | Region `us-central1`; memory 512 MB–1 GB; cap `maxInstances` so parallel chunks don't exhaust Firestore write quota | |

**PMD cascade (verified 2026-09-22, CF repo is local-only at `/Users/macbook/Projects/Functions/starlabs-cloud-function`):** our per-participant writes fire **three** `_to_pmd` triggers — `productsdata_to_pmd` (`participantsproduct/{docid}`, `participantmetadata.js:496`), `purchaselabel_to_pmd` (`journeyproductpurchase`, :134), `journey_to_pmd` (`participantjourneyproduct`, :256). All **recompute PMD from source** (re-read the participant's whole collection, rebuild arrays from scratch, `set(merge)`), so they are **idempotent — no duplicate risk** even without the transaction. Consequences to handle: (a) 1000 participants ≈ **~3000 PMD invocations**, and `productsdata_to_pmd` reads the entire `package` collection each time (:529) → **cap `maxInstances`**, mind read quota; (b) if a target has **no `participant metadata/{profileid}` doc**, the trigger throws (logged, :546) — confirm targets have PMD docs; (c) guard at :527 needs a status- or `packageref`-change — our creates carry a required `packageref`, so they pass.

---

## Angular tasks — `starlabs-angular` (this repo)

| # | File / area | Task | Watch out |
|---|---|---|---|
| 1 | `bulk-add-products.component.*` | Replace `updateProduct()` write path with **`createJob()`**: require `description`; chunk `participants` by 100; write N `bulkProductJobs` docs sharing one `batchId`, each `retry:true, processing:false`. Remove the auto `.xlsx` download and the read loops. | keep product/participant selection UI; delete `fetchPurchase`/`reviewPurchase` write usage |
| 2 | dialog template | Add **description** input (required, min length) to the submit form | disable SUBMIT until valid |
| 3 | new `bulk-product-job.service.ts` | `createJobs(batch)`, `watchJob(id)`, `retryJob(id)` (set `retry:true`), `resetJob(id)` (clear stale `processing`), `listJobs(limit, startAfter)` | @angular/fire |
| 4 | dialog — **new History tab** | Second tab: list all `bulkProductJobs` `orderBy createdat desc`, **lazy-load** `limit` + `startAfter`. Group rows by `batchId`. Per row: status, counts (`success`/`failures`), `description`, timestamp. | client-side group headers within the loaded page |
| 5 | History row actions | **Retry** button: shown iff `failures.length>0 && retry==false && processing==false` → `retryJob`. **Reset**: shown iff `processing==true && claimedAt` older than threshold → `resetJob`. Hide Retry when `failures.length==0`. | button disabled while `retry==true` |
| 6 | submit feedback | Non-blocking toast/badge after submit ("adding N in background") listening on the batch's docs | dialog closes immediately |

---

## Rules + indexes (this repo)

| File | Change |
|---|---|
| `firestore.rules` | `bulkProductJobs`: authed users may **create**, **read (all)**, and **update only `retry`** (retry button) — align with existing authed-write posture. Result fields (`success`/`failures`/`processing`/`claimedAt`) are CF-only (Admin SDK bypasses rules). |
| `firestore.indexes.json` | single-field `createdat` desc is automatic; add composite only if a `batchId`+`createdat` server-side group/filter is later needed. |

---

## e2e coverage (before push — project rule)
Both surfaces are new/changed screens → hooks + suite via the `screen-e2e-coverage` skill:
- Changed **submit flow** (`bulk-add-products`) — one literal `data-testid` prefix, declared in the spec header.
- New **History tab** — list, Retry, Reset, empty state; seed a world with a done job, a failures>0 job, and a stuck (stale `claimedAt`) job as negative controls.
Check alignment: `python3 .claude/skills/screen-e2e-coverage/scripts/hook-diff.py "src/app/Participants Profile Management/participants-analytics/bulk-add-products" <suite>`

---

## Appendix — limits (1000 participants)

| Limit | Value | Consequence |
|---|---|---|
| `in` query values | 30 | reads chunk by 30 → ~4 batches per 100-participant function |
| Doc size | 1 MiB | 100 profileids ≈ ~4 KB — fine |
| Sustained writes / doc | ~1/sec | → write job doc once at end, not per-participant |
| Transaction write cap | 500 ops | ~4 writes/participant — far under |
| Function timeout | gen1 540s / gen2 higher | 100-participant chunk finishes in seconds |
| Write model | per-participant txn, ~25 in parallel | atomic per participant; ~400 writes/chunk ≈ a few seconds |

**Chunking:** 1000 → **10 job docs × 100**, shared `batchId`, 10 parallel invocations (~10–20s wall-clock vs ~40–90s for one doc). Read-chunk = 30 (hard limit); doc-chunk = 100 (design); per-participant transaction = atomicity unit.

---

## Confirm before build
- **Recovery of stuck jobs:** manual **Reset** button first (in plan); add a scheduled watchdog only if it bites. OK?
- **PMD-doc precondition:** should the CF **skip + record a failure** for a participant with no `participant metadata/{profileid}` doc (rather than let the downstream trigger throw)? (rec: yes — pre-check and route to `failures`.)

**Resolved:**
- `description` **min 10 chars**.
- Writes are **per-participant transactions** (CF-6/7) → a failed participant leaves zero docs, retry is clean.
- `updateDeliverySequence` idempotent; contract = **pass the full per-profile list** (CF-8), not the delta.
- **`productsdata_to_pmd` verified idempotent** (recompute-from-source) — no duplicate risk. 3 PMD triggers cascade per participant; cap `maxInstances`, mind PMD-doc precondition + `package`-collection reads.
