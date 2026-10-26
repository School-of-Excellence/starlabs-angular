# Shared day filter — Daily Attendance ↔ Procedure Tracking (v3)

**Status:** approved by operator 2026-07-29
**Scope:** `live-event-dashboard-v3` only

## Requirement

One day selection shared by Daily Attendance and Procedure Tracking, two-way.
Default to today when today is an event day, otherwise All Days.

## Decisions (operator sign-off, 2026-07-29)

| Question | Decision |
|---|---|
| Day-card click | **Select only.** The attendance panel opens from the card's count. |
| Scope | **These two sections only.** Video Ask Review, Arena Calling and Arena Followup keep their own independent day state. |
| State location | **Service** — extend the existing `procDayFilter`. |

## Design

`LiveEventDataService.procDayFilter` (`'all' | 'yyyy-mm-dd'`) is the single source
of truth. Both sections read and write that one field, so sync is structural —
there is no propagation code and the two cannot drift.

`applyDefaultProcedureDay()` already implements today-else-all; it becomes the
shared default rather than Procedure Tracking's private one. No change needed.

`setProcedureDay()` keeps ownership of the Firestore re-query.

### Daily Attendance

- card body → `selectDay(d)` — sets the shared day
- `.day-num` (the attendance count) → `openAttDay(d)`, `stopPropagation` so it
  opens the panel without also re-selecting
- the three stat rows (Unattended / Video Ask / VA not submitted) — unchanged
- future "upcoming" cards — unchanged, not clickable
- `[class.selected]` when the card's date is the shared day

**All Days lives on the Total approved card** (operator, follow-up 2026-07-29). `'all'`
originally selected no card, which read as "nothing selected" rather than "all days
selected" — a gap with no control. Total approved is already the all-days card by
meaning, so it takes the role: body click selects `'all'`, its count still opens the
total-approved panel via `stopPropagation`. Its "Unique" / "Absent today" rows are
unchanged.

`selected` must be legible on `.day-card.today` (dark, z-900) and `.day-card.total`
(beige) — so it is an accent ring, not a background change. The rule must sit *below*
`.today` and `.total` in the stylesheet: those set `border-color` at equal specificity,
so an earlier `.selected` would lose the cascade and only the ring would survive.

### Procedure Tracking

No change. `setProcDay()` already writes the shared field.

## Accepted consequences

- Selecting a day card re-queries `livechangework` — a round-trip per selection,
  where attendance browsing was previously free.
- Selecting a past day changes the LIVE banner in Adjustments & Procedures
  (usually hides it, since it is `*ngIf="liveCount"`). Pre-existing behavior,
  newly easy to trigger.
- Both Daily Attendance instances (frontend + backend) gain the behavior; the
  markup is identical and shares `attDays`.

## Out of scope

Unifying the day-filter vocabularies across the other three filters
(`'all'`/`'today'`/date vs `''`-means-today vs `'any'`). Noted as tech debt.
