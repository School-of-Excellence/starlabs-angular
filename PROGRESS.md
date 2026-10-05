# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-10-05 (specialist studio testing round 2)_
· **New session? Read `specs/ORIENTATION.md` first**, then
`specs/journals/2026-10-05-specialist-studio-testing-round2.md`.

## Current state
- Branch `feature-test`: round 2 is pushed. The studio is now **one component** (tab and dialog logic as plain
  classes, shared bits and dialogs as `<ng-template>`s). Dev build clean; 90/90 studio + book-appointment specs.
- Other sessions' work on this branch (segment-board, participant-intelligence) has its own journals.
- `starlabs-cloud-function`: unchanged. Nothing deployed.

## Last session changes (2026-10-05)
- Testing report round 2, all 8 points (plan: `specs/plans/2026-10-05-specialist-studio-testing-round2.md`):
  - **Filters:** a product limits the type list ("Delivery types"). Any filter switches Week to slots, so
    Booked and Not booked no longer overlap. Group by type / Sort by time.
  - **Pickers and layout:** searchable specialist pickers; an icon-rail layout for tablet.
  - **Collaborative sessions:** they now show for every host (the calendar was deduping them to one window).
  - **Book Session:** has a Calendar mode. Open slots → pick a participant → Book, through the new shared
    `AppointmentBookingService` that Book Appointment now also uses.
  - **Add availability:** Select all delivery types.
- Then, on the operator's request, merged the 15 components into one; all hooks now use the `sas-` prefix.
- Failure, root cause: the team-table spec started failing on its own because its fake depended on today's
  date. The fake is fixed. During the merge, an `@for` track expression read a template alias and threw.

## Pending
- Live check on starlabs-test (needs a login), including a real Book-calendar booking.
- e2e suite for the studio (single `sas-` prefix).
- `dashboard` access entries for `specialistappointmentstudio` and `appointment-status-update`.
- Cloud Function deploys are blocked on Java 21 (installed: 17).
- Double booking: `cancelAppointment` reopens slots that overlap another booked session (operator: fix later);
  also consider a transaction in `AppointmentBookingService.book` and flagging existing double bookings.
