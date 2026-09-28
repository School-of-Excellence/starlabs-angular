# 2026-08-17 — Product funnel: approval AND attendance are EPR-only (scan confers nothing)

**Screen:** Product funnel (`src/app/Events/event-participation-confirmations/product-funnel.component.*`)

## What changed

Both the **Approved** and **Attended** buckets are now derived **only** from the
`event participation request` (EPR) doc's `status`. The `arena e-ticket log` scan no longer confers
membership of any bucket.

```ts
// before
const isAttended = attendedIds.has(pid) || isScanned;
const inCohort   = approvedReq.has(pid) || isScanned;
const cohort     = new Set([...approvedReq.keys(), ...scanned]);

// after
const isAttended = attendedIds.has(pid);                 // EPR status == 'attended'
const inCohort   = approvedReq.has(pid);                 // EPR status == 'approved' | 'attended'
const cohort     = new Set([...approvedReq.keys()]);
```

`approvedReq` is filled by both the `approved` and `attended` status branches, so **attended remains a
strict subset of approved**.

## WHY

Operator directive, in two steps on the same day:

1. A physical e-ticket scan means *ticketed at the door*, not *attended*. Counting scans as attendance
   inflated the Attended segment and the `frozenStats` rates (`Of approved` / `Of potential`), and
   pre-empted the Finalize-attendance step.
2. Same reasoning one level up: a scan is not an approval either. The EPR doc is the single record of
   truth for where a participant sits in the funnel; the scan log is door telemetry, not funnel state.

Net effect: the funnel is now a pure projection of `event participation request` statuses (plus
`participantsproduct` for ownership and `queue_token` for the eligibility split). One collection, one
truth, no inferred state.

## What the scan read is still for

The `arena e-ticket log` query at ~line 488 is **kept**. Its only remaining consumer is `row.scanned`,
which renders the `· scanned` suffix next to "Attended" in the template. It now appears only on rows
that are EPR-attended *and* were scanned. If that badge is ever dropped, the whole query and the
`scanned` field can go with it.

## Known consequences (intended)

- **Scanned-only people can vanish from the funnel.** Someone with a scan but no EPR doc and no
  `participantsproduct` ownership now produces no row at all — previously the scan alone created one
  in Approved. If they own the product they still appear (as `potential` / `owns product`).
- **`pendingNoShow` grows.** `r.isApproved && !r.attended && attendanceState !== 'no_show'` now
  evaluates over EPR-approved people only, so anyone approved and never marked attended is proposed
  as a no-show by *Finalize attendance*. That is the point: attendance must be explicitly marked.
- If door scans *should* promote someone to `status: 'attended'`, that belongs in the scan writer or
  the rollup — not in this read path.

## What was deliberately NOT changed

- `attendance_state` (the `no_show` sub-state) — same field, same EPR doc.
- Eligibility (`epc_bucket`, else `participantsproduct` + `queue_token`) — untouched.
- The Queue-stage column (`queue_token.currentstage`) — untouched.
- No template, CSS, Firestore schema, or rollup change. Only read predicates narrowed.

## Revert guide (per-screen)

Single file: `src/app/Events/event-participation-confirmations/product-funnel.component.ts`

1. **Cohort** (~line 545): restore the two-line comment and
   `const cohort = new Set<string>([...approvedReq.keys(), ...scanned]);`
2. **Row flags** (~line 568): restore
   `const isAttended = attendedIds.has(pid) || isScanned;` and
   `const inCohort = approvedReq.has(pid) || isScanned;`, dropping the 4-line comment above them.
3. **Segment label** (~line 124): restore
   `{ key: 'attended', label: 'Attended', cls: 'att', desc: 'scanned or marked', tip: 'Of the approved, how many attended (scanned or marked)' },`
4. **Comments only** (cosmetic, safe to leave): ~line 525 `(owner / scanned→approved / requested)`,
   ~line 551 and ~line 628 both referred to "a scanned-then-revoked person" as the double-count
   example; they now use an ownership example instead.

Steps 1-2 are the behavioural revert; 3-4 are wording.
