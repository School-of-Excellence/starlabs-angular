# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-07-28 (live-event-dashboard-v3: panel filters + Procedure Tracking)_ · **New session? Read `specs/ORIENTATION.md` first**, then today's journal `specs/journals/2026-07-28-live-event-dashboard-v3-panel-filters-procedure-tracking.md`.

## Current state
- **`live-event-dashboard-v3` drill-down panel** filters on six dimensions:
  participant type + attendance log (two segmented controls, one row) and
  products / cohorts / journeys (three bordered multi-select fields, one row).
  Filter chrome cut ~203px → ~134px via an operator-approved redesign. Options
  are derived from the OPEN list with per-option counts; the cohort dropdown has
  a pinned search.
- **Procedure Tracking drill-down is one-to-many**: one row per lead (doer or
  beneficiary, following the cell clicked) with every counterpart beneath it,
  and an `x3` pill where a pair share several changeworks. Filters match the
  lead only.
- Branch `nanda-development`, `ng build` green (only pre-existing CSS warnings
  in `journey-onboarding-detail`). The operator merged an early slice upstream
  mid-session (`17b82e2`, PRs #175/#177); the rest is **local only — push is
  operator-gated**.

## Last session changes (2026-07-28) — why
- **Two data bugs found behind UI complaints.** (a) `calculateProcedureData`
  kept only the FIRST changework per doer (`if (!map.has(doerId))`) and
  discarded the rest, so a doer who worked with four people showed one — no UI
  fix was possible without this. (b) As Beneficiary · Completed ran over the
  ATC-prescribed universe while As Doer ran over all participants, so the same
  changework counted 4 / 0; completed now comes from `livechangework`,
  not-started stays on `atc_alpha` (only a prescription can be outstanding).
- **ATC completion tiers** ("25–49%") filtered the table from 25% *upwards* —
  the ceiling was silently dropped. Now filters by tier membership, not a %
  range, because the table's `Math.round(ratio*100)` column cannot reproduce a
  band computed on the raw ratio.
- **Manual attendance marks from a past day** were stamped `now` and landed on
  today. Now backdated to noon local on the card's day; today deliberately keeps
  the real click time (the irregular-arrival check reads time of day).
- **Arena Followup CW cards** silently followed the Procedure Tracking day
  filter despite being labelled "Throughout event" — given their own event-wide
  subscription.
- Also: Unique participants on the attendance card, Participant Data row-click
  opens the whole filtered table, full names in dropdowns, `ngOnDestroy` leak.
- Adversarial review workflow ran but **its verify stage silently failed** (bad
  `parallel()` call — see journal); findings triaged by hand, three real
  regressions fixed in `58d2537`.

## Pending / next
- **Operator manual test** of the Procedure Tracking panel and attendance
  backdating (writes real `arena e-ticket log` docs — test on `starlabs-test`
  first; the console logs `| credited to: <date>`).
- **Known-and-deferred, all in the journal:** the LIVE cell counts changework
  docs while the panel groups by doer (they can disagree); the live beneficiary
  cell still uses the ATC-prescribed universe; three concurrent listeners on
  `livechangework` where one would do.
- Push `nanda-development` when the operator approves.
