# 2026-07-08 — Product funnel: align attendance writes with event-participation-approve; lock `attendance_state` to Finalize only

**Screen:** Product funnel (`<app-product-funnel>`), embedded in the routed `event-participation-confirmation` page.
**File:** `src/app/Events/event-participation-confirmations/product-funnel.component.ts`

## What changed
Two write paths to the `event participation request` collection were brought in line with `event-participation-approve.component.ts`, which writes **only** `status`:

1. **Mark attended** (`markAttended`, ~line 857): request write reduced from
   `{ status: 'attended', attendance_state: 'attended', attendance_source: 'manual', attendance_marked_at: serverTimestamp() }`
   → `{ status: 'attended' }`.
2. **Mark unattended** (`markUnattended`, ~line 911): request write reduced from
   `{ status: 'unattended', attendance_state: 'unattended', attendance_source, attendance_marked_at }`
   → `{ status: 'unattended' }`.
3. **Unattended product cancel** now matches event-approve: instead of cancelling the row's `r.participantproductid` directly, it cancels the product referenced by the **deliverable** (`deliverableData.participantproductid`), inside the deliverables loop, only when a deliverable exists.

**Untouched:** `finalizeAttendance` (~line 985) still writes `attendance_state: 'no_show'` (+ source + timestamp). This is now the **only** writer of `attendance_state` in the entire codebase.

## Why
- Operator wants the funnel to follow event-approve's schema — no extra fields on the request docs.
- Empirically, `attendance_state` in the live DB only ever holds `attended` / `unattended`, both of which are **pure duplicates of `status`** → redundant, safe to drop.
- The one value that is NOT derivable from `status` is `no_show`: a no-show keeps `status: 'approved'` (product preserved) and is flagged solely by `attendance_state === 'no_show'`. That value is written only by the "Finalize attendance" button, which (per the DB having zero `no_show` rows) has never actually been run. So the No-show feature is dormant but retained — operator explicitly wants `attendance_state` kept "only for this button."
- Reads still work: for `attended` rows the read falls back to `'attended'` (line 347); `unattended` is hardcoded (line 348); `no_show` still round-trips via the Finalize write read at line 346.

## Behavioral note / risk
Matching event-approve's product-cancel means a request that has a product **but no deliverable** will no longer have its product cancelled on unattend (event-approve has the same gap). Previously the funnel cancelled it directly from the row regardless of deliverables. Accepted as the price of parity.

## Revert guide (per-screen)
Single file, self-contained. To revert to the funnel's prior behavior:
1. `markAttended` request write → restore the 4-field object (`status: 'attended', attendance_state: 'attended', attendance_source: 'manual', attendance_marked_at: serverTimestamp()`).
2. `markUnattended` request write → restore `{ status: 'unattended', attendance_state: 'unattended', attendance_source: 'manual', attendance_marked_at: serverTimestamp() }`, and restore the direct product cancel `if (r.participantproductid) batch.update(participantsproduct/r.participantproductid, { status: 'cancelled' })` inside the `targets.forEach`; remove the product-cancel added to the deliverables loop.
No other file, shared component, route, or collection schema changed. `serverTimestamp` import is still used (finalize + other writes), so no import cleanup needed.

## Pending
- Open decision deferred: whether to eventually remove the dormant No-show UI (tile/column + Finalize flow) entirely for full parity. Operator chose to keep it (option b). No action.
