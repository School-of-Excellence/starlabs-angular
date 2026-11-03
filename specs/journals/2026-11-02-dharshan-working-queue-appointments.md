# 2026-11-02 — Pull dharshan-working → charan-release (queue appointment slots + participants flag)

## What
Operator: "pull all" from `origin/dharshan-working`. Three Dharshan commits not on charan-release
(merge-base `4b4cf8ec`, 2026-10-28):

- `e7398263` queue appointment system — queue planning screen
- `fcc380ce` appointment slots in queue
- `cc0cdf28` queue appointment system + migration of queue planner review

Applied as a 3-way patch of `merge-base..origin/dharshan-working` (not a branch merge), so
charan-release's own edits to the same files (participants-analytics) are kept. All 12 files applied
cleanly; `tsc -p tsconfig.app.json --noEmit` exit 0.

## Why one batch
Screens 1–4 are one feature: an appointment slot created in the planner is what the review screen
lists/reverts and what dynamic studio shows on the waiting token. Pulling a subset would leave
half a feature. The participants flag (5) is independent but came in the same commit range.

## Watch-outs
- Planner writes `queue availability`, `queue generation`, `queue planning`, `queue planning draft`
  and reads `availability` (host appointment availability).
- `qpr-apptcard-<stage>` is a bound (non-literal) test id — the readiness gate drops it; the review
  file already had bound ids (`qpr-livequeue-row-…`). Sort out at e2e-coverage time before push.
- The `Revert Appointment` button and the planner's Queue/Appointment slot-type buttons have no
  `data-testid` yet.

## Revert guide (per screen)
Base = `git merge-base HEAD origin/dharshan-working` (`4b4cf8ec`). To revert one screen, restore its
files from the commit before this pull lands (or from `4b4cf8ec` if nothing else touched them):

| Screen | Files |
|---|---|
| Queue planner (`/queue-planner`) | `src/app/queue system/queue-planning/queue-planning.component.{html,ts}` |
| Queue planner review (`/queue-planner-review`) | `src/app/queue system/queue-planning-review/queue-planning-review.component.{html,ts}` |
| Queue creation v3 | `src/app/queue system/queue-creation-v3/queue-creation-v3.component.{html,ts}` |
| Dynamic studio (`/dynamicstudio`) | `src/app/queue system/dynamic-studio-v2/dynamic-studio-v2.component.{css,html,ts}` |
| Participants analytics — flag modal | `src/app/Participants Profile Management/participants-analytics/participants-analytics.component.{css,html,ts}` — revert only the flag hunks (`openFlagModal`, `flagForm`, `pa-flag-*`); other hunks in these files are charan-release's own |

Reverting 1–4 must be done together (shared appointment-slot data shape).

## Participant side — breakthroughs-flutter (2026-11-03)
Operator: "pull 1-4 into a new charan-release branch". New local branch `charan-release` cut from
`origin/development` (`f1f586c`; no upstream set) in `~/Projects/Flutter/breakthroughs-flutter`.
Applied Dharshan's `6d874af` + `4b49d6d` for 4 files only; each is byte-identical to
`origin/dharshan-working`. `pubspec.lock` left out (unexplained downgrades + a 4→5 major bump with
no pubspec.yaml change). `flutter analyze` on the 4 files: 0 errors, 43 info lints.

This is what fills the web side's empty fields: `queueAppointment.dart` books in one transaction —
marks the time booked in `availability`, creates an `appointments` doc (with `queuetokenref`), and sets
`bookedby` / `appointmentref` on the `queue availability` slot. Queue + home slot booking move from
`queue planning` to `queue availability`.

Revert (Flutter): `queueAppointment.dart` is new — delete it; restore the other three from
`origin/development`: `lib/Delivery Queue/queueControl.dart`, `lib/Main Screen/homeContent.dart`,
`lib/Widgets/requestScopeEnhancement.dart`. Revert together with web screens 1–4.

## Flow gaps found (2026-11-03 review, web + Flutter + CF)
Third piece exists: starlabs-cloud-function `origin/dharshan-development` (`3faca28`, `65fa9a2`) —
token creation writes `bookedslot` (not `selectedstageslot`), slot-confirmation trigger watches
`bookedslot`, appointment cancel releases the `queue availability` slot + token `bookedslot`,
`appointmentbooked` skips queue appointments. Not pulled.
Operator 2026-11-03: no live queues; past queues out of scope → migration gap dropped.
1. Three repos must ship together; old mobile builds keep reading `queue planning`.
2. ~~No migration~~ — dropped (no live queues, past queues ignored).
3. Web readers still on old field/collection: planner seat counts (`queue-planning.component.ts`
   ~637, ~1391), queue manager, queue-web-version1, events-stage-data, planning engine,
   manage-participantlist-dialog, queue-planning-clone.
4. ~~Appointment slots only for `queue_appointment == true`~~ — intentional (operator 2026-11-03).
5. Planner holds specialist time without blocking it in `availability` — regular booking
   (app Book Appointment, web appointment calendar) still sees it free; specialist's own slot view
   doesn't show the queue hold; editing availability can remove the time underneath the queue slot.
6. Cancelled before token exists → `participantsproduct.requestedslot` keeps the dead appointment.
   Cancel = web only (queue review Revert, appointment calendar, specialist appointment studio);
   the app has no cancel. Token is created only when the queue deliverable turns `ready`
   (participantproduct.js, skipped while queue `totalcapacity` is full) — can be days later.
7. Partial writes: appointment created but token/product write fails → orphan appointment holds slot.
8. queueControl shows "Slot booked successfully!" even after a failed booking.
9. Admin cannot book an appointment slot for a participant on web (review skips appointment slots).
10. Booking blocks overlaps only within the same appointment type; cancel frees all types. The
    normal app booking (`Scheduling/Book Appointment.dart`) blocks across all types.
11. Group appointment types (planner lists `groupappointment == true`) are booked as one seat:
    queue booking sets `booked: true`, ignoring `maxbooking` / `totalbooked` that the normal flow uses.

## Pending
- Not committed (awaiting operator).
- e2e coverage (screen-e2e-coverage) for the new planner/review/studio/flag UI before push.
