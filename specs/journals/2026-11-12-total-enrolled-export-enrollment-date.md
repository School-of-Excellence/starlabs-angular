# 2026-11-12 — Workshop dashboard: Total Enrolled export carries the Enrollment Date

## What
`/workshop_dashboard/:id` → Total Enrolled card → side panel → Export (CSV) now has an
**Enrollment Date** column: each person's `enrollmentdate` from their
`workshop participant enrolled` doc, with the time: `formatDateTime` → `07 Nov 2026, 9:00 am`.
The first cut was date only (`formatDate`). The operator asked for the time the same day, so the cell
now carries a comma and the CSV writer quotes it (`"07 Nov 2026, 9:00 am"`).

File: `New-Workshop/workshop-dashboard/workshop-dashboard.component.ts` (`exportParticipants()`).
No new hooks; no data change (the dashboard already loads `enrollmentdate` into `enrolledParticipants`).

## Why it is shaped this way
- **Total Enrolled only.** The panel and its Export are shared by every card (Total Started, Exist Users,
  New Users Not Enrolled, Share, …). The operator asked for Total Enrolled. Some panels hold people who
  are not enrolled, where the column would always be blank. The category chips under Total Enrolled
  (`categoryEnrolled`) are left as they were too, which is easy to extend if asked.
- **Last column.** The existing six columns keep their positions, so any sheet built on the old layout
  still lines up.
- **First enrolled doc per person.** This is the same rule `buildParticipantEntry` uses (`find`), so a
  person with two enrolled docs exports the date the panel already reflects.
- A person with no enrolled doc, or no date on it, exports blank, never "Invalid Date".
  `formatDateTime` returns '' for empty input.

## Coverage
- Unit: `workshop-dashboard.export.spec.ts`. It checks the per-person dates, that the column is last,
  that the first duplicate wins, that a missing doc gives a blank, and that a non-Total-Enrolled panel
  has no column. 2/2 pass.
- Hub WS-77 (hub commit `75e2e27`, local) — since moved to `workshop-dashboard-new-exist.spec.ts` as WNE-03 and extended with Tags. It reuses WS-69's
  seed. p0 (enrolled 5 days ago) and the moved person (enrolled now) each export their own date,
  formatted (day + time) in the browser as the app does. Enrollment Date is last and the first six columns are
  unchanged. Negative control: the Exist Users Enrolled export has no such column. The spec ran
  11 passed / 0 failed.

## Pending
- Push the hub (WS-77) on the operator's "push", after a full workshops suite run.
