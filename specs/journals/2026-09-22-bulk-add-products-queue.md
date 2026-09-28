# Bulk Add Products → queue + Cloud Function — WHY

**Date:** 2026-09-22
**Plan:** `specs/plans/2026-09-22-bulk-add-products-queue.md`
**Status:** design agreed, not yet built. Companion to the plan — plan says WHAT, this says WHY.

## The problem we started from
"Add products" in participant-analytics felt slow and "sequential." Reading the code
(`bulk-add-products.component.ts`) showed the slowness is **entirely in the read phase**, not
the writes (writes were already `Promise.all` fan-out at :629). Three stacked multipliers:

1. `updateProduct` loops participants and `await`s `fetchPurchase` **inside** the loop (:479, :497).
2. It runs that loop **twice** — a counting loop then a prepare loop — so everyone is read twice.
3. Each `fetchPurchase` does **3 serial `getDocs`** (:160/:169/:176).

→ ~6N strictly-serial browser round-trips before a single write. 20 participants ≈ 120 hops ≈
10–18s; 50 ≈ 25–45s. Latency-bound, so it scales linearly and *feels* like "one, then the next."

Notably the fix already existed in the same file: `addProduct` (:287) reads in chunks of 10 via
`where('profileid','in',batch)`. The submit path just never got it.

## Why a queue + Cloud Function, not just a client-side read fix
Batching the client reads would recover most of the speed and needs no second repo — and it stays
on the table as a fast interim win. But the operator wants "seamless and fast" **and** a retry model
for partial failures. Only offloading gives all of:
- **Instant UX** — client's job becomes one write; the wait disappears from the user entirely.
- **Server-local reads** — Admin SDK in-datacenter, no browser hop, no security-rule eval.
- **Retry + idempotency** — a failed subset can be reprocessed; today a partial client failure just
  throws and silently skips the delivery-sequence update (:634).

It is also the **house pattern** here (`queue generation`, `event participation request`,
`email/wati archive` outboxes) with its own CI suite (`queue-e2e`), so it's low-novelty.

## Why the specific constraints landed

- **Chunk by 100 (not one doc for 1000).** One doc fits the 1 MiB size limit and the timeout, but a
  single doc updated as work completes hits Firestore's ~1 write/sec-per-doc soft limit and serializes
  everything. 10 docs × 100 run in parallel (~10–20s vs ~40–90s) and each writes its own small doc.
- **Write the job doc once at the end.** Directly avoids the per-doc write-rate limit and, more
  importantly, avoids the function re-triggering itself on every intermediate write.
- **`retry` flag as the refire guard.** `onDocumentWritten` fires on create *and* update, so the
  function's own final write re-fires it. Created `true`, flipped `false` at the end → the refire sees
  `false` and no-ops. One field, reused as: trigger signal + loop guard + button-disable state.
- **`processing` (the claim).** Cloud Functions is *at-least-once* — the same event can arrive twice
  and run two instances on one job. A transactional check-and-set on `processing` lets exactly one win;
  the other aborts. Writes are idempotent (deterministic docIds + `merge:true`) so the *data* was
  already safe, but the job-doc bookkeeping could race — the claim makes it correct.
- **`claimedAt`.** The claim introduces a new failure mode: crash after claiming but before the final
  write leaves `processing:true` forever, frozen. `claimedAt` dates the lock so a stale one (older than
  max runtime) can be stolen/reset. Recovery is a manual Reset button first; a scheduled watchdog only
  if it ever actually bites — 100-participant chunks finish in seconds, so crashes should be rare.
- **Ineligible → `failures` with reason (no separate `skipped`).** Operator chose one bucket the user
  acts on. The old "Not Found Profiles.xlsx" conflated *no journey* and *>1 journey* under one label and
  auto-downloaded even when empty; folding them into `failures` with a distinct `reason` keeps them
  visible and fixable without the phantom-download annoyance.
- **Manual retry only, no auto-retry.** Operator wants a human to decide. Keeps the function simple
  (platform `retry:false`, no in-code retry) and avoids silently burning through hopeless cases
  (a no-journey profile can't be fixed by retrying — the user must create the journey first).
- **History tab = all jobs, lazy-loaded.** `createdby` is a profileid, not a Firebase uid, so it can't
  scope security rules to an owner anyway — and the operator wants everyone's jobs visible. Flat chunk
  docs (Option A) with client-side `batchId` grouping fit "show all + limit + startAfter" and per-chunk
  retry better than a parent rollup doc; a rollup was rejected as premature.
- **Required `description`.** Captures intent ("why this product") for audit — cheap now, valuable later.
- **Per-participant transaction instead of a BulkWriter fan-out.** Started with BulkWriter (fastest). But the operator's own question exposed the hole: with failed-only retry, *successful* participants are never re-written (no duplicate) — the only risk is a **failed participant with a partial write** (some of its ~4 writes landed, a later one failed). Those partial writes trigger `productsdata_to_pmd`, and if that fn appends, a retry double-fires it → duplicate. Wrapping each participant's writes (incl. the `updateDeliverySequence` read-modify-write) in **one transaction** makes a failure leave **zero** docs, so retry starts clean and `productsdata_to_pmd` can never double-fire — regardless of whether it appends or replaces. Cost: slightly slower than BulkWriter, but participants still run in parallel (~25 concurrent) and one failing never rolls back another. Correctness bought the trade.

## Surprises / things found
- Writes were **already** parallel — the "sequential" complaint was 100% reads. Easy to misdiagnose.
- An **empty `Not Found Profiles.xlsx` auto-downloads on every product selection** even when nobody is
  skipped (:369–372) — a real UX papercut the redesign removes.
- The eligibility rule is strict: **exactly one** active journey. Zero or many → skipped. This is
  load-bearing product logic that must move to the CF verbatim, not be "cleaned up."

## Open / risk before build
- **`updateDeliverySequence`** (`authguard.service.ts:936`) — *settled after reading it.* It is idempotent
  (full read→rebuild→`setDoc`-replace of the `products` array, preserving `delivery[]` by key). The real
  risk is **data loss from a partial list**: `setDoc` overwrites, so the CF must pass the *complete*
  per-profile product list, not just the newly added one. Captured as CF-8.
- **`productsdata_to_pmd`** — *verified 2026-09-22.* It **recomputes PMD from source** (re-reads the
  participant's whole `participantsproduct` set, rebuilds the arrays, `set(merge)`) → idempotent, **no
  duplicate risk** even without the transaction. The append fear was wrong. Found two real consequences
  instead: (1) **three** `_to_pmd` triggers fire per participant (products/purchase/journey), so ~3000
  invocations for 1000 participants, and `productsdata_to_pmd` reads the whole `package` collection each
  time — cap `maxInstances`; (2) it **throws if the participant has no `participant metadata` doc** — the
  CF should pre-check and route those to `failures` rather than let the trigger error.
- CF work is **local-only** in `starlabs-cloud-function@development`
  (`/Users/macbook/Projects/Functions/starlabs-cloud-function`) — no shared remote; commits there are also
  gated on operator approval.

## Revisions (same day, post-implementation review)
- **Client stopped supplying participant metadata.** The first cut had Angular write a `participantsmeta`
  map (name/email per participant) onto the job doc — client-sourced PII duplication + doc bloat, and
  nothing read it. Removed. The client now writes only `profiles: [profileid]`. The **CF sources** name/
  email/phone/mode/customerstatus from `participant metadata` (a batched `getAll` after processing) and
  writes them onto each `success`/`failures` entry. Rationale: metadata belongs to the source of truth,
  fetched server-side, not trusted from or bloated by the client. `success`/`failures` became
  `ParticipantResult[]`.
- **Dialog redesigned + History shows full metadata.** The plain Material dialog was replaced with a
  refined surface (custom tab bar, status-badged expandable job cards). History renders the CF-sourced
  metadata per participant (Added vs Needs-attention groups, with the failure reason as a tag), so an
  operator can see exactly who failed, why, and how to reach them — the point of surfacing metadata.

## Pending
Operator to confirm: stuck-job recovery (manual Reset first — agreed in plan), `description` min length,
and the `updateDeliverySequence` idempotency check. Then: Angular side can start independently; CF side
after the two CF-repo verifications above.
