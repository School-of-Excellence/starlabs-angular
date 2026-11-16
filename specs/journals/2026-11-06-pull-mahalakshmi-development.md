# 2026-11-06 — Pull from mahalakshmi-development onto charan-release

**Operator ask:** "pull all except 2 and 3" (2 = `delivery-dashboard-new` screen, 3 = its route in `app.routes.ts` — dropped, same as the 11-04 attempt).

## What was taken
`charan-release` (36b62f1c) is an ancestor of `origin/mahalakshmi-development`, and every commit touching
the files below in `HEAD..origin/mahalakshmi-development` is Mahalakshmi's own (bb5bca74 … 878e0671), so
each file was taken whole with `git checkout origin/mahalakshmi-development -- <file>` and verified
byte-identical. Her `development` merges (journals, New-Workshop files) were excluded.

| File | Change |
|---|---|
| `Journey Onboarding/delivery-dashboard-clone` (html, ts) | delivery report / stuck cases / weekly report (+273) |
| `Journey Onboarding/team-evolution-dashboard.component.ts` | `OngoingParticipant` interface |
| `Product Designer/delivery-sequence.component.ts` | delivery dashboard + videoask changes |
| `Product Designer/delivery-set/update-delivery` (html, ts) | queue-appointment checkbox, `onAppointmentCheckboxChange()`, submit uses `getRawValue()` |
| `authguard.service.ts` | `cancelAppointment` async; keeps group slots with remaining bookings |
| `Scheduling/book-appointment/appointment-booking.service.ts` | group appts: slot free until `maxbooking` reached (`getCountFromServer`) |
| `Scheduling/book-appointment/book-appointment.component.ts` | group appt / weekly report |
| `ATC/view-assigned-atc.component.ts` | date format `hh` → `HH` (24h) — code only, no ATC test/data touched |

## Checks
- Nothing outside the dropped folder references `delivery-dashboard-new`.
- `npx tsc -p tsconfig.app.json --noEmit` → exit 0.

## Hooks added (ours, not Mahalakshmi's)
`update-delivery.component.html`: the `ischangeworkrequired` and `groupappointment` checkboxes gained
`(change)` → the gate counts them as new interactive elements. Hooked `ud-appt-changework`, `ud-appt-group`.
Spec refs for those + her 9 Weekly Report hooks (`ddc-btn-130 … ddc-btn-138`) landed in the hub
(`journey/delivery-dashboard-stuck.spec.ts` DDC-WR-01 / DDC-ADDR2, `journey/product-designer-addressable-dialogs.spec.ts`;
hub journal `specs/journals/2026-11-06-ddc-weekly-report-ud-appt-hooks.md`).

## Tests (emulator lane, run before commit, on this tree + origin/development's 8 workshop files overlaid)
| Suite | Result |
|---|---|
| journey | 102 passed, 29 skipped |
| appointments | 63 passed, 6 skipped |
| workshops | 145 passed, 33 skipped |

`authguard.service.ts` is cross-cutting, so the gate lists every suite; only the three owning suites
were run locally. The rest (queue, business, comms, … atc) were NOT run here.

## Revert guide
`git checkout 36b62f1c -- <file>` for any row above (per-screen).
