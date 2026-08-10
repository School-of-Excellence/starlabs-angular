# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-08-06 (Ads auto-notification schedule)_ · **New
session? Read `specs/ORIENTATION.md` first**, then
`specs/journals/2026-08-06-ads-auto-notification.md`.

## Current state
- Branch `nanda-development`, tree clean at HEAD `faecb355`;
  `ng build --configuration production` green (only pre-existing
  canvg/leaflet + Bootstrap warnings). The 08-01 dashboard-perf arc is
  committed/merged (operator merges via PRs, e.g. `41de2ed7`).
- Ads dialog (`/eiflixhomeconfig` → Ads tab →
  `createupcomingworkshops` in ads mode) now supports an auto
  notification schedule; not yet deployed.

## Last session changes (2026-08-06, why)
- Added to ads widgets: `autonotification` toggle → mandatory
  start/end datepickers (saved as Timestamps pinned to 12:01 am /
  11:59 pm local) + `enableappnotification` toggle →
  `appnotificationmap` with one `{title, subtitle, message,
  landingPage, sticky, logged}` card per day of the **date-only
  difference** (operator's example: Jul 22 → Jul 30 = 8) — rows
  resize with the dates but keep typed values. End must be after
  start ([min] + cross-field validator); startdate locks while `show`
  is on for an already-saved schedule (edit-mode qualifier so create
  isn't trapped). Hidden sections are *disabled* so their `required`
  validators can't block saving, and the payload nulls the schedule
  fields when off to keep doc shape consistent. Journal has the WHYs.
- Round 2: required `notifyto` audience multi-select (journey / active
  <!-- participants / non active participants / all exist users / new -->
  participants / non active participants / new
  users, stored verbatim) before the schedule; picking "journey"
  reveals a required Journeys multi-select (labels from the `journey`
  collection's `journey` field, doc ids stored in `selectedjourneys`;
  payload clears it when journey isn't an audience).
- `graphify` isn't installed here (rebuild command fails); graph is
  stale until `/graphify .` is run.

## Pending
- Operator Chrome pass on the new Ads schedule UI, then push/deploy
  when asked (build is green; nothing half-done).
- Consumer of `appnotificationmap` (the thing that actually sends the
  daily app notifications) is out of scope of the admin UI and does
  not exist in this repo change.
- Carried: phase-2 dashboard perf (scope/cache participant-metadata
  scan; bound event-wide changework / videoask-tag streams); revert
  one word in `main.ts` (firestore-atc transport) if a venue ever
  blanks ATC screens.
