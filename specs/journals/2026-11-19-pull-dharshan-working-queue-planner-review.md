# 2026-11-19 — Pull from dharshan-working: queue planner review enhancements

**Operator ask:** "check dharshan-working" → "pull it". Branch tip `7a609dbc`; it already contains charan-release `2ada42c6`,
and its older queue-appointment commits came in with the 11-06 charan-staging pull, so the only new work is
`c97417aa` (Dharshan, 2026-11-19, "queue planner review enhancements") — one component, taken whole.

## What it adds (`queue system/queue-planning-review`, +820/−182)
- **Overall view filters:** specialist, participant, availability (booked / not booked), slot type (appointment / queue),
  show past days, date range; clear filters; scroll left / right / all days.
- **Appointment panel** (`panelViewType: 'appointment'`): open an appointment slot, read and add **notes**, **book** an
  appointment for a participant, **revert** an appointment.
- Per-segment appointment counts (`apptSegmentCount`); appointment-tab export reworked.

Our last change to this file (`38bae4a5`, 11-06) is in his history, so nothing of ours is reverted.

## Hooks / gate (suite `queue`)
- `qpr-revert-appointment` is gone (replaced by `qpr-planner-revert-appointment`) — hub `queue/slot-deletion.spec.ts:330`
  references it → must be updated.
- 17 new `qpr-*` hooks with no spec reference; 5 new interactive elements with no hook.
- Hooked the 5 new unaddressable elements: `qpr-appt-summary-confirmed` / `-nonconfirmed` (appointment side panel),
  `qpr-panel-revert-appointment`, `qpr-planner-appt-row`, `qpr-planner-note-close`.
- Hub: `slot-deletion.spec.ts` now references `qpr-planner-revert-appointment`; all new hooks in QSD-ADDR1. Queue specs
  that open the planner (planner-screens, queue-controls-planning-review, slot-deletion) 10/10 on the local lane.
- Book reviewed against Flutter `QueueAppointmentBooking.bookAppointmentSlot`: same four docs, same fields. Revert =
  shared `cancelAppointment` + the deployed `appointmentcancelled` CF (queue cleanup verified in the production source).

## Revert guide
`git checkout 38bae4a5 -- "src/app/queue system/queue-planning-review/"` (before commit), or `git revert <commit>` after.
