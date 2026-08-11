# PROGRESS — StarLabs (atctranscription)

_Last updated: 2026-08-11 (Ads auto-notification: funnel-only audience)_ ·
**New session? Read `specs/ORIENTATION.md` first**, then
`specs/journals/2026-08-06-ads-auto-notification.md` (all 3 rounds of this
feature, with WHYs).

## Current state
- Branch `nanda-development`, tree clean at HEAD `63a244b4`;
  `ng build --configuration production` green (only pre-existing
  canvg/leaflet + Bootstrap warnings). Not pushed/deployed.
- Ads dialog (`/eiflixhomeconfig` → Ads tab → `createupcomingworkshops`
  in ads mode) has the full auto-notification feature: `autonotification`
  → required `notifyto` audience multi-select + start/end dates (pinned
  12:01 am / 11:59 pm, end > start, startdate locks while `show` is on)
  → `enableappnotification` → `appnotificationmap` with one card per
  date-difference day. Audience sub-selects: `journey` →
  `selectedjourneys` (journey collection doc ids, labels from `journey`
  field); `funnel only` → `selectedfunnels` (workshopconfiguration doc
  ids where `evergreenWorkshop == true`, labels from `detailpage.title`).

## Last session changes (2026-08-11, why)
- Added the `funnel only` audience + Funnel Workshops picker (round 3) —
  mirrors the journeys pattern exactly: hidden sections are disabled so
  `required` never blocks save; payload clears `selectedfunnels` unless
  `funnel only` is chosen. Committed `63a244b4`.
- Found an operator hand-edit from between sessions: `'all exist users'`
  commented out of `notifyToOptions`. Preserved — deliberate removal,
  do not restore.

## Pending
- Operator Chrome pass on the Ads auto-notification UI, then push/deploy
  when asked (build green; nothing half-done).
- Consumer of `notifyto`/`selectedjourneys`/`selectedfunnels`/
  `appnotificationmap` (whatever sends the daily notifications) is not in
  this repo — admin UI only writes the schedule.
- Carried: phase-2 dashboard perf (scope/cache participant-metadata scan;
  bound event-wide changework / videoask-tag streams); revert one word in
  `main.ts` (firestore-atc transport) if a venue ever blanks ATC screens.
- `graphify` module not installed here — graph stale until `/graphify .`.
