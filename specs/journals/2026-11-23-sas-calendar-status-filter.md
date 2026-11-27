# 2026-11-23 — Specialist Studio calendar: cancelled in red, status filter, each appointment once

## CHANGE LOG & REVERT GUIDE

| # | Status | Scope | Files | Revert |
|---|---|---|---|---|
| 1 | uncommitted | Calendar changes 1–5 from Muskan's requests (Home / Overview calendar only) | `src/app/Scheduling/specialist-appointment-studio/sas-logic.ts`, `…/specialist-appointment-studio.component.ts`, `…/specialist-appointment-studio.component.html`, `…/specialist-appointment-studio.component.css`, `…/sas-logic.spec.ts`, `…/specialist-appointment-studio.component.spec.ts` | `git checkout -- "src/app/Scheduling/specialist-appointment-studio"` (the folder had no other uncommitted work) |

| 2 | uncommitted | Removed the Booked / Not booked toggle from the Home / Overview filter bar | `…/specialist-appointment-studio.component.ts` (FilterBar: `booked`, `showBooked`, `setBooked` gone; always emits `booked: 'all'`), `…/specialist-appointment-studio.component.html` (the 3 `sas-filter-booked-*` buttons), `…/specialist-appointment-studio.component.spec.ts` | Same folder checkout as #1 (the two are interleaved in the same files) |

| 3 | uncommitted (2026-11-24) | Changes 6–10: Past sessions date range + status buttons with counts, no-shows under Cancelled, product under the participant, red Cancelled pill, Join as a button | `…/specialist-appointment.service.ts` (`pastBetween` added, `pastPage` removed), `…/specialist-appointment-studio.component.ts` (`RangePicker`, HomeTab past state, `APPT_PILL.Cancelled` → `is-danger`, `PAST_OPTIONS` gone), `.html` (Past sessions card, Join), `.css` (`.sas-dr*`, `.sas-join`), `.component.spec.ts` | Same folder checkout as #1 (all three are interleaved in the same files) |

| 4 | uncommitted (2026-11-24) | Past sessions follow the top period (date-range picker removed); Home lists capped with inner scroll | `…/specialist-appointment-studio.component.ts` (`RangePicker` + Show all removed, `loadPast` reads the period), `.html` (picker, Show all gone; `is-capped` on the Week/Day grid, Availability, Upcoming, Past), `.css` (`.sas-dr*` gone, `.is-capped` rules), `.component.spec.ts` | Same folder checkout as #1 |

| 5 | uncommitted (2026-11-24) | Taller calendar grid; lookup → Book opens By participant with the participant picked | `…/specialist-appointment-studio.component.css` (grid max-height), `…/specialist-appointment-studio.component.ts` (`bookStep(productId, typeId, participantId)`, `BookTab.participantId`), `.html` (Book button passes `lk.participantId`; `<app-book-appointment [participantId]>`), `.component.spec.ts`; **`src/app/Scheduling/book-appointment/book-appointment.component.ts`** (new `participantId` input) + its spec | Studio folder as #1, plus `git checkout -- "src/app/Scheduling/book-appointment"` (that folder had no other uncommitted work) |

| 6 | uncommitted (2026-11-24) | Summary cards: Total = Booked + Not booked + Delivered + Cancelled, then Utilisation | `…/sas-logic.ts` (`summaryHours`), `…/specialist-appointment-studio.component.ts` (`HomeTab.summary` replaces `hours`), `.html` (six cards), `.css` (`.is-bad`, `.sas-stat-warn`), `sas-logic.spec.ts`, `.component.spec.ts` | Studio folder as #1 |

| 7 | uncommitted (2026-11-27) | Queue Planner reservations block delete and are shown | `…/specialist-appointment.service.ts` (`queueHolds`, `QueueHold`), `…/specialist-appointment-studio.component.ts` (`HomeTab.holds`, `heldBy`, `holdNote`, `canDelete`, `deleteWindow` guard, `WindowDialog.holds`), `.html` (window card, Availability row, window dialog), `.css` (`.sas-queue*`), `.component.spec.ts` | Studio folder as #1 |

The files change together; reverting one alone breaks the build (the template calls `setCalF`,
`cardStatus`, `dayHasCards`, `calCounts`, which live in the component and use `sas-logic` helpers).

## What was asked

Muskan Chauhan's requests in #dfu-sprint (23 Nov), designed by Prakash S in the Appointments prototype
(screenshots artifact `7ZQzF7oTddpKZsAdGsguwX`, prototype `7boanmQk4MgRRSFjyCAKpT`). 13 changes were
listed; the operator asked for **1–5 (the calendar)** first. 6–13 (Past sessions filters and date range,
who-cancelled column, Join button, My Participants page, A&H Participants page) are later.

| # | Change | How it landed |
|---|---|---|
| 1 | Cancelled sessions red | `APPT_CHIP.Cancelled` → `st-cancel` (red strip + danger tint; was grey struck-through `st-off`). Card status line = `cancelLabel()`: "Cancelled", or "Cancelled · no-show" |
| 2 | Legend on top as a status filter with counts | `.sas-calf` row of 7 toggles + Show all; `HomeTab.calF` / `calCounts` / `setCalF()`. Bottom legend stays for Day view and the filtered (slot) views |
| 3 | Each appointment shows once | `windowShown(state, sessions)`: a window gets a card only while it has an open start time or never held a session (cancelled included). Its sessions then stand alone (`is-solo`, not indented; in all-specialists mode they name the specialist) |
| 4 | Month view: a count per status per day | `HomeTab.monthLines()`: shown windows (time + open/unused), then "N booked / in session / completed / pending / cancelled" in each status colour. Status filter applies; the Joint line hides while a filter is on |
| 5 | Full names on week cards | Participant and session on their own wrapping lines (`small.w`); the status line and a standalone card's specialist line wrap too |

## Why it is built this way

- **Who cancelled is not shown (operator, 2026-11-23).** A first cut read it from `cancelledreason`
  ("Cancelled By Client / Specialist / Integrator"), but most cancel paths write no reason (the
  participant's own cancel via `requestApptCancel`, `approveOfftime`, profile clean-ups), and the operator
  said who-cancelled is not required. So the card says "Cancelled", and only a no-show
  ("Client didn't show up") says "Cancelled · no-show". The planned `cancelledby` field (phase 2) is dropped.
- **No data writes.** Everything is display logic over the data `HomeTab.load()` already reads; the
  filter calls `apply()`, which does no Firestore reads either. Operator rule for this work: the screen
  is on production data, so nothing may update it.
- **Window colour bucket**: a window shown on its own reads as `open` or `unused` (`windowCal`). A future
  window with no open start times and no sessions (rare) also lands in `unused`; its month line says
  "no open times" rather than "unused".
- **Literal hooks.** The 7 filter buttons are written out, not `@for`-generated, so each
  `data-testid="sas-home-calf-…"` is a literal the readiness gate can scan.
- The old comment on `NO_SHOW_REASON` ("the screen never shows no-show") is superseded: Round 2 asks for
  "Cancelled · no-show" on the card.

## Verified

- `npx tsc -p tsconfig.app.json --noEmit` clean.
- Studio unit specs: 106/106 (after dropping who-cancelled) (`ng test --include='src/app/Scheduling/specialist-appointment-studio/**/*.spec.ts'`).
  New: card labels (no-show vs plain Cancelled), session/window buckets, each-once rule; component cases for
  the all-specialists week (open window kept, full one hidden, counts, Booked filter) and a cancelled-only
  window (red cards, "Cancelled" / "Cancelled · no-show", Cancelled button red, month "2 cancelled"). One existing case updated: its
  full windows no longer draw their own card (intended).
- Read-only look on the operator's 4200 dev server (production project), week of 23–29 Nov, all
  specialists: filter counts Open 101 / Booked 41 / In session 0 / Completed 17 / Completion pending 2 /
  Cancelled 13 / Unused 9; 110 window cards = 101 + 9, 73 session cards = 41 + 17 + 2 + 13; Cancelled
  filter → 13 red cards, 0 windows; after dropping who-cancelled all 13 read "Cancelled". Month view shows per-status day counts. Only console error: the usual
  FCM permission-blocked. Nothing was saved.

## Operator decisions (2026-11-23, after the first cut)

- Who cancelled: not required (see above).
- "Completion pending" stays as the label for an ended, unmarked session.
- The old **All / Booked / Not booked** toggle is removed: the status filter covers it. `SasFilter.booked`,
  `windowMatchesBooked` and `dayColumns(…, booked)` in `sas-logic` stay (Book Session and the logic tests
  use them); Home now always passes `'all'`, so the calendar's slot mode turns on only for a product or
  delivery-type filter.
- Day view and the product / type filtered views keep the bottom legend and get no status filter.

## 2026-11-24 — changes 6–10 (Past sessions and Join)

| # | Change | How it landed |
|---|---|---|
| 6 | Product filter | **Reuses the filter bar above the calendar** (it already applied to Past sessions through `apptMatches`) instead of a second product dropdown in the card; the card line names the picked product. Product shows under the participant's name (`productName`, from the filter bar's product list) |
| 7 | Date range | `RangePicker`: one field opens a two-month calendar (first click From, second To, days after today disabled) with All time / Last 7 days / Last 30 days chips. **Default Last 30 days** |
| 8 | Status buttons with counts | All · Completed · Cancelled · Completion pending, literal buttons `sas-home-past-st-*`; counts follow the dates and the product / type filter; Cancelled count red when not zero. **Default All** (was Pending) |
| 9 | No-show under Cancelled | No-shows count under Cancelled; the badge reads "Cancelled" in red and "No-show: the participant did not join" sits under it; other cancellations keep their stored reason under the badge, as before. No who-cancelled column. The table never had a Product column, so nothing to drop |
| 10 | Join | `sas-link` → filled `sas-btn sas-join`. **Destination changed (operator, 2026-11-24)**: Join now goes to the Appointment Studio, `router.navigate(['/appointmentstudio'])`, in the same tab; the specialist joins from there. That screen takes no appointment id, so none is passed. Still enabled 5 min before the start until the end; the `zoomdata` check is gone (it only guarded the old Zoom viewer). Was: `/openappointmentzoom/:id` in a new tab. Applies to both Join buttons (Upcoming table and Day-view slots), which share `join()` |

Why:
- **Whole range read, not Load more.** Counts must cover every session in the range, so `pastBetween` reads all
  sessions that ended in [from, to] in pages of 500 (same `hosts` + `endtime` index as before), capped at
  3000 with a "pick a shorter range" note. The range is by session date: the query bounds `endtime`, then rows
  are trimmed by `start`. Default Last 30 days keeps the A&H all-specialists read small (417 sessions on
  24 Nov); All time is one chip away.
- **Status and product are in memory** (`applyPast`), so switching them does no reads; only a new date range reads.
- "Show all N" replaces Load more and keeps the old `sas-home-past-more` hook id; rows, Update status, empty
  state and Join keep theirs, so the hub spec needs fewer changes.
- The red Cancelled pill (`APPT_PILL`) applies to every studio table (Upcoming, Past, participant lookup), matching
  the prototype's "badge is red instead of grey".

Verified (2026-11-24): `tsc` clean; studio specs 107/107 after the Join change (Join → /appointmentstudio, closed outside the 5-minute window) (Past-sessions cases rewritten: 30-day default and counts,
status narrowing and Show all, red badge + no-show note, date range re-read, no future days; two existing cases
adjusted for the All default and a search word). Read-only on the 4200 dev server (production), all specialists:
last 30 days All 417 = Completed 271 + Cancelled 131 + Completion pending 15; Last 7 days 107 = 61 + 37 + 9;
Cancelled list all red "Cancelled" pills with "No-show: …" / stored reasons; 43 Join buttons (after the destination change: page compiles, none enabled at check time, Join not clicked); picker at phone
width disables days after today. Nothing saved; Update status and Join were not clicked.

## 2026-11-24 (later) — Past sessions follow the top period; lists stop growing the page

Operator: "remove the calendar under the past sessions, let the overall calendar at top work" and "the calendar
grid, availability, upcoming sessions and past sessions should not be infinite scrolling, limit it".

- **The date-range picker (change 7) is gone.** Past sessions now reads the sessions that ended in the period
  picked in the top bar (Day / Week / Month + arrows), like the stats, calendar and Availability. A future period
  shows "No past sessions in this week". The end-time bound runs one day past the period so a session that starts
  in it and ends just after is kept; rows are trimmed by start time. Counts and status buttons are unchanged.
- **Show all is gone**: every matching row is listed inside a scrolling box; the line under it says "N sessions".
- **Capped heights** (`is-capped`): Availability, Upcoming and Past tables max 440px with a sticky header row;
  Week grid (plain and filtered) and Day columns max 620px with sticky day headers. Month grid is fixed-size, untouched.
- Hooks removed: `sas-home-past-range*`, `sas-home-past-more` (the hub's ADDR check at spec line 384 uses
  `sas-home-past-more`). Added `sas-home-past-count`.

Verified: tsc clean; studio specs 106/106 (past tests now set a period that holds the 60-hour fixture, plus a
day period and a future week). Read-only on 4200, week 23–29 Nov, all specialists: no picker; Past 25 =
Completed 17 + Cancelled 6 + Completion pending 2, all 25 rows in a 434px box; Week grid 614px of 14,887px,
Availability 434px of 67,711px, Upcoming 434px of 3,510px; day headers stay pinned while the grid scrolls.

## 2026-11-24 (later) — taller grid; lookup → Book picks the participant

- **Calendar grid height**: `max(720px, calc(100vh - 220px))` (was 620px) — most of the screen, never under 720px.
  Availability / Upcoming / Past stay at 440px.
- **Participant lookup → Book**: the Book button on a ready step used to open Book Session's **Calendar** tab with
  only the product and type set. It now opens the **By participant** tab with the participant already picked
  (operator). `bookStep` takes the lookup's `participantId`; `BookTab.participantId` feeds a new
  `@Input() participantId` on `BookAppointmentComponent`, which picks it exactly like `/bookappointment?pid=…`
  (sets `selectedUser`, calls `onProfileSelect()`, read-only). It waits for the roles and only acts for an A&H role
  (`superRole`); anyone else keeps booking for themselves. `/bookappointment` itself is unchanged (no input there).

Verified: tsc clean; specs 122/122 across the studio and book-appointment folders (new: bookStep → participant
tab + filters; the input picks after the roles load, never twice, and never for a non-A&H user). Read-only on
4200 (pane hidden, so driven by page scripts): grid max 720px on an 899px pane; EI Solution → lookup participant
"Akhilandeshwari Sivaswami" → Book → Book Session, By participant on, participant picked in the booking
component, product EI Solution, type EI Review. Nothing booked.

## 2026-11-24 (later) — summary cards that add up

Operator: changes 11–13 are **not needed** (dropped). Summary cards in the order
**Total available · Booked · Not booked · Delivered · Cancelled · Utilisation**, and "if I sum all, how do I
arrive at the total?" — so the four middle cards are now a partition of the total (`summaryHours`):

- Total available = availability window hours (unchanged value; keeps the `sas-home-stat-available` hook).
- Booked = sessions booked and not completed yet (upcoming, in session, ended-unmarked), with
  "Xh · N sessions need a status update" (the ended-unmarked part) in amber when N > 0.
- Not booked = Total − Booked − Delivered − Cancelled, floored at 0 ("Available" renamed, summary only);
  the old "still open to book" hours sit under it.
- Delivered = sessions marked completed ("Marked completed · N sessions").
- Cancelled = cancelled sessions incl. no-shows. Utilisation = Delivered ÷ Total. The Unutilised card is gone
  (it double-counted Booked and Cancelled).

Why the numbers moved from the old cards: Booked used to be the union of booked *slot* time in the windows
(124h 30m on 23–29 Nov) and now is session time not yet completed (74h); and in the all-specialists view a
joint session now counts once per specialist, because it uses each one's window time — Delivered went 29h →
41h 30m, Utilisation 6% → 9%. A cancelled slot booked again counts in both Cancelled and Booked, so Not booked
absorbs it. Only the Home / Overview cards changed; Team, Mentors and Utilisation tabs still use `hoursSummary`.

Verified: tsc clean; specs 125/125 (new: the four parts add up, per-host joint count, Not booked never negative).
Read-only on 4200, Overview, 23–29 Nov, all specialists: Total 479h 40m = Booked 74h + Not booked 342h 10m +
Delivered 41h 30m + Cancelled 22h; Booked shows 43 sessions, "3h · 2 sessions need a status update".
Hub SAS-03 asserts the old slot-union Booked ("1h 45m") and "still open to book" under Booked — re-derive both.

## 2026-11-24 (later) — Booked and Not booked notes that add up

Operator: the small "307h still open to book" under Not booked was unclear next to the big number, and Booked
"also not clear". Both notes are now two parts that add up to the card's number:

- **Booked = upcoming + ended, needs a status update**: "71h upcoming · 41 sessions" and, amber when any,
  "3h ended, needs a status update · 2 sessions" (74h on 23–29 Nov). Upcoming includes sessions in progress.
- **Not booked = still open + passed or unusable**: `HomeTab.notBookedSplit` — open = the future free start-time
  hours (`openMin`), capped at Not booked (a re-opened cancelled slot also counts in Cancelled); rest = time that
  passed with no booking or future gaps no start time fits ("307h 15m still open · 34h 55m passed or unusable").

Hooks: `sas-home-stat-upcoming`, `sas-home-stat-pending`, `sas-home-stat-notbooked-split`. Specs 126/126 (new: the
split adds up and caps). Read-only check on 4200 as above. Note: with all specialists the cards take a few seconds
— a "Loading hours…" placeholder sits in their place meanwhile.

## 2026-11-24 (later) — summary cards open the data behind them

Operator: clicking a card should take you to the data behind its number, with the matching filter on.
`HomeTab.showCard()` sets the filter and scrolls to the section. Destinations were chosen so the count there
equals the card's for the same period:

| Card | Goes to | Filter |
|---|---|---|
| Total available | Availability table | (the period's windows) |
| Booked | Calendar | Booked + In session + Completion pending |
| Booked → "upcoming" line | Calendar | Booked + In session |
| Booked → "needs a status update" line | Past sessions | Completion pending (rows carry Update status) |
| Not booked | Calendar | Open for booking + Unused |
| Delivered | Past sessions | Completed |
| Cancelled | Calendar | Cancelled — not Past, which lists only ended sessions and undercounts future cancellations |
| Utilisation | not clickable (a ratio) | |

The calendar status filter (`calF`) is now a list (`CalStatus[]`, empty = all) so a card can switch on several
statuses; the legend buttons still select one at a time (`setCalF`), `isCalF` / `calOn` drive the template. In
Day view or with a product / type filter the calendar has no status filter, so those cards just scroll to it.

Verified: specs 127/127 (Booked / Not booked set the right statuses and narrow the week; Delivered / pending set
the Past filter). Read-only on 4200, 23–29 Nov, all specialists: Booked 43 → 43 sessions; Cancelled 13 → 13;
Delivered 17 → 17 Past rows; needs update 2 → 2 rows; Not booked → 110 open/unused windows; Total → Availability
(172 windows) scrolled into view.

## 2026-11-27 — Queue Planner reservations (option A)

Operator: availability that the Queue Planner has taken can still be deleted here, and the planner keeps a
reference to the deleted doc.

The flow, traced:
1. Studio / Add availability → `availability/{id}`; `computeSlot` cuts slots (`available: true, booked: false`).
2. Queue Planner `saveAppointmentSlots` reserves a slot by writing a **`queue availability`** doc
   (`slottype: 'appointment'`, `availabilityid`, `hostref`, `startdate` / `enddate`, `appointmentref: null`,
   `bookedby: null`). **It never touches the availability doc**, so the slot still reads free.
3. The participant books it in Flutter (`Delivery Queue/queueAppointment.dart`): one transaction marks the slot
   `booked`, closes overlapping slots, creates the appointment (`queueref`, `slotdata`) and fills `bookedby` /
   `appointmentref` on the queue doc.

The studio's delete rule only looked at the availability doc (future + no slot booked), so between steps 2 and 3
a reserved window could be deleted, one by one or in bulk. Then the queue doc points at a missing doc; Flutter's
`filterBookableSlots` drops the slot silently (the participant just stops seeing it) and booking throws
"No Availability"; the planner still lists the reservation. The appointment type carries no queue flag in code —
the planner takes the type from the queue stage's `actionresource`; the only `queue_appointment` flag in code is a
participant flag (Participants Analytics).

Fix A (studio only, reads only): `queueHolds(from, to)` reads `queue availability` with the planner's own query
(`slottype == 'appointment'`, `startdate` in the calendar range) and names the queue from
`queue generation.queuename`. Unbooked, not-ended reservations are keyed by `availabilityid`. `canDelete` (row
checkbox, Select all, the dialog's Delete) also requires no reservation; `deleteWindow` alerts with the queue,
stage and time and stops before the confirm. The window card, the Availability row and the window dialog say
"Reserved for queue: <name> · N slot(s)". A booked reservation does not block (the slot itself is booked then).
Not done here (option B): regular booking still sees a reserved slot as free.

Verified: tsc clean; specs 128/128 (new: a reserved window can't be deleted or bulk-selected and the alert names
the queue; a booked reservation and a free window stay deletable). Live check pending: the signed-in browser tab
was gone and the new one is at the login page.

## 2026-11-27 — report D: reservations pointing at deleted availability (production, read-only)

Run with the operator's gcloud login, Firestore REST `:runQuery` / `:batchGet` only (script in the session
scratchpad, not the repo). `queue availability` with `slottype == 'appointment'`: **472 reservations** over 82
availability docs, **5 docs missing → 22 broken reservations**, all in "A&H Evolution Preparation Event -
November 2026", stage Scope Enhancement:

| When (IST) | Specialist | Reservations | Availability doc (deleted) |
|---|---|---|---|
| Tue 1 Dec 14:30–16:30 | Nalluri Geethika | 5 (one per segment) | RUghSU5JTBLyTt8U376Y |
| Wed 2 Dec 14:30–16:30 | Nalluri Geethika | 5 | HMJiNQ76IdQUuor63xqp |
| Thu 3 Dec 14:30–16:30 | Nalluri Geethika | 5 | nWTkZRnmFxXUb4HvAsb9 |
| Mon 16 Nov 14:30–16:30 (past) | Afshan Banu | 6 | otoTvO8BMutHqV38ZF3N |
| Tue 17 Nov 14:30–16:30 (past) | Afshan Banu | 1 | RAZYRs7KMd7QM3kJCAod |

All 22 are unbooked. The 15 future ones are live: participants of that queue cannot see or book Scope
Enhancement on 1–3 Dec (Flutter drops a slot whose availability doc is missing), while the planner still lists
them. Re-adding availability does not repair them — a new window gets a new doc id; the planner has to remove and
re-reserve those slots against the new window. Other counts: future reserved & ok 76, future booked 9, past
booked 40, past reserved-never-booked 325.

## Pending

- **e2e before push**: `hook-diff.py … appointments` flags 12 new hooks (`sas-home-calf*`,
  `sas-home-month-count`, `sas-home-session-status`, `sas-home-session-who`). Drive them in an
  `appointments` suite case (seed a no-show and a plain cancellation, plus a live booking as the
  negative control) or register them in an ADDR block before pushing.
- The hub spec `appointments/specialist-appointment-studio.spec.ts` still references removed hooks: lines 397–399
  `sas-filter-booked-all/-booked/-open`, and lines 176/185 drive the old `sas-home-past-filter` mat-select
  (SAS-04) — rewrite that case on the `sas-home-past-st-*` buttons; line 384 checks the removed `sas-home-past-more`. `hook-diff.py` now lists 4 missing and
  27 unreferenced (the calendar, date-range and status hooks).
- Changes 11–13: dropped by the operator (not needed).
