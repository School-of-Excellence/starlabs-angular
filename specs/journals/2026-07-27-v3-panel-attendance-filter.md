# 2026-07-27 — live-event-dashboard-v3: "Only attendance log" panel filter

## Context

`live_event_dashboard_v3` has **no prior journal** — a grep over `specs/journals/`
and `specs/plans/` for `dashboard-v3` returns nothing. The screen's design
rationale lives entirely in the header comments of
`src/app/Events/live-event-dashboard-v3/live-event-data.service.ts`, which cite
each method's origin (FT = first-timers-dashboard, V1 = live-event-dashboard,
V2 = live-event-dashboard-v2). This entry starts the record.

## What the screen does (the two things reviewed this session)

### Manual attendance marking

The **only** attendance write in v3. Reachable from exactly one place: the
drill-down panel opened via the per-day **Unattended** tile
(`openAttAbsent()` sets `panelMarkable = true`; `openPanelRows()` resets it to
`false` on every open, so no other list gets the button).

`LiveEventDataService.markAttendance()` writes one doc into **`arena e-ticket
log`** — the same collection the QR scanner writes to, so manual marks and scans
are indistinguishable to every downstream reader.

Four decisions already encoded there, restated so they are not re-litigated:

- **doc id = the participant's `arena e-ticket` docid** when they have one →
  the write is idempotent; marking twice overwrites rather than duplicating.
  Falls back to an auto id when there is no e-ticket.
- **`logdate: Timestamp.now()`, not `serverTimestamp()`** — a pending
  `serverTimestamp()` reads back `null` locally and
  `subscribeToAttendance()` calls `logdate.toDate()` unguarded, which would
  throw. Client time avoids the crash.
- **`markedmanually: true`** — audit flag distinguishing manual marks from real
  QR scans.
- **`product` / `eticketref` written only when an e-ticket exists**;
  `product` = `doc('products', ticket.producteligible[0])`.

UI side is optimistic: `markedIds` is local-only and never read back from
Firestore. The live `arena e-ticket log` subscription is what actually moves the
person out of the absent set. `panelRows` is a snapshot taken at open time, so
the marked person stays visible until the panel is reopened — which is precisely
why the local "✓ Marked" state has to exist.

### List filters

Every drill-down list is the same single panel, so all lists share two filter
mechanisms: a free-text `panelSearch` (case-insensitive substring over
name **or** email) and the `panelFilter` chips. Both are pure client-side
filtering over the snapshotted `panelRows` — no Firestore query is re-issued —
and both reset on every panel open.

## Change landed

Added an **"Only attendance log"** chip (operator request): show participants
with at least one scan document.

The existing `unattended: boolean` became a tri-state axis:

```ts
panelFilter: { type: 'all' | 'ft' | 'rp'; attendance: 'all' | 'none' | 'has' }
```

**WHY tri-state rather than a second boolean:** "No attendance log" and "Only
attendance log" are contradictory. Two independent booleans would let an
operator tick both and silently get an empty list with no explanation. One field
makes that state unrepresentable. The toggle shape now mirrors the existing
First timers / Repeat pair exactly — clicking the active chip returns to `all` —
so the panel has one consistent interaction idiom rather than two.

The predicate reuses the unchanged `hasAttendanceLog()` (`mapAttendence[pid]`
non-empty, i.e. at least one scan on *any* day of the event); the new chip is
just its positive form. It AND-combines with the type chips and the search box.

Touched:
- `live-event-dashboard-v3.component.ts` — `panelFilter` shape,
  `togglePanelAttendance()` (replaces `togglePanelUnattended()`),
  `panelFilterActive`, `matchesPanelFilter()`, and the reset in
  `openPanelRows()`.
- `live-event-dashboard-v3.component.html` — second chip; reuses the existing
  `.pf-chip.on` style, no CSS change.

**Verified:** `tsc --noEmit -p tsconfig.app.json` clean; no stale `unattended` /
`togglePanelUnattended` references. A full `ng build` (which is what actually
type-checks templates) was **not** run — the operator verifies the running
screen (standing rule: Claude does not run/serve/build this app for
verification).

## Surprise / gotcha

`panelParticipants` is **not** memoized, unlike the heavier derived getters that
go through `memo()`/`viewVersion`. It re-runs on every change-detection pass,
and `panelCount` plus `panelExport()` each call it again — roughly 3× per pass
on an open list. It is plain in-memory filtering so it is not obviously the
cause of anything, but it is worth remembering given the open app-wide Firestore
performance issue.

## Second change: manual marking now requires a ticket + product selection

Operator problem: `product` was frequently null on manually-marked attendance
logs. Root cause was two-fold — the whole `if (ticket)` block was skipped for
participants with no e-ticket, and even when it fired it picked
`producteligible[0]`, an **arbitrary** element (that array is built by approval
order via `push`/`arrayUnion` in `arena-e-ticket-approve`, and consults nothing
else).

### What we learned about the data model (investigation)

- "Which products belong to event X" = docs in **`arena events`** where
  `eventref == event.docref`; each has a `productref` → `products`. The event doc
  mirrors the ids in `arenaeventidlist`.
- A **`heroevent: boolean`** exists on each `arena events` doc, set by an
  operator checkbox in the Manage Arena Events section of the Update Event
  dialog. It is **not** single-select — zero or many rows per event can be hero,
  and the only existing consumer (`live-event-dashboard-v2`,
  `loadParticipantHistory`) already treats it as a set, `heroProductIds[]`.
- `EXCLUDED_PRODUCT_ID` (used by `isFirstTimer`) is a **separate and
  contradictory** mechanism: one hardcoded product id per Firebase environment,
  identical for every event, unrelated to `heroevent`. v3's own comments flag
  the disagreement as unresolved. **Left untouched.**
- The QR scanner does **not** derive a product: it shows the ticket's whole
  `producteligible` list and a human taps one (`afterProductSelect`). So there
  was no existing automatic rule to copy — any rule here would be new.

### Decision (operator, 2026-07-27)

Hero-product resolution was **considered and dropped**. Rather than infer a
product, the operator picks it — the same shape the QR scanner already uses.

- Mark attendance now **fetches** the participant's e-ticket at click time:
  `arena e-ticket` where `eventref == selectedEvent && profileid == p &&
  active == true`. Fresh `getDocs`, not the in-memory `arenaETicketByProfile`
  map, so the check is authoritative. `active == true` mirrors the scanner,
  which refuses an inactive ticket.
- **No active ticket → alert, nothing written.** The old bare-log fallback is
  deleted. This is what guarantees `eticketref` and `product` are never null:
  a mark is now impossible without both.
- The row expands **inline** into a checkbox multi-select over the ticket's
  `producteligible` (product names via `authguard.getProductMap()`); the
  `window.confirm` is kept on top of it (operator asked to retain it).
- **One log doc per selected product**, auto-generated ids. Repeat marks are
  allowed to create additional docs.

**WHY auto ids / duplicates are acceptable:** the old scheme keyed the doc id on
the e-ticket id for idempotency, which cannot survive N docs per mark (they would
all collide). The operator accepted duplicate log rows. Per-day attendance stays
correct regardless, because `subscribeToAttendance` dedupes `mapAttendence` by
calendar date before any counting.

Also empty `producteligible` → alert, write nothing; multiple matching tickets →
use the first and `console.warn` (the approve flow upserts one per participant
per event, so this should not occur).

Service API changed: `markAttendance(profileId)` is gone, replaced by
`fetchActiveETicket(profileId)` + `markAttendanceForProducts(profileId,
eticketDocId, productIds)`.

## Pending / next

- **Not audited:** whether v1, v2, or any Cloud Function counts raw
  `arena e-ticket log` docs rather than distinct dates. That is the one place
  duplicate log rows could inflate a number. v3's own readers are all
  date-deduped and safe.
- Neither change is committed — git was blocked in the session that wrote them.
- The `EXCLUDED_PRODUCT_ID` vs per-event `heroevent` contradiction in
  `isFirstTimer()` remains open and operator-owned.
