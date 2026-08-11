# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-08-11 (Ads funnel-only audience · New Users workshops
filter)_ · **New session? Read `specs/ORIENTATION.md` first**, then
`specs/journals/2026-08-06-ads-auto-notification.md` (ads feature, 3
rounds) and `specs/journals/2026-08-11-newusers-workshop-filter.md`.

## Current state
- Branch `nanda-development`, tree clean at HEAD `76275f01`;
  `ng build --configuration production` green (only pre-existing
  canvg/leaflet + Bootstrap warnings). Not pushed/deployed.
- Ads dialog (`/eiflixhomeconfig` → Ads tab) has the full
  auto-notification feature: `autonotification` → required `notifyto`
  audiences (+`selectedjourneys` for `journey`, +`selectedfunnels` for
  `funnel only` = evergreen workshopconfiguration docs) → start/end dates
  (pinned 12:01 am / 11:59 pm, end > start, startdate locks while `show`
  on) → `enableappnotification` → `appnotificationmap`, one card per
  date-difference day.
- New Users screen (`/newusersprofile`) has a Workshops multi-select
  filter after Select-by-tags: all `workshopconfiguration` docs (label
  `detailpage.title`), filters rows to profileids found in
  `workshop participant enrolled` for the selected workshops.

## Last session changes (2026-08-11, why)
- Ads round 3: `funnel only` audience + Funnel Workshops picker
  (`63a244b4`). Preserved operator hand-edit: `'all exist users'`
  commented out of `notifyToOptions` — deliberate, do not restore.
- New Users workshops filter (`a9bc6b51`, reworked `76275f01`): now the
  same button+mat-menu UI as Select-by-tags; enrolled sets cached per
  workshop with a token guard against out-of-order async; predicate hides
  rows while loading (no unfiltered flash); clear-all resets it. While
  active, a Workshop column (after Tags) shows each row's enrolled
  selected workshops as pills — from the cached per-workshop reads only
  (the enrolled collection is huge; never scanned whole). Enrolled
  queries are one-shot, not live.

## Pending
- Operator Chrome pass on both features, then push/deploy when asked
  (build green; nothing half-done).
- Consumer of the ads notification fields (sender job) is not in this
  repo — admin UI only writes the schedule.
- Carried: phase-2 dashboard perf (scope/cache participant-metadata scan;
  bound event-wide changework / videoask-tag streams); revert one word in
  `main.ts` (firestore-atc transport) if a venue ever blanks ATC screens.
- `graphify` module not installed here — graph stale until `/graphify .`.
