# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-10-01 (specialist studio testing round 1)_
· **New session? Read `specs/ORIENTATION.md` first**, then
`specs/journals/2026-10-01-specialist-studio-testing-round1.md`.

## Current state
- Branch `feature-test`: `/specialistappointmentstudio` is pushed up to `5f480f98`. Other sessions' commits
  on top of it (participant-intelligence, participants-analytics, bigcohorts) have their own journals.
- Round-1 testing fixes are **uncommitted** in the working tree. The dev build is clean and 78/78 studio specs pass.
- `starlabs-cloud-function`: unchanged. Nothing is deployed.

## Last session changes (2026-10-01)
- Went through the testing report one item at a time; the decisions are in
  `specs/plans/2026-10-01-specialist-studio-testing-round1.md`.
- Built:
  - **Time format:** `50 min`, `1h 10m`.
  - **Range calendar:** the selected date shows immediately (a hover-specificity bug).
  - **Calendar windows:** hovering shows the types; clicking opens an Availability details dialog.
  - **Views:** Day · Week · Month on Home and Overview, Today opens Day mode, and Day has one column of
    slots per type.
  - **Filters:** product and type on Home and Book Session (a product ticks its types); Booked / Not
    booked on Home only (the stats ignore it).
  - **Bulk delete:** a select-all list of unbooked windows.
  - **Join:** opens 5 minutes before the start and closes at the end.
  - **Rename:** Settings → Delivery Type Details.
- Parked: responsive layout, Edit availability (no edit; delete and re-add), pre-assigning specialists,
  and the participant tracker.
- Failure and its root cause: the Home specs hung. An in-zone `setInterval` (the Join clock) stopped
  `whenStable` from settling. Fixed by running the clock outside the zone.

## Pending
- Commit and push of round 1: waiting for the operator.
- Live check as CW, Mentor and A&H on starlabs-test (the preview needs a login).
- e2e suite for the studio (prefixes: sas, sah, saa, sap, sal, stt, stm, smn, sut, sst, saf, saw).
- `dashboard` access entries for `specialistappointmentstudio` and `appointment-status-update`.
- Cloud Function deploys are blocked on Java 21 (installed: 17).
