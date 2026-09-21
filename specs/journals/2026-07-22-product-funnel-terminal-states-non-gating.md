# 2026-07-22 — Product funnel: revoked/unattended no longer gated out of live buckets

## What changed

Operator directive: **"even if they are revoked, let them be everywhere."**
Confirmed scope via clarifying Qs:
- **Both** `revoked` AND `unattended` should stop being treated as terminal.
- They must **still** appear in their own terminal segment (keep `isRevoked` /
  `isUnattended` flags) — i.e. shown in BOTH their terminal segment and any live
  bucket their source data still qualifies them for.

Single file: `src/app/Events/event-participation-confirmations/product-funnel.component.ts`
(inside `loadData()`).

1. **Removed the two pre-strip passes** that deleted terminal profiles from
   `requestedData` (was ~L525-526) and from `approvedReq`/`attendedIds`/`cohort`
   (was ~L553-554). They now retain whatever live membership their sources give.
2. **Removed the `isTerminal` gate** on every per-row flag (`isOwner`,
   `isScanned`, `isAttended`, `inCohort`, `isRequested`, `isEligible`,
   `isNoProduct`, `isInQueueReq`, `isNotRequested`). `isTerminal` variable
   deleted entirely (was only used in this block).
3. **Counts made row-derived (de-duplicated)** to prevent inflation now that a
   person can be in two sets at once:
   - `notRequested`: `rows.filter(r => r.isNotRequested).length` (was an
     `owners.keys()` filter that excluded terminal ids).
   - `overallRequested`: `rows.filter(r => r.isRequested || r.isApproved ||
     r.isUnattended || r.isRevoked).length` (was a raw
     `requestedData.size + cohort.size + unattendedIds.size + revokedIds.size`
     sum that would now double-count a scanned-then-revoked person).

## Why / what surprised us

- **The data doesn't actually let a revoked person re-enter the `requested`
  bucket.** `requestedData` is only populated from EPR docs with
  `status == 'requested'`; a revoked doc has `status == 'revoked'`, so it was
  never in `requestedData` to begin with. The old strips were mostly defensive
  (multi-doc edge) + the scanned/owner overlap.
- **The real, visible effect** of ungating: a terminal person who was
  **physically scanned** (`arena e-ticket log`) now shows in `approved` /
  `attended` too, and one who **still owns a product** (`participantsproduct`
  status=null) shows as `owner` / `notRequested` too — while still appearing in
  Revoked/Unattended. Revoke normally cancels the product, so the owner-overlap
  case is rare; the scanned-overlap case is the common one.
- The original author had explicitly guarded against the scanned-then-revoked
  double count in `overallRequested`; that guarantee is preserved by switching
  the count to a unique-row predicate instead of a set-size sum.

## Known caveat (not changed — flag before extending)

In the HTML, the per-row Revoke button (`product-funnel.component.html` ~L397)
shows when `row.isApproved && row.approvedRequestId`. A scanned-then-revoked
person now has `isApproved === true`, so viewing them in the Approved segment
will render a Revoke button for an already-revoked person. `markRevoked()` is
roughly idempotent (re-writes `status:'revoked'` + re-opens bulk-add), so it's
not destructive, but it's slightly odd UX. Left as-is per scope.

## Build / commit

- Change is data-shaping logic only, no template/type changes; `isTerminal`
  confirmed fully removed. (Screen is Firebase-auth + event-data gated, so no
  browser-preview verification — see memory `project_preview-harness`.)
- **Not committed** — operator gates commits/pushes (memory `feedback_no-autocommit`).

## Revert guide (per-screen)

### Screen — product-funnel (`product-funnel.component.ts`, `loadData()`)
To restore the previous "terminal = excluded from all live buckets" behavior:

1. **Re-add the pre-strips.** Above the `useBuckets` computation, restore:
   ```ts
   unattendedIds.forEach(p => requestedData.delete(p));
   revokedIds.forEach(p => requestedData.delete(p));
   ```
   and after `cohort.forEach(p => requestedData.delete(p));` restore:
   ```ts
   unattendedIds.forEach(p => { approvedReq.delete(p); attendedIds.delete(p); cohort.delete(p); });
   revokedIds.forEach(p => { approvedReq.delete(p); attendedIds.delete(p); cohort.delete(p); });
   ```
2. **Re-add the `isTerminal` gate** in the `ids.forEach(pid => …)` block:
   ```ts
   const isTerminal = isUnattended || isRevoked;
   const isOwner = !isTerminal && owners.has(pid);
   const isScanned = !isTerminal && scanned.has(pid);
   const isAttended = !isTerminal && (attendedIds.has(pid) || isScanned);
   const inCohort = !isTerminal && (approvedReq.has(pid) || isScanned);
   const isRequested = !isTerminal && requestedData.has(pid);
   const isEligible = isTerminal ? false : (bucket ? (bucket === 'eligible') : (isRequested && isOwner && !inQueue));
   const isNoProduct = isTerminal ? false : (bucket ? (bucket === 'noProduct') : (isRequested && !isOwner));
   const isInQueueReq = isTerminal ? false : (bucket ? (bucket === 'inQueue') : (isRequested && isOwner && inQueue));
   const isNotRequested = !isTerminal && isOwner && !isRequested && !inCohort;
   ```
3. **Restore the raw counts** in the `this.counts = {…}` block:
   ```ts
   notRequested: [...owners.keys()].filter(o => !requestedData.has(o) && !cohort.has(o)
     && !unattendedIds.has(o) && !revokedIds.has(o)).length,
   overallRequested: requestedData.size + cohort.size + unattendedIds.size + revokedIds.size
   ```
   (`revoked` / `unattended` / `eligible` / etc. counts were already row-derived
   and are unchanged.)
